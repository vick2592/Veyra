// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IWorldID, VeyraRegistry} from "../src/VeyraRegistry.sol";

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
    VeyraRegistry internal registry;

    address internal user = address(0xBEEF);
    address internal agent = address(0xA6E7);
    uint256 internal constant GROUP_ID = 1;
    uint256 internal constant EXTERNAL_NULLIFIER_HASH = 123;
    uint256 internal constant ROOT = 456;
    uint256 internal constant NULLIFIER_HASH = 789;

    event AgentAuthorized(address indexed user, address agent, string secretIdentifier);

    function setUp() public {
        worldId = new WorldIdMock();
        registry = new VeyraRegistry(address(worldId), GROUP_ID, EXTERNAL_NULLIFIER_HASH);
    }

    function test_RegisterSecret_StoresIdentifierForCaller() public {
        vm.prank(user);
        registry.registerSecret("ledger-key-1");

        assertEq(registry.userSecretIdentifiers(user, 0), "ledger-key-1");
    }

    function test_AuthorizeAgent_VerifiesAndEmits() public {
        uint256[8] memory proof;

        vm.expectEmit(true, true, true, true);
        emit AgentAuthorized(user, agent, "ledger-key-1");

        vm.prank(user);
        registry.authorizeAgent(agent, "ledger-key-1", ROOT, NULLIFIER_HASH, proof);

        assertTrue(registry.nullifierHashUsed(NULLIFIER_HASH));
        assertEq(worldId.lastRoot(), ROOT);
        assertEq(worldId.lastGroupId(), GROUP_ID);
        assertEq(worldId.lastSignalHash(), uint256(keccak256(abi.encodePacked(user))));
        assertEq(worldId.lastNullifierHash(), NULLIFIER_HASH);
        assertEq(worldId.lastExternalNullifierHash(), EXTERNAL_NULLIFIER_HASH);
    }

    function test_AuthorizeAgent_RevertsForInvalidProof() public {
        uint256[8] memory proof;
        worldId.setShouldRevert(true);

        vm.prank(user);
        vm.expectRevert(bytes("invalid proof"));
        registry.authorizeAgent(agent, "ledger-key-1", ROOT, NULLIFIER_HASH, proof);

        assertFalse(registry.nullifierHashUsed(NULLIFIER_HASH));
    }

    function test_AuthorizeAgent_RevertsWhenNullifierIsReplayed() public {
        uint256[8] memory proof;

        vm.startPrank(user);
        registry.authorizeAgent(agent, "ledger-key-1", ROOT, NULLIFIER_HASH, proof);

        vm.expectRevert(VeyraRegistry.NullifierAlreadyUsed.selector);
        registry.authorizeAgent(agent, "ledger-key-2", ROOT, NULLIFIER_HASH, proof);
        vm.stopPrank();
    }
}