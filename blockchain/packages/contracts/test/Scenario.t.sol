// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {IWorldID, VeyraRegistry} from "../src/VeyraRegistry.sol";

contract WorldIdStub is IWorldID {
    function verifyProof(uint256, uint256, uint256, uint256, uint256, uint256[8] calldata)
        external
        override
    {}
}

/// @notice Walks the demo end to end and prints observed state, so behaviour can be
///         compared against the design rather than assumed from it.
contract ScenarioTest is Test {
    CapabilityRegistry internal audit;
    VeyraRegistry internal gate;

    address internal owner = address(0xC0FFEE);
    address internal emitter = address(0xE471);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal agent = address(0xA6E7);

    bytes32 internal constant COINGECKO = keccak256("coingecko.price.read");
    bytes32 internal constant USDC = keccak256("usdc.transfer");

    function setUp() public {
        vm.startPrank(owner);
        audit = new CapabilityRegistry(emitter);
        gate = new VeyraRegistry(address(new WorldIdStub()), 1, 1, address(audit));
        vm.stopPrank();
    }

    /// @dev World ID's nullifier is deterministic in (identity, externalNullifier).
    ///      This contract fixes externalNullifierHash at construction, so a given human
    ///      produces the SAME nullifier for every authorization, forever.
    function test_CanAliceAuthorizeTwice() public {
        uint256[8] memory proof;

        vm.startPrank(alice);
        gate.registerUser(hex"a11ce5ec", 0);
        gate.storeSecret(COINGECKO, "coingecko.price.read", hex"c0de01");
        gate.storeSecret(USDC, "usdc.transfer", hex"c0de02");

        // Alice's real World ID nullifier for this app+action. It does not change.
        uint256 aliceNullifier = 0xA11CE;

        gate.authorizeAgent(agent, COINGECKO, 1, aliceNullifier, proof, bytes32("req-1"));
        console2.log("first authorization (coingecko): OK");

        try gate.authorizeAgent(agent, USDC, 1, aliceNullifier, proof, bytes32("req-2")) {
            console2.log("second authorization (usdc): OK");
        } catch {
            console2.log("second authorization (usdc): BLOCKED - nullifier already spent");
            console2.log("  -> a human can authorize exactly ONCE, ever, against this contract");
        }
        vm.stopPrank();
    }

    function test_Walkthrough() public {
        uint256[8] memory proof;

        console2.log("=== 1. two users connect wallets ===");
        vm.prank(alice);
        gate.registerUser(hex"a11ce5ec", 0);
        vm.prank(bob);
        gate.registerUser(hex"b0b5ec", 1);
        console2.log("users registered:", gate.userCount());
        console2.log("alice leaf index:", gate.getUser(alice).leafIndex);
        console2.log("bob leaf index:  ", gate.getUser(bob).leafIndex);

        console2.log("");
        console2.log("=== 2. alice stores two encrypted secrets ===");
        vm.startPrank(alice);
        gate.storeSecret(COINGECKO, "coingecko.price.read", hex"c0de01");
        gate.storeSecret(USDC, "usdc.transfer", hex"c0de02");
        vm.stopPrank();
        console2.log("alice secret count:", gate.secretIdsOf(alice).length);
        console2.log("bob secret count:  ", gate.secretIdsOf(bob).length);
        console2.log("usdc ciphertext version:", gate.getSecret(alice, USDC).version);

        console2.log("");
        console2.log("=== 3. can bob authorize against alice's secret? ===");
        vm.prank(bob);
        try gate.authorizeAgent(agent, USDC, 1, 100, proof, bytes32("req-x")) {
            console2.log("!! BOB SUCCEEDED - cross-user access is possible");
        } catch {
            console2.log("blocked: bob cannot reach alice's secret");
        }

        console2.log("");
        console2.log("=== 4. alice authorizes the agent (x402 requestId req-1) ===");
        vm.prank(alice);
        gate.authorizeAgent(agent, USDC, 1, 101, proof, bytes32("req-1"));
        console2.log("nullifier 101 spent:", gate.nullifierHashUsed(101));

        console2.log("");
        console2.log("=== 5. emitter mirrors the decision into the audit log ===");
        CapabilityRegistry.DecisionRecord[] memory batch = new CapabilityRegistry.DecisionRecord[](1);
        batch[0] = CapabilityRegistry.DecisionRecord({
            decisionId: bytes32("d1"),
            agent: agent,
            resource: USDC,
            decision: uint8(CapabilityRegistry.Decision.Allow),
            reasonCode: 1000,
            notionalUsdE6: 240_000_000,
            tierAtDecision: uint8(CapabilityRegistry.Tier.Verified),
            confirmationMode: uint8(CapabilityRegistry.ConfirmationMode.LedgerEip712),
            paramsHash: keccak256("to=0x..,amount=240"),
            occurredAt: 1_757_000_000
        });
        vm.prank(emitter);
        console2.log("records written:", audit.recordDecisions(batch));
        vm.prank(emitter);
        console2.log("same batch resubmitted, written:", audit.recordDecisions(batch));

        console2.log("");
        console2.log("=== 6. detector spots value creep, downgrades the tier ===");
        vm.prank(emitter);
        audit.updateRiskScore(
            agent,
            820,
            uint8(CapabilityRegistry.Tier.Elevated),
            uint8(CapabilityRegistry.Tier.Verified),
            keccak256("drift"),
            1_757_000_100
        );
        console2.log("risk score recorded on chain (event only, no storage)");

        console2.log("");
        console2.log("=== 7. owner pulls the kill switch ===");
        vm.prank(owner);
        audit.revokeAgent(agent, 4001);
        console2.log("agent revoked:", audit.isRevoked(agent));

        vm.prank(alice);
        try gate.authorizeAgent(agent, USDC, 1, 102, proof, bytes32("req-2")) {
            console2.log("!! AUTHORIZED AFTER REVOCATION - kill switch is not wired");
        } catch {
            console2.log("blocked: revoked agent cannot be authorized");
        }

        console2.log("");
        console2.log("=== 8. can the emitter still log for a revoked agent? ===");
        batch[0].decisionId = bytes32("d2");
        vm.prank(emitter);
        uint256 w = audit.recordDecisions(batch);
        console2.log("post-revocation decisions still recorded:", w);
        console2.log("(by design: the log is append-only truth, not an enforcement point)");

        console2.log("");
        console2.log("=== 9. alice revokes her own secret ===");
        vm.prank(owner);
        audit.reinstateAgent(agent);
        vm.prank(alice);
        gate.revokeSecret(USDC);
        vm.prank(alice);
        try gate.authorizeAgent(agent, USDC, 1, 103, proof, bytes32("req-3")) {
            console2.log("!! AUTHORIZED A REVOKED SECRET");
        } catch {
            console2.log("blocked: inactive secret cannot be authorized");
        }

        console2.log("");
        console2.log("=== 10. is the ciphertext still readable after revocation? ===");
        bytes memory stillThere = gate.getSecret(alice, USDC).ciphertext;
        console2.log("ciphertext length still on chain:", stillThere.length);
        console2.log("active flag:", gate.getSecret(alice, USDC).active);
    }
}
