// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {VeyraRegistry} from "../src/VeyraRegistry.sol";

/// @dev Pretends to be a CapabilityRegistry and tries to re-enter on the isRevoked call.
contract ReentrantAudit {
    VeyraRegistry public target;
    bytes32 public secretId;
    bool public reentered;
    bytes public reentryError;

    function arm(VeyraRegistry t, bytes32 s) external {
        target = t;
        secretId = s;
    }

    function isRevoked(address) external returns (bool) {
        if (address(target) == address(0) || reentered) return false;
        reentered = true;

        try target.authorizeAgent(address(0xA6E7), secretId, 1, bytes32("reentry")) {
            reentryError = "REENTRY SUCCEEDED";
        } catch (bytes memory err) {
            reentryError = err;
        }
        return false;
    }
}

/// @notice Properties the design claims, checked directly rather than via happy paths.
contract DesignPropertiesTest is Test {
    CapabilityRegistry internal audit;
    VeyraRegistry internal gate;

    address internal owner = address(0xC0FFEE);
    address internal emitter = address(0xE471);
    address internal registrar = address(0x5E4E4);
    address internal user = address(0xBEEF);
    address internal agent = address(0xA6E7);

    bytes32 internal constant SECRET_ID = keccak256("openai-api-key");

    function setUp() public {
        vm.startPrank(owner);
        audit = new CapabilityRegistry(emitter);
        gate = new VeyraRegistry(address(audit), registrar);
        vm.stopPrank();

        vm.startPrank(user);
        gate.registerUser(hex"01", 0);
        gate.storeSecret(SECRET_ID, "openai-api-key", hex"cafe");
        vm.stopPrank();
    }

    /// @dev Authorization fails closed. If the audit registry is not a contract,
    ///      isRevoked cannot be trusted, so the call must revert rather than silently
    ///      treat the agent as un-revoked.
    function test_FailsClosed_WhenAuditRegistryIsNotAContract() public {
        address notAContract = address(0xDEAD);
        assertEq(notAContract.code.length, 0);

        vm.prank(owner);
        VeyraRegistry r = new VeyraRegistry(notAContract, registrar);

        vm.startPrank(user);
        r.registerUser(hex"01", 0);
        r.storeSecret(SECRET_ID, "k", hex"cafe");

        vm.expectRevert();
        r.authorizeAgent(agent, SECRET_ID, 1, bytes32("req-1"));
        vm.stopPrank();
    }

    /// @dev isRevoked is declared `view`, so Solidity issues a STATICCALL. A hostile
    ///      audit registry that tries to write state during it cannot succeed.
    function test_Reentrancy_HostileAuditRegistryCannotWriteState() public {
        ReentrantAudit hostile = new ReentrantAudit();

        vm.prank(owner);
        VeyraRegistry r = new VeyraRegistry(address(hostile), registrar);
        hostile.arm(r, SECRET_ID);

        vm.startPrank(user);
        r.registerUser(hex"01", 0);
        r.storeSecret(SECRET_ID, "k", hex"cafe");

        // The STATICCALL forbids the callee mutating state, so the whole call reverts.
        vm.expectRevert();
        r.authorizeAgent(agent, SECRET_ID, 1, bytes32("req-1"));
        vm.stopPrank();
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
    }

    /// @dev Revoking in the audit registry must actually close the gate, for any agent.
    function testFuzz_RevocationBlocksAuthorization(address anyAgent) public {
        vm.assume(anyAgent != address(0));

        vm.prank(owner);
        audit.revokeAgent(anyAgent, 1);

        vm.prank(user);
        vm.expectRevert(VeyraRegistry.AgentIsRevoked.selector);
        gate.authorizeAgent(anyAgent, SECRET_ID, 1, bytes32("req-1"));
    }

    /// @dev A request id is single-use, whatever else varies.
    function testFuzz_RequestIdIsSingleUse(bytes32 requestId, uint256 nullifier) public {
        vm.assume(requestId != bytes32(0));

        vm.startPrank(user);
        gate.authorizeAgent(agent, SECRET_ID, nullifier, requestId);

        vm.expectRevert(VeyraRegistry.RequestAlreadyUsed.selector);
        gate.authorizeAgent(agent, SECRET_ID, nullifier, requestId);
        vm.stopPrank();
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

        vm.stopPrank();
    }

    /// @dev A registrar can write on a user's behalf but must not touch owner levers.
    function test_RegistrarCannotReachOwnerLevers() public {
        vm.startPrank(registrar);

        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        gate.setRegistrar(registrar, true);

        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        gate.transferOwnership(registrar);

        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        gate.setAuditRegistry(address(audit));

        vm.stopPrank();
    }
}
