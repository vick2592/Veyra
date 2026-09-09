// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

contract CapabilityRegistryTest is Test {
    CapabilityRegistry internal reg;

    address internal owner = address(0xC0FFEE);
    address internal emitter = address(0xE471);
    address internal stranger = address(0xBAD);
    address internal agent = address(0xA6E7);

    // Redeclared for vm.expectEmit.
    event ResourceRegistered(bytes32 indexed resource, string name, uint8 riskClass);
    event CapabilityDecided(
        bytes32 indexed decisionId,
        address indexed agent,
        bytes32 indexed resource,
        uint8 decision,
        uint16 reasonCode,
        uint64 notionalUsdE6,
        uint8 tierAtDecision,
        uint8 confirmationMode,
        bytes32 paramsHash,
        uint64 occurredAt
    );
    event AgentRevoked(address indexed agent, address indexed by, uint16 reasonCode, uint64 revokedAt);
    event AgentReinstated(address indexed agent, address indexed by, uint64 reinstatedAt);
    event RiskScoreUpdated(
        address indexed agent,
        uint16 score,
        uint8 priorTier,
        uint8 newTier,
        bytes32 evidenceRef,
        uint64 updatedAt
    );

    function setUp() public {
        vm.prank(owner);
        reg = new CapabilityRegistry(emitter);
    }

    // ------------------------------------------------------------- helpers --

    function _decision(bytes32 id, uint64 notional)
        internal
        view
        returns (CapabilityRegistry.DecisionRecord memory)
    {
        return CapabilityRegistry.DecisionRecord({
            decisionId: id,
            agent: agent,
            resource: keccak256("usdc.transfer"),
            decision: uint8(CapabilityRegistry.Decision.Allow),
            reasonCode: 1000,
            notionalUsdE6: notional,
            tierAtDecision: uint8(CapabilityRegistry.Tier.Verified),
            confirmationMode: uint8(CapabilityRegistry.ConfirmationMode.LedgerEip712),
            paramsHash: keccak256("params"),
            occurredAt: 1_757_000_000
        });
    }

    function _one(CapabilityRegistry.DecisionRecord memory r)
        internal
        pure
        returns (CapabilityRegistry.DecisionRecord[] memory batch)
    {
        batch = new CapabilityRegistry.DecisionRecord[](1);
        batch[0] = r;
    }

    function _use(bytes32 id, bytes32 jti)
        internal
        view
        returns (CapabilityRegistry.UseRecord[] memory batch)
    {
        batch = new CapabilityRegistry.UseRecord[](1);
        batch[0] = CapabilityRegistry.UseRecord({
            decisionId: id, agent: agent, jti: jti, upstreamOk: true, reasonCode: 0, usedAt: 1_757_000_050
        });
    }

    // --------------------------------------------------------- kill switch --

    function test_RevokeAgent_SetsFlagAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit AgentRevoked(agent, owner, 4001, uint64(block.timestamp));

        vm.prank(owner);
        reg.revokeAgent(agent, 4001);

        assertTrue(reg.isRevoked(agent));
    }

    function test_RevokeAgent_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.revokeAgent(agent, 4001);
    }

    /// @dev The emitter is a hot key but must NOT be able to reach the kill switch.
    function test_RevokeAgent_RevertsForEmitter() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.revokeAgent(agent, 4001);
    }

    function test_RevokeAgent_IsIdempotent() public {
        vm.startPrank(owner);
        reg.revokeAgent(agent, 4001);
        reg.revokeAgent(agent, 4001); // must not revert
        vm.stopPrank();

        assertTrue(reg.isRevoked(agent));
    }

    function test_ReinstateAgent_ClearsFlag() public {
        vm.startPrank(owner);
        reg.revokeAgent(agent, 4001);
        assertTrue(reg.isRevoked(agent));

        vm.expectEmit(true, true, false, true);
        emit AgentReinstated(agent, owner, uint64(block.timestamp));
        reg.reinstateAgent(agent);
        vm.stopPrank();

        assertFalse(reg.isRevoked(agent));
    }

    function test_ReinstateAgent_RevertsForNonOwner() public {
        vm.prank(owner);
        reg.revokeAgent(agent, 4001);

        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.reinstateAgent(agent);
    }

    // ---------------------------------------------------- decisions / batch --

    function test_RecordDecisions_WritesAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit CapabilityDecided(
            bytes32("d1"),
            agent,
            keccak256("usdc.transfer"),
            uint8(CapabilityRegistry.Decision.Allow),
            1000,
            240_000_000,
            uint8(CapabilityRegistry.Tier.Verified),
            uint8(CapabilityRegistry.ConfirmationMode.LedgerEip712),
            keccak256("params"),
            1_757_000_000
        );

        vm.prank(emitter);
        uint256 written = reg.recordDecisions(_one(_decision(bytes32("d1"), 240_000_000)));

        assertEq(written, 1);
        assertTrue(reg.recordedDecision(bytes32("d1")));
    }

    function test_RecordDecisions_DuplicateIdIsNoOp() public {
        vm.startPrank(emitter);
        assertEq(reg.recordDecisions(_one(_decision(bytes32("d1"), 1))), 1);
        // A retried batch must not revert, and must not double-write.
        assertEq(reg.recordDecisions(_one(_decision(bytes32("d1"), 1))), 0);
        vm.stopPrank();
    }

    function test_RecordDecisions_BatchWithDuplicate_RecordsOnlyNew() public {
        vm.startPrank(emitter);
        reg.recordDecisions(_one(_decision(bytes32("d1"), 1)));

        CapabilityRegistry.DecisionRecord[] memory batch = new CapabilityRegistry.DecisionRecord[](3);
        batch[0] = _decision(bytes32("d1"), 1); // already written
        batch[1] = _decision(bytes32("d2"), 2);
        batch[2] = _decision(bytes32("d3"), 3);

        // One stale entry must not poison the rest of the batch.
        assertEq(reg.recordDecisions(batch), 2);
        vm.stopPrank();

        assertTrue(reg.recordedDecision(bytes32("d2")));
        assertTrue(reg.recordedDecision(bytes32("d3")));
    }

    function test_RecordDecisions_RevertsForNonEmitter() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        reg.recordDecisions(_one(_decision(bytes32("d1"), 1)));
    }

    /// @dev The log is append-only truth, not an enforcement point. Suppressing
    ///      post-revocation records would hide the anomaly an auditor needs.
    function test_RecordDecisions_StillRecordsForRevokedAgent() public {
        vm.prank(owner);
        reg.revokeAgent(agent, 4001);

        vm.prank(emitter);
        assertEq(reg.recordDecisions(_one(_decision(bytes32("d9"), 500))), 1);

        assertTrue(reg.recordedDecision(bytes32("d9")));
        assertTrue(reg.isRevoked(agent));
    }

    function test_RecordDecisions_RevertsOnEmptyBatch() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.EmptyBatch.selector);
        reg.recordDecisions(new CapabilityRegistry.DecisionRecord[](0));
    }

    /// @dev Malformed input is an emitter bug, not a race — fail closed.
    function test_RecordDecisions_RevertsOnInvalidDecisionEnum() public {
        CapabilityRegistry.DecisionRecord memory r = _decision(bytes32("d1"), 1);
        r.decision = 9;

        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.InvalidDecision.selector, uint8(9)));
        reg.recordDecisions(_one(r));
    }

    function test_RecordDecisions_RevertsOnInvalidTier() public {
        CapabilityRegistry.DecisionRecord memory r = _decision(bytes32("d1"), 1);
        r.tierAtDecision = 7;

        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.InvalidTier.selector, uint8(7)));
        reg.recordDecisions(_one(r));
    }

    function test_RecordDecisions_RevertsOnZeroId() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        reg.recordDecisions(_one(_decision(bytes32(0), 1)));
    }

    // --------------------------------------------------------------- uses --

    function test_RecordUses_DuplicateJtiIsNoOp() public {
        vm.startPrank(emitter);
        assertEq(reg.recordUses(_use(bytes32("d1"), bytes32("j1"))), 1);
        assertEq(reg.recordUses(_use(bytes32("d1"), bytes32("j1"))), 0);
        vm.stopPrank();

        assertTrue(reg.recordedUse(bytes32("j1")));
    }

    // ------------------------------------------------------- emitter rotation --

    function test_SetEmitter_RotatesAndOldKeyRejected() public {
        address fresh = address(0xF00D);

        vm.startPrank(owner);
        reg.setEmitter(fresh, true);
        reg.setEmitter(emitter, false); // containment after a leak
        vm.stopPrank();

        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        reg.recordDecisions(_one(_decision(bytes32("d1"), 1)));

        vm.prank(fresh);
        assertEq(reg.recordDecisions(_one(_decision(bytes32("d1"), 1))), 1);
    }

    function test_SetEmitter_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.setEmitter(stranger, true);
    }

    // ------------------------------------------------------------- resources --

    function test_RegisterResource_EmitsReadablePreimage() public {
        string memory name = "coingecko.price.read";

        vm.expectEmit(true, false, false, true);
        emit ResourceRegistered(keccak256(bytes(name)), name, 0);

        vm.prank(owner);
        bytes32 resource = reg.registerResource(name, 0);

        assertEq(resource, keccak256(bytes(name)));
    }

    function test_RegisterResource_RevertsOnEmptyName() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.EmptyResourceName.selector);
        reg.registerResource("", 0);
    }

    // ----------------------------------------------------------- risk score --

    function test_UpdateRiskScore_EmitsTierTransition() public {
        vm.expectEmit(true, false, false, true);
        emit RiskScoreUpdated(
            agent,
            820,
            uint8(CapabilityRegistry.Tier.Elevated),
            uint8(CapabilityRegistry.Tier.Verified),
            keccak256("evidence"),
            1_757_000_100
        );

        vm.prank(emitter);
        reg.updateRiskScore(
            agent,
            820,
            uint8(CapabilityRegistry.Tier.Elevated),
            uint8(CapabilityRegistry.Tier.Verified),
            keccak256("evidence"),
            1_757_000_100
        );
    }

    function test_UpdateRiskScore_RevertsAboveRange() public {
        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.ScoreOutOfRange.selector, uint16(1001)));
        reg.updateRiskScore(agent, 1001, 0, 0, bytes32(0), 0);
    }

    // ---------------------------------------------------------------- fuzz --

    /// @dev notionalUsdE6 is the detector's primary signal; it must survive the
    ///      full uint64 range without truncation.
    function testFuzz_NotionalUsdE6_NoOverflowAtUint64Bound(uint64 notional, uint256 idSeed) public {
        bytes32 id = keccak256(abi.encode(idSeed));
        vm.assume(id != bytes32(0));

        vm.expectEmit(true, true, true, true);
        emit CapabilityDecided(
            id,
            agent,
            keccak256("usdc.transfer"),
            uint8(CapabilityRegistry.Decision.Allow),
            1000,
            notional,
            uint8(CapabilityRegistry.Tier.Verified),
            uint8(CapabilityRegistry.ConfirmationMode.LedgerEip712),
            keccak256("params"),
            1_757_000_000
        );

        vm.prank(emitter);
        assertEq(reg.recordDecisions(_one(_decision(id, notional))), 1);
    }

    function testFuzz_OnlyOwnerCanRevoke(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.revokeAgent(agent, 1);
    }

    // ------------------------------------------------- previously untested --

    event PrincipalEnrolled(
        bytes32 indexed nullifierHash, address indexed principal, uint8 verificationLevel, uint64 enrolledAt
    );
    event AgentRegistered(
        address indexed agent,
        bytes32 indexed principalNullifier,
        bytes32 agentPubKeyHash,
        uint64 registeredAt
    );
    event ConfirmationRecorded(
        bytes32 indexed decisionId,
        address indexed confirmer,
        uint8 mode,
        bytes32 typedDataHash,
        uint64 confirmedAt
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function test_EnrollPrincipal_EmitsNullifierNeverPii() public {
        vm.expectEmit(true, true, false, true);
        emit PrincipalEnrolled(bytes32("nullifier"), agent, 1, 1_757_000_000);

        vm.prank(emitter);
        reg.enrollPrincipal(bytes32("nullifier"), agent, 1, 1_757_000_000);
    }

    function test_EnrollPrincipal_RevertsForNonEmitter() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        reg.enrollPrincipal(bytes32("n"), agent, 1, 0);
    }

    function test_EnrollPrincipal_RevertsOnZeroNullifier() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        reg.enrollPrincipal(bytes32(0), agent, 1, 0);
    }

    function test_RegisterAgent_BindsAgentToPrincipal() public {
        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(agent, bytes32("nullifier"), keccak256("pubkey"), 1_757_000_000);

        vm.prank(emitter);
        reg.registerAgent(agent, bytes32("nullifier"), keccak256("pubkey"), 1_757_000_000);
    }

    function test_RegisterAgent_RevertsForNonEmitter() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        reg.registerAgent(agent, bytes32("n"), keccak256("k"), 0);
    }

    function test_RegisterAgent_RevertsOnZeroPubKeyHash() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        reg.registerAgent(agent, bytes32("n"), bytes32(0), 0);
    }

    /// @dev typedDataHash is what binds a Ledger approval to those exact parameters.
    function test_RecordConfirmation_CarriesTypedDataHash() public {
        vm.expectEmit(true, true, false, true);
        emit ConfirmationRecorded(
            bytes32("d1"),
            agent,
            uint8(CapabilityRegistry.ConfirmationMode.LedgerEip712),
            keccak256("eip712"),
            1_757_000_020
        );

        vm.prank(emitter);
        reg.recordConfirmation(
            bytes32("d1"),
            agent,
            uint8(CapabilityRegistry.ConfirmationMode.LedgerEip712),
            keccak256("eip712"),
            1_757_000_020
        );
    }

    function test_RecordConfirmation_RevertsOnInvalidMode() public {
        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.InvalidConfirmationMode.selector, uint8(9)));
        reg.recordConfirmation(bytes32("d1"), agent, 9, bytes32(0), 0);
    }

    function test_RecordConfirmation_RevertsForNonEmitter() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        reg.recordConfirmation(bytes32("d1"), agent, 0, bytes32(0), 0);
    }

    function test_TransferOwnership_MovesKillSwitch() public {
        address newOwner = address(0xDEAD01);

        vm.expectEmit(true, true, false, true);
        emit OwnershipTransferred(owner, newOwner);
        vm.prank(owner);
        reg.transferOwnership(newOwner);

        assertEq(reg.owner(), newOwner);

        // old owner loses the kill switch, new owner gains it
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.revokeAgent(agent, 1);

        vm.prank(newOwner);
        reg.revokeAgent(agent, 1);
        assertTrue(reg.isRevoked(agent));
    }

    function test_TransferOwnership_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.transferOwnership(stranger);
    }

    function test_TransferOwnership_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        reg.transferOwnership(address(0));
    }

    function test_RecordUses_RevertsForNonEmitter() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        reg.recordUses(new CapabilityRegistry.UseRecord[](1));
    }

    function test_RecordUses_RevertsOnEmptyBatch() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.EmptyBatch.selector);
        reg.recordUses(new CapabilityRegistry.UseRecord[](0));
    }
}
