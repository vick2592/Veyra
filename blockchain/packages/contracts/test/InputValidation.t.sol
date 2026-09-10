// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {VeyraRegistry} from "../src/VeyraRegistry.sol";

/// @notice Every guard on every entry point. These are the branches a happy-path suite
///         never reaches, and they are exactly the ones that keep bad input out of an
///         append-only log.
contract InputValidationTest is Test {
    CapabilityRegistry internal audit;
    VeyraRegistry internal registry;

    address internal owner = address(0xC0FFEE);
    address internal emitter = address(0xE471);
    address internal stranger = address(0xBAD);
    address internal registrar = address(0x5E4E4);
    address internal user = address(0xBEEF);
    address internal agent = address(0xA6E7);

    bytes32 internal constant SECRET_ID = keccak256("openai-api-key");

    function setUp() public {
        vm.startPrank(owner);
        audit = new CapabilityRegistry(emitter);
        registry = new VeyraRegistry(address(audit), registrar);
        vm.stopPrank();

        vm.startPrank(user);
        registry.registerUser(hex"01", 0);
        registry.storeSecret(SECRET_ID, "openai-api-key", hex"cafe");
        vm.stopPrank();
    }

    function _decision(bytes32 id) internal view returns (CapabilityRegistry.DecisionRecord[] memory b) {
        b = new CapabilityRegistry.DecisionRecord[](1);
        b[0] = CapabilityRegistry.DecisionRecord({
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
    }

    function _use(bytes32 id, bytes32 jti) internal view returns (CapabilityRegistry.UseRecord[] memory b) {
        b = new CapabilityRegistry.UseRecord[](1);
        b[0] = CapabilityRegistry.UseRecord({
            decisionId: id, agent: agent, jti: jti, upstreamOk: true, reasonCode: 0, usedAt: 1
        });
    }

    // ============================================== CapabilityRegistry guards ==

    function test_SetEmitter_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.setEmitter(address(0), true);
    }

    function test_SetEmitter_CanDisableAnEmitter() public {
        vm.prank(owner);
        audit.setEmitter(emitter, false);
        assertFalse(audit.isEmitter(emitter));
    }

    function test_RevokeAgent_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.revokeAgent(address(0), 1);
    }

    function test_ReinstateAgent_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.reinstateAgent(address(0));
    }

    function test_ReinstateAgent_IsIdempotentWhenNotRevoked() public {
        vm.prank(owner);
        audit.reinstateAgent(agent); // never revoked — must be a silent no-op
        assertFalse(audit.isRevoked(agent));
    }

    function test_EnrollPrincipal_RevertsOnZeroPrincipal() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.enrollPrincipal(bytes32("n"), address(0), 1, 0);
    }

    function test_RegisterAgent_RevertsOnZeroAgent() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.registerAgent(address(0), bytes32("n"), keccak256("k"), 0);
    }

    function test_RegisterAgent_RevertsOnZeroPrincipalNullifier() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        audit.registerAgent(agent, bytes32(0), keccak256("k"), 0);
    }

    function test_RecordDecisions_RevertsOnZeroAgentInRecord() public {
        CapabilityRegistry.DecisionRecord[] memory b = _decision(bytes32("d1"));
        b[0].agent = address(0);

        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.recordDecisions(b);
    }

    function test_RecordDecisions_RevertsOnInvalidConfirmationMode() public {
        CapabilityRegistry.DecisionRecord[] memory b = _decision(bytes32("d1"));
        b[0].confirmationMode = 9;

        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.InvalidConfirmationMode.selector, uint8(9)));
        audit.recordDecisions(b);
    }

    function test_RecordUses_RevertsOnZeroDecisionId() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        audit.recordUses(_use(bytes32(0), bytes32("j1")));
    }

    function test_RecordUses_RevertsOnZeroJti() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        audit.recordUses(_use(bytes32("d1"), bytes32(0)));
    }

    function test_RecordUses_RevertsOnZeroAgent() public {
        CapabilityRegistry.UseRecord[] memory b = _use(bytes32("d1"), bytes32("j1"));
        b[0].agent = address(0);

        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.recordUses(b);
    }

    function test_RecordUses_BatchWithDuplicateJtiRecordsOnlyNew() public {
        vm.startPrank(emitter);
        audit.recordUses(_use(bytes32("d1"), bytes32("j1")));

        CapabilityRegistry.UseRecord[] memory b = new CapabilityRegistry.UseRecord[](2);
        b[0] = _use(bytes32("d1"), bytes32("j1"))[0];
        b[1] = _use(bytes32("d2"), bytes32("j2"))[0];
        assertEq(audit.recordUses(b), 1);
        vm.stopPrank();
    }

    function test_RecordConfirmation_RevertsOnZeroDecisionId() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroId.selector);
        audit.recordConfirmation(bytes32(0), agent, 0, bytes32(0), 0);
    }

    function test_RecordConfirmation_RevertsOnZeroConfirmer() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.recordConfirmation(bytes32("d1"), address(0), 0, bytes32(0), 0);
    }

    function test_UpdateRiskScore_RevertsOnZeroAgent() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        audit.updateRiskScore(address(0), 1, 0, 0, bytes32(0), 0);
    }

    function test_UpdateRiskScore_RevertsOnInvalidPriorTier() public {
        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.InvalidTier.selector, uint8(9)));
        audit.updateRiskScore(agent, 1, 9, 0, bytes32(0), 0);
    }

    function test_UpdateRiskScore_RevertsOnInvalidNewTier() public {
        vm.prank(emitter);
        vm.expectRevert(abi.encodeWithSelector(CapabilityRegistry.InvalidTier.selector, uint8(9)));
        audit.updateRiskScore(agent, 1, 0, 9, bytes32(0), 0);
    }

    function test_UpdateRiskScore_AcceptsBoundaryScore() public {
        vm.prank(emitter);
        audit.updateRiskScore(agent, 1000, 0, 0, bytes32(0), 0); // 1000 is the max, not out of range
    }

    function test_UpdateRiskScore_RevertsForNonEmitter() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotEmitter.selector);
        audit.updateRiskScore(agent, 1, 0, 0, bytes32(0), 0);
    }

    /// @dev onlyOwner is inlined per function, so each call site is its own branch.
    ///      Resource registration is the one that had no non-owner test.
    function test_RegisterResource_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        audit.registerResource("coingecko.price.read", 0);
    }

    function test_RegisterResource_RevertsForEmitter() public {
        vm.prank(emitter);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        audit.registerResource("coingecko.price.read", 0);
    }

    // =================================================== VeyraRegistry guards ==

    function test_TransferOwnership_MovesOwner() public {
        vm.prank(owner);
        registry.transferOwnership(stranger);
        assertEq(registry.owner(), stranger);

        // the old owner can no longer repoint the audit registry
        vm.prank(owner);
        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        registry.setAuditRegistry(address(audit));

        vm.prank(stranger);
        registry.setAuditRegistry(address(audit));
    }

    function test_TransferOwnership_RevertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(VeyraRegistry.NotOwner.selector);
        registry.transferOwnership(stranger);
    }

    function test_TransferOwnership_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.transferOwnership(address(0));
    }

    function test_SetAuditRegistry_RepointsAndTakesEffect() public {
        vm.startPrank(owner);
        CapabilityRegistry fresh = new CapabilityRegistry(emitter);
        registry.setAuditRegistry(address(fresh));
        assertEq(address(registry.auditRegistry()), address(fresh));

        // revocation in the OLD registry must no longer block anything
        audit.revokeAgent(agent, 1);
        vm.stopPrank();
        vm.prank(user);
        registry.authorizeAgent(agent, SECRET_ID, 42, bytes32("r1"));
        assertTrue(registry.requestIdUsed(bytes32("r1")));
    }

    function test_RotateUserId_RevertsOnEmptyId() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.EmptyUserId.selector);
        registry.rotateUserId("");
    }

    function test_RotateUserId_RevertsWhenNotRegistered() public {
        vm.prank(stranger);
        vm.expectRevert(VeyraRegistry.UserNotRegistered.selector);
        registry.rotateUserId(hex"aa");
    }

    function test_StoreSecret_RevertsOnZeroSecretId() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.SecretNotFound.selector);
        registry.storeSecret(bytes32(0), "label", hex"cafe");
    }

    function test_StoreSecret_RevertsOnEmptyLabel() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.EmptyLabel.selector);
        registry.storeSecret(keccak256("other"), "", hex"cafe");
    }

    function test_RevokeSecret_RevertsForUnknownSecret() public {
        vm.prank(user);
        vm.expectRevert(VeyraRegistry.SecretNotFound.selector);
        registry.revokeSecret(keccak256("never-stored"));
    }

    function test_RevokeSecret_RevertsWhenAlreadyInactive() public {
        vm.startPrank(user);
        registry.revokeSecret(SECRET_ID);
        vm.expectRevert(VeyraRegistry.SecretInactive.selector);
        registry.revokeSecret(SECRET_ID);
        vm.stopPrank();
    }

    function test_RevokeSecret_RevertsWhenNotRegistered() public {
        vm.prank(stranger);
        vm.expectRevert(VeyraRegistry.UserNotRegistered.selector);
        registry.revokeSecret(SECRET_ID);
    }

    function test_StoreSecret_ReactivatesARevokedSecret() public {
        vm.startPrank(user);
        registry.revokeSecret(SECRET_ID);
        assertFalse(registry.getSecret(user, SECRET_ID).active);

        registry.storeSecret(SECRET_ID, "openai-api-key", hex"beef");
        vm.stopPrank();

        assertTrue(registry.getSecret(user, SECRET_ID).active);
        assertEq(registry.getSecret(user, SECRET_ID).version, 2);
    }

    function test_UserAt_RevertsPastEnd() public {
        vm.expectRevert();
        registry.userAt(99);
    }

    function test_ListUsers_ZeroLimitReturnsEmpty() public view {
        assertEq(registry.listUsers(0, 0).length, 0);
    }

    function test_GetSecret_UnknownReturnsEmptyRecord() public view {
        VeyraRegistry.Secret memory s = registry.getSecret(user, keccak256("nope"));
        assertEq(s.version, 0);
        assertFalse(s.active);
    }

    function test_SecretIdsOf_EmptyForUnknownUser() public view {
        assertEq(registry.secretIdsOf(stranger).length, 0);
    }

    function test_SetRegistrar_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.setRegistrar(address(0), true);
    }

    function test_SetAuditRegistry_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(VeyraRegistry.InvalidAddress.selector);
        registry.setAuditRegistry(address(0));
    }

    function test_StoreSecretFor_RevertsOnEmptyCiphertext() public {
        vm.prank(registrar);
        registry.registerUserFor(stranger, hex"01", 3);

        vm.prank(registrar);
        vm.expectRevert(VeyraRegistry.EmptyCiphertext.selector);
        registry.storeSecretFor(stranger, SECRET_ID, "label", "");
    }
}
