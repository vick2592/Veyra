// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {VeyraRegistry} from "../src/VeyraRegistry.sol";

/// @notice Walks the demo end to end and prints observed state, so behaviour can be
///         compared against the design rather than assumed from it.
contract ScenarioTest is Test {
    CapabilityRegistry internal audit;
    VeyraRegistry internal gate;

    address internal owner = address(0xC0FFEE);
    address internal registrar = address(0x5E4E4);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal agent = address(0xA6E7);

    bytes32 internal constant COINGECKO = keccak256("coingecko.price.read");
    bytes32 internal constant USDC = keccak256("usdc.transfer");

    function setUp() public {
        vm.startPrank(owner);
        audit = new CapabilityRegistry();
        gate = new VeyraRegistry(address(audit), registrar);
        vm.stopPrank();
    }

    /// @dev The bug that used to kill the demo: a fixed external nullifier meant one
    ///      human had one usable World ID nullifier for the life of the deployment, so
    ///      they could authorize exactly once. Replay is now scoped to the paid
    ///      request instead, so this must succeed repeatedly.
    function test_AliceCanAuthorizeRepeatedly() public {
        vm.startPrank(alice);
        gate.registerUser(hex"a11ce5ec", 0);
        gate.storeSecret(COINGECKO, "coingecko.price.read", hex"c0de01");
        gate.storeSecret(USDC, "usdc.transfer", hex"c0de02");

        gate.authorizeAgent(agent, COINGECKO, 0xA11CE, bytes32("req-1"));
        console2.log("1st authorization (coingecko, req-1): OK");

        gate.authorizeAgent(agent, USDC, 0xA11CE, bytes32("req-2"));
        console2.log("2nd authorization (usdc, req-2):      OK  <- used to be impossible");

        gate.authorizeAgent(agent, COINGECKO, 0xA11CE, bytes32("req-3"));
        console2.log("3rd authorization (coingecko, req-3): OK");
        vm.stopPrank();
    }

    function test_Walkthrough() public {
        console2.log("=== 1. two users register (server-side, via registrar) ===");
        vm.startPrank(registrar);
        gate.registerUserFor(alice, hex"a11ce5ec", 0);
        gate.registerUserFor(bob, hex"b0b5ec", 1);
        vm.stopPrank();
        console2.log("users registered:", gate.userCount());
        console2.log("alice leaf index:", gate.getUser(alice).leafIndex);
        console2.log("bob leaf index:  ", gate.getUser(bob).leafIndex);

        console2.log("");
        console2.log("=== 2. backend stores each user's encrypted secrets ===");
        vm.startPrank(registrar);
        gate.storeSecretFor(alice, COINGECKO, "coingecko.price.read", hex"a11ce001");
        gate.storeSecretFor(alice, USDC, "usdc.transfer", hex"a11ce002");
        gate.storeSecretFor(bob, COINGECKO, "coingecko.price.read", hex"b0b001");
        vm.stopPrank();
        console2.log("alice secrets:", gate.secretIdsOf(alice).length);
        console2.log("bob secrets:  ", gate.secretIdsOf(bob).length);
        console2.log(
            "alice usdc ciphertext differs from bob's coingecko:",
            keccak256(gate.getSecret(alice, USDC).ciphertext)
                != keccak256(gate.getSecret(bob, COINGECKO).ciphertext)
        );

        console2.log("");
        console2.log("=== 3. can bob reach alice's secret? ===");
        vm.prank(bob);
        try gate.authorizeAgent(agent, USDC, 1, bytes32("req-x")) {
            console2.log("!! BOB SUCCEEDED - cross-user access is possible");
        } catch {
            console2.log("blocked: bob cannot reach alice's secret");
        }

        console2.log("");
        console2.log("=== 4. alice authorizes, twice, on two paid requests ===");
        vm.startPrank(alice);
        gate.authorizeAgent(agent, COINGECKO, 0xA11CE, bytes32("req-1"));
        gate.authorizeAgent(agent, USDC, 0xA11CE, bytes32("req-2"));
        vm.stopPrank();
        console2.log("req-1 used:", gate.requestIdUsed(bytes32("req-1")));
        console2.log("req-2 used:", gate.requestIdUsed(bytes32("req-2")));

        console2.log("");
        console2.log("=== 5. can a paid request be replayed? ===");
        vm.prank(alice);
        try gate.authorizeAgent(agent, USDC, 0xA11CE, bytes32("req-2")) {
            console2.log("!! REPLAY SUCCEEDED");
        } catch {
            console2.log("blocked: request id is single-use");
        }

        console2.log("");
        console2.log("=== 6. owner pulls the kill switch ===");
        vm.prank(owner);
        audit.revokeAgent(agent, 4001);
        console2.log("agent revoked:", audit.isRevoked(agent));

        vm.prank(alice);
        try gate.authorizeAgent(agent, COINGECKO, 0xA11CE, bytes32("req-3")) {
            console2.log("!! AUTHORIZED AFTER REVOCATION - kill switch not wired");
        } catch {
            console2.log("blocked: revoked agent cannot be authorized");
        }

        console2.log("");
        console2.log("=== 7. alice revokes her own secret ===");
        vm.prank(owner);
        audit.reinstateAgent(agent);
        vm.prank(alice);
        gate.revokeSecret(USDC);
        vm.prank(alice);
        try gate.authorizeAgent(agent, USDC, 0xA11CE, bytes32("req-4")) {
            console2.log("!! AUTHORIZED A REVOKED SECRET");
        } catch {
            console2.log("blocked: inactive secret cannot be authorized");
        }

        console2.log("");
        console2.log("=== 8. is the ciphertext still readable after revocation? ===");
        console2.log("ciphertext length still on chain:", gate.getSecret(alice, USDC).ciphertext.length);
        console2.log("active flag:", gate.getSecret(alice, USDC).active);
    }
}
