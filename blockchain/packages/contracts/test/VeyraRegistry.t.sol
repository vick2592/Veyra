// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {VeyraRegistry} from "../src/VeyraRegistry.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

contract VeyraRegistryTest is Test {
    CapabilityRegistry internal audit;
    VeyraRegistry internal registry;

    address internal owner = address(0xC0FFEE);
    address internal registrar = address(0x5E4E4);
    address internal user = address(0xBEEF);
    address internal other = address(0xCAFE);
    address internal agent = address(0xA6E7);

    bytes32 internal constant SECRET_ID = keccak256("openai-api-key");
    bytes internal constant CIPHERTEXT = hex"deadbeefcafe";
    bytes internal constant ENCRYPTED_USER_ID = hex"0102030405";
    uint256 internal constant NULLIFIER = 0xA11CE;

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
        vm.startPrank(owner);
        audit = new CapabilityRegistry(owner);
        registry = new VeyraRegistry(address(audit), registrar);
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

    function _authorize(address who, bytes32 requestId) internal {
        vm.prank(who);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, requestId);
    }

    // --------------------------------------------------------- construction --

    function test_Constructor_RevertsOnZeroCapabilityRegistry() public {
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        new VeyraRegistry(address(0), registrar);
    }

    function test_Constructor_SetsOwnerAndRegistrar() public view {
        assertEq(registry.owner(), owner);
        assertTrue(registry.isRegistrar(registrar));
    }

    function test_Constructor_AcceptsZeroRegistrar() public {
        vm.prank(owner);
        VeyraRegistry r = new VeyraRegistry(address(audit), address(0));
        assertFalse(r.isRegistrar(address(0)));
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

    // ------------------------------------------------ registrar (server) path --

    /// @dev Only the machine holding the Ledger can produce the encrypted blob, so it
    ///      needs to be able to register on a user's behalf.
    function test_RegisterUserFor_RegistrarCanRegisterAUser() public {
        vm.prank(registrar);
        registry.registerUserFor(user, ENCRYPTED_USER_ID, 12);

        assertTrue(registry.isRegistered(user));
        assertEq(registry.getUser(user).leafIndex, 12);
        assertEq(registry.userAt(0), user);
    }

    function test_RegisterUserFor_RevertsForNonRegistrar() public {
        vm.prank(other);
        vm.expectRevert(VeyraRegistry.NotRegistrar.selector);
        registry.registerUserFor(user, ENCRYPTED_USER_ID, 1);
    }

    function test_RegisterUserFor_RevertsOnZeroUser() public {
        vm.prank(registrar);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.registerUserFor(address(0), ENCRYPTED_USER_ID, 1);
    }

    function test_RegisterUserFor_RevertsOnDuplicate() public {
        _register(user);
        vm.prank(registrar);
        vm.expectRevert(VeyraRegistry.UserAlreadyRegistered.selector);
        registry.registerUserFor(user, ENCRYPTED_USER_ID, 1);
    }

    function test_StoreSecretFor_RegistrarStoresOnBehalf() public {
        _register(user);

        vm.prank(registrar);
        registry.storeSecretFor(user, SECRET_ID, "openai-api-key", CIPHERTEXT);

        assertEq(registry.getSecret(user, SECRET_ID).ciphertext, CIPHERTEXT);
        assertEq(registry.secretIdsOf(user).length, 1);
    }

    function test_StoreSecretFor_RevertsForNonRegistrar() public {
        _register(user);
        vm.prank(other);
        vm.expectRevert(VeyraRegistry.NotRegistrar.selector);
        registry.storeSecretFor(user, SECRET_ID, "l", CIPHERTEXT);
    }

    function test_StoreSecretFor_RevertsWhenUserNotRegistered() public {
        vm.prank(registrar);
        vm.expectRevert(VeyraRegistry.UserNotRegistered.selector);
        registry.storeSecretFor(user, SECRET_ID, "l", CIPHERTEXT);
    }

    function test_SetRegistrar_OwnerCanAddAndRemove() public {
        vm.startPrank(owner);
        registry.setRegistrar(other, true);
        assertTrue(registry.isRegistrar(other));
        registry.setRegistrar(other, false);
        assertFalse(registry.isRegistrar(other));
        vm.stopPrank();
    }

    function test_SetRegistrar_RevertsForNonOwner() public {
        vm.prank(other);
        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        registry.setRegistrar(other, true);
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
        assertEq(registry.secretIdsOf(user).length, 1);
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

    function test_RevokeSecret_DeactivatesAndBlocksAuthorization() public {
        _register(user);
        _store(user);

        vm.expectEmit(true, true, false, true);
        emit SecretRevoked(user, SECRET_ID, uint64(block.timestamp));
        vm.prank(user);
        registry.revokeSecret(SECRET_ID);

        assertFalse(registry.getSecret(user, SECRET_ID).active);

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.SecretInactive.selector);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, bytes32("req-1"));
    }

    // -------------------------------------------------------- authorization --

    function test_AuthorizeAgent_EmitsWithAttestedNullifier() public {
        _register(user);
        _store(user);

        vm.expectEmit(true, true, true, true);
        emit AgentAuthorized(user, agent, SECRET_ID, NULLIFIER, bytes32("req-1"), uint64(block.timestamp));

        _authorize(user, bytes32("req-1"));
        assertTrue(registry.requestIdUsed(bytes32("req-1")));
    }

    /// @dev The whole point of moving replay protection off the nullifier: a person can
    ///      authorize as many times as they pay, which the old design made impossible.
    function test_AuthorizeAgent_SameUserCanAuthorizeManyTimes() public {
        _register(user);
        _store(user);

        _authorize(user, bytes32("req-1"));
        _authorize(user, bytes32("req-2"));
        _authorize(user, bytes32("req-3"));

        assertTrue(registry.requestIdUsed(bytes32("req-1")));
        assertTrue(registry.requestIdUsed(bytes32("req-2")));
        assertTrue(registry.requestIdUsed(bytes32("req-3")));
    }

    function test_AuthorizeAgent_RevertsOnReusedRequestId() public {
        _register(user);
        _store(user);
        _authorize(user, bytes32("req-1"));

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.RequestAlreadyUsed.selector);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, bytes32("req-1"));
    }

    function test_AuthorizeAgent_RevertsOnZeroRequestId() public {
        _register(user);
        _store(user);

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.InvalidRequestId.selector);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, bytes32(0));
    }

    function test_AuthorizeAgent_RevertsForUnknownSecret() public {
        _register(user);
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.SecretNotFound.selector);
        registry.authorizeAgent(agent, keccak256("never-stored"), NULLIFIER, bytes32("req-1"));
    }

    function test_AuthorizeAgent_RevertsWhenAgentRevoked() public {
        _register(user);
        _store(user);

        vm.prank(owner);
        audit.revokeAgent(agent, 4001);

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.AgentIsRevoked.selector);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, bytes32("req-1"));
    }

    function test_AuthorizeAgent_SucceedsAfterReinstatement() public {
        _register(user);
        _store(user);

        vm.startPrank(owner);
        audit.revokeAgent(agent, 4001);
        audit.reinstateAgent(agent);
        vm.stopPrank();

        _authorize(user, bytes32("req-1"));
        assertTrue(registry.requestIdUsed(bytes32("req-1")));
    }

    function test_AuthorizeAgent_RevertsWhenNotRegistered() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.UserNotRegistered.selector);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, bytes32("req-1"));
    }

    function test_AuthorizeAgent_RevertsOnZeroAgent() public {
        _register(user);
        _store(user);

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.authorizeAgent(address(0), SECRET_ID, NULLIFIER, bytes32("req-1"));
    }

    function test_AuthorizeAgent_CannotUseAnotherUsersSecret() public {
        _register(user);
        _store(user);
        _register(other);

        vm.prank(other);
        vm.expectRevert(VeyraRegistry.SecretNotFound.selector);
        registry.authorizeAgent(agent, SECRET_ID, NULLIFIER, bytes32("req-1"));
    }

    // ---------------------------------------------------------------- admin --

    function test_SetAuditRegistry_OnlyOwner() public {
        vm.prank(other);
        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        registry.setAuditRegistry(address(audit));
    }

    function test_TransferOwnership_MovesOwner() public {
        vm.prank(owner);
        registry.transferOwnership(other);
        assertEq(registry.owner(), other);

        vm.prank(owner);
        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        registry.setRegistrar(other, true);
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

    function testFuzz_DistinctRequestIdsAlwaysAllowed(bytes32 a, bytes32 b) public {
        vm.assume(a != bytes32(0) && b != bytes32(0) && a != b);
        _register(user);
        _store(user);

        _authorize(user, a);
        _authorize(user, b);
        assertTrue(registry.requestIdUsed(a) && registry.requestIdUsed(b));
    }
}
