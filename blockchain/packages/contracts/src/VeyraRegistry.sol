// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Only the slice of CapabilityRegistry this contract needs. Keeping it narrow
///      means the audit contract can evolve without redeploying the gate.
interface ICapabilityRegistry {
    function isRevoked(address agent) external view returns (bool);
}

interface IWorldIDRouter {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external;
}

/// @title  VeyraRegistry
/// @notice The authorization gate. Holds each user's secrets as ciphertext and records
///         which agent a user authorized against which secret.
///
/// @dev    World ID proof verification is performed on chain through the configured
///         router. Replay is scoped to the payment request rather than the World ID
///         nullifier, so a person can authorize a fresh paid request repeatedly.
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
///         agent, or reused request id reverts the whole call.
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
    error NotRegistrar();
    error InvalidAddress();
    error EmptyUserId();
    error EmptyCiphertext();
    error EmptyLabel();
    error UserNotRegistered();
    error UserAlreadyRegistered();
    error SecretNotFound();
    error SecretInactive();
    error InvalidRequestId();
    error RequestAlreadyUsed();
    error AgentIsRevoked();

    // ----------------------------------------------------------------- events --

    event UserRegistered(
        address indexed user, uint32 leafIndex, bytes32 userIdCommitment, uint64 registeredAt
    );

    event UserIdRotated(address indexed user, bytes32 userIdCommitment, uint64 rotatedAt);

    event SecretStored(
        address indexed user, bytes32 indexed secretId, uint32 version, string label, uint64 storedAt
    );

    event SecretRevoked(address indexed user, bytes32 indexed secretId, uint64 revokedAt);

    /// @dev Signature deliberately unchanged from the previous version so the backend
    ///      listener keeps parsing it without modification.
    ///      `nullifierHash` is attested off chain — see the contract notice.
    event AgentAuthorized(
        address indexed user,
        address indexed agent,
        bytes32 indexed secretId,
        uint256 nullifierHash,
        bytes32 requestId,
        uint64 authorizedAt
    );

    event RegistrarSet(address indexed registrar, bool allowed);
    event AuditRegistrySet(address indexed auditRegistry);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------- storage --

    address public owner;

    IWorldIDRouter public worldIdRouter;
    uint256 public worldIdGroupId;
    uint256 public externalNullifier;

    /// @dev Source of truth for agent revocation. Required at construction so the kill
    ///      switch can never be silently absent — deploy CapabilityRegistry first.
    ICapabilityRegistry public auditRegistry;

    /// @dev Backend keys allowed to register users and store secrets on their behalf.
    ///      Only the server holds the Ledger, so only the server can produce ciphertext.
    ///      This is a trust concentration, but not a new one: that server can already
    ///      decrypt every secret it stores.
    mapping(address => bool) public isRegistrar;

    address[] private _userAddresses;
    mapping(address => User) private _users;

    mapping(address => bytes32[]) private _secretIds;
    mapping(address => mapping(bytes32 => Secret)) private _secrets;

    /// @dev One authorization per paid request. This replaces nullifier-based replay
    ///      protection: a payment request is the thing that should be single-use, and
    ///      unlike a World ID nullifier a fresh one exists for every request.
    mapping(bytes32 => bool) public requestIdUsed;

    // -------------------------------------------------------------- modifiers --

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRegistrar() {
        if (!isRegistrar[msg.sender]) revert NotRegistrar();
        _;
    }

    modifier onlyRegistered() {
        if (!_users[msg.sender].exists) revert UserNotRegistered();
        _;
    }

    constructor(
        address capabilityRegistry,
        address initialRegistrar,
        address worldIdRouterAddress,
        uint256 groupId,
        uint256 externalNullifierHash
    ) {
        if (capabilityRegistry == address(0) || worldIdRouterAddress == address(0)) revert InvalidAddress();

        owner = msg.sender;
        auditRegistry = ICapabilityRegistry(capabilityRegistry);
        worldIdRouter = IWorldIDRouter(worldIdRouterAddress);
        worldIdGroupId = groupId;
        externalNullifier = externalNullifierHash;

        emit OwnershipTransferred(address(0), msg.sender);
        emit AuditRegistrySet(capabilityRegistry);

        if (initialRegistrar != address(0)) {
            isRegistrar[initialRegistrar] = true;
            emit RegistrarSet(initialRegistrar, true);
        }
    }

    // -------------------------------------------------------------------- admin --

    function setRegistrar(address registrar, bool allowed) external onlyOwner {
        if (registrar == address(0)) revert InvalidAddress();
        isRegistrar[registrar] = allowed;
        emit RegistrarSet(registrar, allowed);
    }

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

    // ---------------------------------------------------------------- users --

    /// @notice Register yourself. Called when a user connects their wallet and signs.
    function registerUser(bytes calldata encryptedUserId, uint32 leafIndex) external {
        _register(msg.sender, encryptedUserId, leafIndex);
    }

    /// @notice Register a user from the backend. The encrypted id can only be produced
    ///         by the machine holding the Ledger, so this saves a round trip and a
    ///         wallet confirmation in the demo flow.
    function registerUserFor(address user, bytes calldata encryptedUserId, uint32 leafIndex)
        external
        onlyRegistrar
    {
        if (user == address(0)) revert InvalidAddress();
        _register(user, encryptedUserId, leafIndex);
    }

    function _register(address user, bytes calldata encryptedUserId, uint32 leafIndex) private {
        if (encryptedUserId.length == 0) revert EmptyUserId();
        if (_users[user].exists) revert UserAlreadyRegistered();

        _users[user] = User({
            encryptedUserId: encryptedUserId,
            leafIndex: leafIndex,
            registeredAt: uint64(block.timestamp),
            exists: true
        });
        _userAddresses.push(user);

        emit UserRegistered(user, leafIndex, keccak256(encryptedUserId), uint64(block.timestamp));
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

    /// @notice Store or rotate one of your own encrypted secrets.
    function storeSecret(bytes32 secretId, string calldata label, bytes calldata ciphertext)
        public
        onlyRegistered
    {
        _store(msg.sender, secretId, label, ciphertext);
    }

    /// @notice Store a secret on a user's behalf, from the backend that encrypted it.
    function storeSecretFor(address user, bytes32 secretId, string calldata label, bytes calldata ciphertext)
        external
        onlyRegistrar
    {
        if (!_users[user].exists) revert UserNotRegistered();
        _store(user, secretId, label, ciphertext);
    }

    function _store(address user, bytes32 secretId, string calldata label, bytes calldata ciphertext)
        private
    {
        if (secretId == bytes32(0)) revert SecretNotFound();
        if (bytes(label).length == 0) revert EmptyLabel();
        if (ciphertext.length == 0) revert EmptyCiphertext();

        Secret storage existing = _secrets[user][secretId];
        uint32 nextVersion = existing.version + 1;

        if (existing.version == 0) {
            _secretIds[user].push(secretId);
        }

        existing.ciphertext = ciphertext;
        existing.label = label;
        existing.version = nextVersion;
        existing.storedAt = uint64(block.timestamp);
        existing.active = true;

        emit SecretStored(user, secretId, nextVersion, label, uint64(block.timestamp));
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

    /// @notice Authorize an agent to use one of your secrets, for one paid request.
    ///
    /// @dev    Replay is scoped to `requestId`, not to a World ID nullifier. Each x402
    ///         payment mints a fresh request id, so a person can authorize as often as
    ///         they pay — while any single request stays single-use.
    ///
    /// @param root The World ID Merkle root.
    /// @param nullifierHash The World ID nullifier hash, verified by the router.
    /// @param proof The eight-element World ID ZK proof.
    /// @param requestId The off-chain x402 payment request this authorization settles.
    function authorizeAgent(
        address agentAddress,
        bytes32 secretId,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] memory proof,
        bytes32 requestId
    ) public onlyRegistered {
        if (agentAddress == address(0)) revert InvalidAddress();
        if (requestId == bytes32(0)) revert InvalidRequestId();
        if (requestIdUsed[requestId]) revert RequestAlreadyUsed();

        // The secret must actually exist and be live.
        Secret storage secret = _secrets[msg.sender][secretId];
        if (secret.version == 0) revert SecretNotFound();
        if (!secret.active) revert SecretInactive();

        // Honour the kill switch. Without this the registry would happily authorize an
        // agent the operator had already revoked.
        if (auditRegistry.isRevoked(agentAddress)) revert AgentIsRevoked();

        uint256 signalHash = uint256(keccak256(abi.encodePacked(msg.sender, agentAddress, secretId))) >> 8;
        worldIdRouter.verifyProof(root, worldIdGroupId, signalHash, nullifierHash, externalNullifier, proof);

        requestIdUsed[requestId] = true;

        emit AgentAuthorized(
            msg.sender, agentAddress, secretId, nullifierHash, requestId, uint64(block.timestamp)
        );
    }

    function authorizeAgent(address agentAddress, bytes32 secretId, uint256 nullifierHash, bytes32 requestId)
        external
    {
        uint256[8] memory emptyProof;
        authorizeAgent(agentAddress, secretId, 0, nullifierHash, emptyProof, requestId);
    }
}
