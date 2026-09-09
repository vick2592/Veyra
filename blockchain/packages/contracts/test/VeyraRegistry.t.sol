// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IWorldID, VeyraRegistry} from "../src/VeyraRegistry.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

contract WorldIdMock is IWorldID {
    bool internal shouldRevert;
    uint256 public lastRoot;
    uint256 public lastGroupId;
    uint256 public lastSignalHash;
    uint256 public lastNullifierHash;
    uint256 public lastExternalNullifierHash;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata
    ) external override {
        if (shouldRevert) revert("invalid proof");

        lastRoot = root;
        lastGroupId = groupId;
        lastSignalHash = signalHash;
        lastNullifierHash = nullifierHash;
        lastExternalNullifierHash = externalNullifierHash;
    }
}

contract VeyraRegistryTest is Test {
    WorldIdMock internal worldId;
    CapabilityRegistry internal audit;
    VeyraRegistry internal registry;

    address internal deployer = address(0xD3);
    address internal user = address(0xBEEF);
    address internal other = address(0xCAFE);
    address internal agent = address(0xA6E7);

    uint256 internal constant GROUP_ID = 1;
    uint256 internal constant EXTERNAL_NULLIFIER_HASH = 123;
    uint256 internal constant ROOT = 456;
    uint256 internal constant NULLIFIER_HASH = 789;

    bytes32 internal constant SECRET_ID = keccak256("openai-api-key");
    bytes internal constant CIPHERTEXT = hex"deadbeefcafe";
    bytes internal constant ENCRYPTED_USER_ID = hex"0102030405";

    event UserRegistered(
        address indexed user, uint32 leafIndex, bytes32 userIdCommitment, uint64 registeredAt
    );
    event SecretStored(
        address indexed user, bytes32 indexed secretId, uint32 version, string label, uint64 storedAt
    );
    event SecretRevoked(address indexed user, bytes32 indexed secretId, uint64 revokedAt);
    event AgentAuthorized(
        address indexed user,
        address indexed agent,
        bytes32 indexed secretId,
        uint256 nullifierHash,
        bytes32 requestId,
        uint64 authorizedAt
    );

    function setUp() public {
        worldId = new WorldIdMock();

        vm.startPrank(deployer);
        audit = new CapabilityRegistry(deployer);
        registry = new VeyraRegistry(address(worldId), GROUP_ID, EXTERNAL_NULLIFIER_HASH, address(audit));
        vm.stopPrank();
    }

    function _register(address who) internal {
        vm.prank(who);
        registry.registerUser(ENCRYPTED_USER_ID, 7);
    }

    function _store(address who) internal {
        vm.prank(who);
        registry.storeSecret(SECRET_ID, "openai-api-key", CIPHERTEXT);
    }

    function _authorize(address who, bytes32 secretId) internal {
        uint256[8] memory proof;
        vm.prank(who);
        registry.authorizeAgent(agent, secretId, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    // --------------------------------------------------------- construction --

    function test_Constructor_RevertsOnZeroCapabilityRegistry() public {
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        new VeyraRegistry(address(worldId), GROUP_ID, EXTERNAL_NULLIFIER_HASH, address(0));
    }

    function test_Constructor_RevertsOnZeroWorldId() public {
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        new VeyraRegistry(address(0), GROUP_ID, EXTERNAL_NULLIFIER_HASH, address(audit));
    }

    // ---------------------------------------------------------------- users --

    function test_RegisterUser_StoresAndAppendsToArray() public {
        vm.expectEmit(true, false, false, true);
        emit UserRegistered(user, 7, keccak256(ENCRYPTED_USER_ID), uint64(block.timestamp));

        _register(user);

        assertTrue(registry.isRegistered(user));
        assertEq(registry.userCount(), 1);
        assertEq(registry.userAt(0), user);

        VeyraRegistry.User memory record = registry.getUser(user);
        assertEq(record.encryptedUserId, ENCRYPTED_USER_ID);
        assertEq(record.leafIndex, 7);
        assertTrue(record.exists);
    }

    function test_RegisterUser_MultipleUsersEnumerable() public {
        _register(user);
        _register(other);

        assertEq(registry.userCount(), 2);
        address[] memory page = registry.listUsers(0, 10);
        assertEq(page.length, 2);
        assertEq(page[0], user);
        assertEq(page[1], other);
    }

    function test_ListUsers_PagesAndClampsPastEnd() public {
        _register(user);
        _register(other);

        address[] memory first = registry.listUsers(0, 1);
        assertEq(first.length, 1);
        assertEq(first[0], user);

        address[] memory tail = registry.listUsers(1, 50);
        assertEq(tail.length, 1);
        assertEq(tail[0], other);

        assertEq(registry.listUsers(5, 10).length, 0);
    }

    function test_RegisterUser_RevertsOnDuplicate() public {
        _register(user);

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.UserAlreadyRegistered.selector);
        registry.registerUser(ENCRYPTED_USER_ID, 7);
    }

    function test_RegisterUser_RevertsOnEmptyUserId() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.EmptyUserId.selector);
        registry.registerUser("", 7);
    }

    function test_RotateUserId_ReplacesCiphertext() public {
        _register(user);

        vm.prank(user);
        registry.rotateUserId(hex"aabbcc");

        assertEq(registry.getUser(user).encryptedUserId, hex"aabbcc");
    }

    // -------------------------------------------------------------- secrets --

    function test_StoreSecret_StoresAndEnumerates() public {
        _register(user);

        vm.expectEmit(true, true, false, true);
        emit SecretStored(user, SECRET_ID, 1, "openai-api-key", uint64(block.timestamp));
        _store(user);

        VeyraRegistry.Secret memory secret = registry.getSecret(user, SECRET_ID);
        assertEq(secret.ciphertext, CIPHERTEXT);
        assertEq(secret.version, 1);
        assertTrue(secret.active);

        bytes32[] memory ids = registry.secretIdsOf(user);
        assertEq(ids.length, 1);
        assertEq(ids[0], SECRET_ID);
    }

    function test_StoreSecret_RotationBumpsVersionWithoutDuplicatingId() public {
        _register(user);
        _store(user);

        vm.prank(user);
        registry.storeSecret(SECRET_ID, "openai-api-key", hex"99887766");

        assertEq(registry.getSecret(user, SECRET_ID).version, 2);
        assertEq(registry.getSecret(user, SECRET_ID).ciphertext, hex"99887766");
        assertEq(registry.secretIdsOf(user).length, 1);
    }

    function test_StoreSecret_RevertsWhenNotRegistered() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.UserNotRegistered.selector);
        registry.storeSecret(SECRET_ID, "label", CIPHERTEXT);
    }

    function test_StoreSecret_RevertsOnEmptyCiphertext() public {
        _register(user);
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.EmptyCiphertext.selector);
        registry.storeSecret(SECRET_ID, "label", "");
    }

    function test_RevokeSecret_DeactivatesAndBlocksAuthorization() public {
        _register(user);
        _store(user);

        vm.expectEmit(true, true, false, true);
        emit SecretRevoked(user, SECRET_ID, uint64(block.timestamp));
        vm.prank(user);
        registry.revokeSecret(SECRET_ID);

        assertFalse(registry.getSecret(user, SECRET_ID).active);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.SecretInactive.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    // -------------------------------------------------------- authorization --

    function test_AuthorizeAgent_VerifiesAndEmits() public {
        _register(user);
        _store(user);

        vm.expectEmit(true, true, true, true);
        emit AgentAuthorized(
            user, agent, SECRET_ID, NULLIFIER_HASH, bytes32("req-1"), uint64(block.timestamp)
        );

        _authorize(user, SECRET_ID);

        assertTrue(registry.nullifierHashUsed(NULLIFIER_HASH));
        assertEq(worldId.lastRoot(), ROOT);
        assertEq(worldId.lastGroupId(), GROUP_ID);
        assertEq(worldId.lastExternalNullifierHash(), EXTERNAL_NULLIFIER_HASH);
    }

    /// @dev The whole point of the signal change: the proof commits to WHAT was
    ///      approved, not merely that a human approved something.
    function test_AuthorizeAgent_SignalBindsUserAgentAndSecret() public {
        _register(user);
        _store(user);
        _authorize(user, SECRET_ID);

        // >> 8 mirrors World ID's ByteHasher, which reduces the digest into the
        // BN254 scalar field. The frontend signal must hash to the same value.
        assertEq(worldId.lastSignalHash(), uint256(keccak256(abi.encodePacked(user, agent, SECRET_ID))) >> 8);
    }

    /// @dev Closes the gap where the stored secret list was never consulted.
    function test_AuthorizeAgent_RevertsForUnknownSecret() public {
        _register(user);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.SecretNotFound.selector);
        registry.authorizeAgent(
            agent, keccak256("never-stored"), ROOT, NULLIFIER_HASH, proof, bytes32("req-1")
        );
    }

    /// @dev Closes the gap where the kill switch had no effect on authorization.
    function test_AuthorizeAgent_RevertsWhenAgentRevoked() public {
        _register(user);
        _store(user);

        vm.prank(deployer);
        audit.revokeAgent(agent, 4001);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.AgentIsRevoked.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    function test_AuthorizeAgent_SucceedsAfterReinstatement() public {
        _register(user);
        _store(user);

        vm.startPrank(deployer);
        audit.revokeAgent(agent, 4001);
        audit.reinstateAgent(agent);
        vm.stopPrank();

        _authorize(user, SECRET_ID);
        assertTrue(registry.nullifierHashUsed(NULLIFIER_HASH));
    }

    function test_AuthorizeAgent_RevertsWhenNotRegistered() public {
        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.UserNotRegistered.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    function test_AuthorizeAgent_RevertsForInvalidProof() public {
        _register(user);
        _store(user);
        worldId.setShouldRevert(true);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(bytes("invalid proof"));
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));

        // Fail closed: a failed proof must not burn the nullifier.
        assertFalse(registry.nullifierHashUsed(NULLIFIER_HASH));
    }

    function test_AuthorizeAgent_RevertsWhenNullifierReplayed() public {
        _register(user);
        _store(user);
        _authorize(user, SECRET_ID);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.NullifierAlreadyUsed.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    function test_AuthorizeAgent_RevertsOnZeroNullifier() public {
        _register(user);
        _store(user);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.InvalidNullifier.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, 0, proof, bytes32("req-1"));
    }

    /// @dev Matches Viktor's rule: an authorization with no payment request behind it
    ///      is rejected outright.
    function test_AuthorizeAgent_RevertsOnZeroRequestId() public {
        _register(user);
        _store(user);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.InvalidRequestId.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32(0));
    }

    function test_AuthorizeAgent_RevertsOnZeroAgent() public {
        _register(user);
        _store(user);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.authorizeAgent(address(0), SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    /// @dev One user's secret is not reachable by another caller.
    function test_AuthorizeAgent_CannotUseAnotherUsersSecret() public {
        _register(user);
        _store(user);
        _register(other);

        uint256[8] memory proof;
        vm.prank(other);
        vm.expectRevert(VeyraRegistry.SecretNotFound.selector);
        registry.authorizeAgent(agent, SECRET_ID, ROOT, NULLIFIER_HASH, proof, bytes32("req-1"));
    }

    // ---------------------------------------------------------------- admin --

    function test_SetAuditRegistry_OnlyOwner() public {
        vm.prank(other);
        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        registry.setAuditRegistry(address(audit));
    }

    function test_SetAuditRegistry_RevertsOnZero() public {
        vm.prank(deployer);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.setAuditRegistry(address(0));
    }

    // ----------------------------------------------------------------- fuzz --

    function testFuzz_RegisterUser_AnyCiphertextRoundTrips(bytes calldata blob, uint32 leafIndex) public {
        vm.assume(blob.length > 0 && blob.length <= 512);

        vm.prank(user);
        registry.registerUser(blob, leafIndex);

        VeyraRegistry.User memory record = registry.getUser(user);
        assertEq(record.encryptedUserId, blob);
        assertEq(record.leafIndex, leafIndex);
    }
}
