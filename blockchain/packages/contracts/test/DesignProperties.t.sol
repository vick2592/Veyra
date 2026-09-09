// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IWorldID, VeyraRegistry} from "../src/VeyraRegistry.sol";

contract PassthroughWorldId is IWorldID {
    function verifyProof(uint256, uint256, uint256, uint256, uint256, uint256[8] calldata)
        external
        override
    {}
}

/// @dev Attempts to re-enter authorizeAgent while the proof is still being verified.
contract ReentrantWorldId is IWorldID {
    VeyraRegistry public target;
    bytes32 public secretId;
    address public agent;
    bool public reentered;
    bytes public reentryError;

    function arm(VeyraRegistry t, bytes32 s, address a) external {
        target = t;
        secretId = s;
        agent = a;
        // Register self so the reentrant call clears onlyRegistered and actually
        // reaches the nullifier guard — otherwise the test proves nothing about it.
        t.registerUser(hex"02", 1);
        t.storeSecret(s, "attacker", hex"beef");
    }

    function verifyProof(uint256, uint256, uint256, uint256, uint256, uint256[8] calldata) external override {
        if (address(target) == address(0) || reentered) return;
        reentered = true;

        uint256[8] memory proof;
        try target.authorizeAgent(agent, secretId, 1, 999, proof, bytes32("r2")) {
            reentryError = "REENTRY SUCCEEDED";
        } catch (bytes memory err) {
            reentryError = err;
        }
    }
}

/// @notice Properties the design claims, checked directly rather than via happy paths.
contract DesignPropertiesTest is Test {
    CapabilityRegistry internal audit;
    address internal owner = address(0xC0FFEE);
    address internal emitter = address(0xE471);
    address internal user = address(0xBEEF);
    address internal agent = address(0xA6E7);

    bytes32 internal constant SECRET_ID = keccak256("openai-api-key");

    function setUp() public {
        vm.prank(owner);
        audit = new CapabilityRegistry(emitter);
    }

    function _registryWith(IWorldID w) internal returns (VeyraRegistry r) {
        vm.prank(owner);
        r = new VeyraRegistry(address(w), 1, 1, address(audit));

        vm.startPrank(user);
        r.registerUser(hex"01", 0);
        r.storeSecret(SECRET_ID, "openai-api-key", hex"cafe");
        vm.stopPrank();
    }

    /// @dev The design says authorization fails closed. If the audit registry is not a
    ///      contract, isRevoked cannot be trusted, so the call must revert rather than
    ///      silently treat the agent as un-revoked.
    function test_FailsClosed_WhenAuditRegistryIsNotAContract() public {
        address notAContract = address(0xDEAD);
        assertEq(notAContract.code.length, 0);

        vm.prank(owner);
        VeyraRegistry r = new VeyraRegistry(address(new PassthroughWorldId()), 1, 1, notAContract);

        vm.startPrank(user);
        r.registerUser(hex"01", 0);
        r.storeSecret(SECRET_ID, "k", hex"cafe");

        uint256[8] memory proof;
        vm.expectRevert();
        r.authorizeAgent(agent, SECRET_ID, 1, 42, proof, bytes32("r1"));
        vm.stopPrank();
    }

    /// @dev The nullifier is burned BEFORE verifyProof precisely so a reentrant call
    ///      finds it already spent. Without that ordering one proof could authorize twice.
    function test_Reentrancy_SecondAuthorizationIsRejected() public {
        ReentrantWorldId w = new ReentrantWorldId();
        VeyraRegistry r = _registryWith(w);
        w.arm(r, SECRET_ID, agent);
        assertTrue(r.isRegistered(address(w)), "attacker must be registered for this to be a real test");

        uint256[8] memory proof;
        vm.prank(user);
        r.authorizeAgent(agent, SECRET_ID, 1, 999, proof, bytes32("r1"));

        assertTrue(w.reentered(), "reentry was not attempted");
        assertEq(
            bytes4(w.reentryError()),
            VeyraRegistry.NullifierAlreadyUsed.selector,
            "reentrant call was not rejected by the nullifier guard"
        );
    }

    /// @dev A failed proof must leave no trace — the nullifier stays spendable.
    function test_FailedProof_LeavesNullifierUnspent() public {
        RevertingWorldId w = new RevertingWorldId();
        VeyraRegistry r = _registryWith(w);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert();
        r.authorizeAgent(agent, SECRET_ID, 1, 77, proof, bytes32("r1"));

        assertFalse(r.nullifierHashUsed(77));
    }

    /// @dev The audit log is append-only: no decisionId is ever written twice, whatever
    ///      order or repetition the emitter submits.
    function testFuzz_DecisionIdIsWriteOnce(uint8 repeats, uint256 idSeed) public {
        bytes32 id = keccak256(abi.encode(idSeed));
        vm.assume(id != bytes32(0));
        uint256 n = uint256(repeats) % 8 + 1;

        CapabilityRegistry.DecisionRecord[] memory batch = new CapabilityRegistry.DecisionRecord[](1);
        batch[0] = CapabilityRegistry.DecisionRecord({
            decisionId: id,
            agent: agent,
            resource: SECRET_ID,
            decision: 0,
            reasonCode: 1,
            notionalUsdE6: 1,
            tierAtDecision: 0,
            confirmationMode: 0,
            paramsHash: bytes32(0),
            occurredAt: 1
        });

        uint256 totalWritten;
        for (uint256 i = 0; i < n; ++i) {
            vm.prank(emitter);
            totalWritten += audit.recordDecisions(batch);
        }

        assertEq(totalWritten, 1, "the same decision was written more than once");
        assertTrue(audit.recordedDecision(id));
    }

    /// @dev Revoking in the audit registry must actually close the gate, for any agent.
    function testFuzz_RevocationBlocksAuthorization(address anyAgent) public {
        vm.assume(anyAgent != address(0));

        VeyraRegistry r = _registryWith(new PassthroughWorldId());

        vm.prank(owner);
        audit.revokeAgent(anyAgent, 1);

        uint256[8] memory proof;
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.AgentIsRevoked.selector);
        r.authorizeAgent(anyAgent, SECRET_ID, 1, 55, proof, bytes32("r1"));
    }

    /// @dev The emitter is a hot key. It must never reach an owner-only lever.
    function testFuzz_EmitterCannotReachOwnerLevers(uint16 reasonCode) public {
        vm.startPrank(emitter);

        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        audit.revokeAgent(agent, reasonCode);

        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        audit.reinstateAgent(agent);

        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        audit.setEmitter(emitter, true);

        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        audit.transferOwnership(emitter);

        vm.stopPrank();
    }
}

contract RevertingWorldId is IWorldID {
    function verifyProof(uint256, uint256, uint256, uint256, uint256, uint256[8] calldata)
        external
        pure
        override
    {
        revert("invalid proof");
    }
}
