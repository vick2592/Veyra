// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external;
}

/// @dev Only the slice of CapabilityRegistry this contract needs. Keeping it narrow
///      means the audit contract can evolve without redeploying the gate.
interface ICapabilityRegistry {
    function isRevoked(address agent) external view returns (bool);
}

/// @title  VeyraRegistry
/// @notice The authorization gate. Holds each user's secrets as ciphertext and lets a
///         World ID-verified human authorize an agent to use one of them.
///
/// @dev    WHAT THIS CONTRACT DOES NOT DO: it never encrypts or decrypts anything.
///         Solidity cannot hold a secret — every byte here is public and permanent.
///         All cryptography happens server-side with a Ledger-held BIP32 master seed:
///         the server derives a per-user leaf key at `leafIndex`, encrypts with it, and
///         stores only the resulting ciphertext here.
///
///         Consequences worth stating plainly, because on-chain storage is NOT simply
///         "more secure than a database":
///           - Ciphertext published here is permanent and world-readable. Anyone can
///             archive it today and decrypt it the day the Ledger seed leaks. There is
///             no delete, and `revokeSecret` only clears the active flag — the bytes
///             stay on chain forever.
///           - One Ledger seed protects every user. Compromise is total, not per-user;
///             BIP32 derivation isolates users from each other, not from the server.
///           - `encryptedUserId` hides the identifier, not the relationship. The
///             mapping key is a plaintext address and the user list is enumerable, so
///             "this address is a Veyra user" is public by construction.
///
///         Authorization is fail-closed: any missing signal, inactive secret, revoked
///         agent, reused nullifier, or failing proof reverts the whole call.
contract VeyraRegistry {
    // ------------------------------------------------------------------ types --

    struct User {
        bytes encryptedUserId; // sealed to the server key; opaque to the chain
        uint32 leafIndex; // BIP32 leaf the server derives this user's key at
        uint64 registeredAt;
        bool exists;
    }

    struct Secret {
        bytes ciphertext; // encrypted under the user's BIP32 leaf key
        string label; // human-readable, for the approval prompt and the UI
        uint32 version; // bumped on every rotation
        uint64 storedAt;
        bool active;
    }

    // ----------------------------------------------------------------- errors --

    error NotOwner();
    error InvalidAddress();
    error EmptyUserId();
    error EmptyCiphertext();
    error EmptyLabel();
    error UserNotRegistered();
    error UserAlreadyRegistered();
    error SecretNotFound();
    error SecretInactive();
    error InvalidNullifier();
    error NullifierAlreadyUsed();
    error AgentIsRevoked();
    error InvalidRequestId();

    // ----------------------------------------------------------------- events --

    event UserRegistered(
        address indexed user, uint32 leafIndex, bytes32 userIdCommitment, uint64 registeredAt
    );

    event UserIdRotated(address indexed user, bytes32 userIdCommitment, uint64 rotatedAt);

    event SecretStored(
        address indexed user, bytes32 indexed secretId, uint32 version, string label, uint64 storedAt
    );

    event SecretRevoked(address indexed user, bytes32 indexed secretId, uint64 revokedAt);

    /// @dev The event the backend listener fires on. `secretId` is a bytes32 hash to
    ///      match CapabilityRegistry's `resource`, so both contracts key the same
    ///      concept the same way and the subgraph needs no translation table.
    ///      `requestId` is the key of the off-chain x402 payment request. The backend
    ///      queue claims a pending request by this id when the event lands, so it must
    ///      be present — an authorization with no payment behind it is rejected.
    event AgentAuthorized(
        address indexed user,
        address indexed agent,
        bytes32 indexed secretId,
        uint256 nullifierHash,
        bytes32 requestId,
        uint64 authorizedAt
    );

    event AuditRegistrySet(address indexed auditRegistry);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------- storage --

    address public owner;

    IWorldID public immutable worldId;
    uint256 public immutable groupId;
    uint256 public immutable externalNullifierHash;

    /// @dev Source of truth for agent revocation. Required at construction so the kill
    ///      switch can never be silently absent — deploy CapabilityRegistry first.
    ICapabilityRegistry public auditRegistry;

    address[] private _userAddresses;
    mapping(address => User) private _users;

    mapping(address => bytes32[]) private _secretIds;
    mapping(address => mapping(bytes32 => Secret)) private _secrets;

    mapping(uint256 => bool) public nullifierHashUsed;

    // -------------------------------------------------------------- modifiers --

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRegistered() {
        if (!_users[msg.sender].exists) revert UserNotRegistered();
        _;
    }

    constructor(
        address worldIdAddress,
        uint256 worldIdGroupId,
        uint256 worldIdExternalNullifierHash,
        address capabilityRegistry
    ) {
        if (worldIdAddress == address(0) || capabilityRegistry == address(0)) revert InvalidAddress();

        owner = msg.sender;
        worldId = IWorldID(worldIdAddress);
        groupId = worldIdGroupId;
        externalNullifierHash = worldIdExternalNullifierHash;
        auditRegistry = ICapabilityRegistry(capabilityRegistry);

        emit OwnershipTransferred(address(0), msg.sender);
        emit AuditRegistrySet(capabilityRegistry);
    }

    // -------------------------------------------------------------------- admin --

    function setAuditRegistry(address capabilityRegistry) external onlyOwner {
        if (capabilityRegistry == address(0)) revert InvalidAddress();
        auditRegistry = ICapabilityRegistry(capabilityRegistry);
        emit AuditRegistrySet(capabilityRegistry);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    // --------------------------------------------------------------- users --

    /// @notice Called when a user first connects their wallet. Appends them to the
    ///         enumerable user list and stores their encrypted identifier.
    /// @param encryptedUserId Ciphertext of the user's internal id, sealed server-side.
    ///        The contract treats it as opaque bytes and never inspects it.
    /// @param leafIndex The BIP32 leaf index the server derives this user's key at.
    ///        Public by necessity — an index reveals nothing without the seed.
    function registerUser(bytes calldata encryptedUserId, uint32 leafIndex) external {
        if (encryptedUserId.length == 0) revert EmptyUserId();
        if (_users[msg.sender].exists) revert UserAlreadyRegistered();

        _users[msg.sender] = User({
            encryptedUserId: encryptedUserId,
            leafIndex: leafIndex,
            registeredAt: uint64(block.timestamp),
            exists: true
        });

        _userAddresses.push(msg.sender);

        emit UserRegistered(msg.sender, leafIndex, keccak256(encryptedUserId), uint64(block.timestamp));
    }

    /// @notice Replace the stored ciphertext, e.g. after the server rotates its key.
    /// @dev    The previous ciphertext remains readable in chain history forever.
    function rotateUserId(bytes calldata encryptedUserId) external onlyRegistered {
        if (encryptedUserId.length == 0) revert EmptyUserId();

        _users[msg.sender].encryptedUserId = encryptedUserId;
        emit UserIdRotated(msg.sender, keccak256(encryptedUserId), uint64(block.timestamp));
    }

    function userCount() external view returns (uint256) {
        return _userAddresses.length;
    }

    function userAt(uint256 index) external view returns (address) {
        return _userAddresses[index];
    }

    /// @notice Page through the user list. Prefer this over userAt in a loop.
    function listUsers(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _userAddresses.length;
        if (offset >= total) return new address[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _userAddresses[i];
        }
    }

    function getUser(address user) external view returns (User memory) {
        return _users[user];
    }

    function isRegistered(address user) external view returns (bool) {
        return _users[user].exists;
    }

    // ------------------------------------------------------------- secrets --

    /// @notice Store or rotate an encrypted secret. Rotation bumps `version` and
    ///         reactivates the entry, so one call covers both cases.
    /// @param secretId keccak256 of the secret's name — same shape as
    ///        CapabilityRegistry's `resource`.
    /// @param ciphertext Encrypted under this user's BIP32 leaf key, server-side.
    function storeSecret(bytes32 secretId, string calldata label, bytes calldata ciphertext)
        external
        onlyRegistered
    {
        if (secretId == bytes32(0)) revert SecretNotFound();
        if (bytes(label).length == 0) revert EmptyLabel();
        if (ciphertext.length == 0) revert EmptyCiphertext();

        Secret storage existing = _secrets[msg.sender][secretId];
        uint32 nextVersion = existing.version + 1;

        if (existing.version == 0) {
            _secretIds[msg.sender].push(secretId);
        }

        existing.ciphertext = ciphertext;
        existing.label = label;
        existing.version = nextVersion;
        existing.storedAt = uint64(block.timestamp);
        existing.active = true;

        emit SecretStored(msg.sender, secretId, nextVersion, label, uint64(block.timestamp));
    }

    /// @notice Deactivate a secret so it can no longer be authorized.
    /// @dev    This does NOT erase the ciphertext — nothing on a public chain can be
    ///         erased. It only closes the gate.
    function revokeSecret(bytes32 secretId) external onlyRegistered {
        Secret storage secret = _secrets[msg.sender][secretId];
        if (secret.version == 0) revert SecretNotFound();
        if (!secret.active) revert SecretInactive();

        secret.active = false;
        emit SecretRevoked(msg.sender, secretId, uint64(block.timestamp));
    }

    function getSecret(address user, bytes32 secretId) external view returns (Secret memory) {
        return _secrets[user][secretId];
    }

    function secretIdsOf(address user) external view returns (bytes32[] memory) {
        return _secretIds[user];
    }

    // ------------------------------------------------------- authorization --

    /// @notice Authorize an agent to use one of the caller's secrets, gated on a World
    ///         ID proof of personhood.
    ///
    /// @dev    The signal binds the proof to (caller, agent, secretId). Signing only
    ///         the caller would prove "a real human acted" while leaving WHAT they
    ///         approved unconstrained — the same proof would carry any agent and any
    ///         secret. The frontend MUST build its World ID signal identically:
    ///           signal = keccak256(abi.encodePacked(user, agent, secretId))
    ///
    /// @param requestId Key of the off-chain x402 payment request this authorization
    ///        settles. Recorded, never verified on chain — the contract cannot see an
    ///        x402 payment, so the backend is the only thing that can confirm one. A
    ///        non-zero value here proves nothing was paid; it only correlates.
    function authorizeAgent(
        address agentAddress,
        bytes32 secretId,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof,
        bytes32 requestId
    ) external onlyRegistered {
        if (agentAddress == address(0)) revert InvalidAddress();
        if (requestId == bytes32(0)) revert InvalidRequestId();
        if (nullifierHash == 0) revert InvalidNullifier();
        if (nullifierHashUsed[nullifierHash]) revert NullifierAlreadyUsed();

        // The secret must actually exist and be live. The previous design accepted any
        // non-empty string, which made the stored allowlist decorative.
        Secret storage secret = _secrets[msg.sender][secretId];
        if (secret.version == 0) revert SecretNotFound();
        if (!secret.active) revert SecretInactive();

        // Honour the kill switch. Without this the registry would happily authorize an
        // agent the operator had already revoked.
        if (auditRegistry.isRevoked(agentAddress)) revert AgentIsRevoked();

        // Effects before interaction: burning the nullifier first means a reentrant
        // call through verifyProof finds it already spent.
        nullifierHashUsed[nullifierHash] = true;

        // World ID's ByteHasher is keccak256 >> 8, so the digest fits the BN254
        // scalar field. Omitting the shift yields a hash the router will never match.
        uint256 signalHash = uint256(keccak256(abi.encodePacked(msg.sender, agentAddress, secretId))) >> 8;
        worldId.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifierHash, proof);

        emit AgentAuthorized(
            msg.sender, agentAddress, secretId, nullifierHash, requestId, uint64(block.timestamp)
        );
    }
}
