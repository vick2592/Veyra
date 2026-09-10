// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";

contract CapabilityRegistryTest is Test {
    CapabilityRegistry internal reg;

    address internal owner = address(0xC0FFEE);
    address internal stranger = address(0xBAD);
    address internal agent = address(0xA6E7);

    event AgentRevoked(address indexed agent, address indexed by, uint16 reasonCode, uint64 revokedAt);
    event AgentReinstated(address indexed agent, address indexed by, uint64 reinstatedAt);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function setUp() public {
        vm.prank(owner);
        reg = new CapabilityRegistry();
    }

    function test_Constructor_SetsOwner() public view {
        assertEq(reg.owner(), owner);
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

    function test_RevokeAgent_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        reg.revokeAgent(address(0), 1);
    }

    /// @dev A retried incident-response script must not fail halfway.
    function test_RevokeAgent_IsIdempotent() public {
        vm.startPrank(owner);
        reg.revokeAgent(agent, 4001);
        reg.revokeAgent(agent, 4001);
        vm.stopPrank();

        assertTrue(reg.isRevoked(agent));
    }

    function test_ReinstateAgent_ClearsFlag() public {
        vm.startPrank(owner);
        reg.revokeAgent(agent, 4001);

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

    function test_ReinstateAgent_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CapabilityRegistry.ZeroAddress.selector);
        reg.reinstateAgent(address(0));
    }

    function test_ReinstateAgent_IsIdempotentWhenNotRevoked() public {
        vm.prank(owner);
        reg.reinstateAgent(agent);
        assertFalse(reg.isRevoked(agent));
    }

    // ------------------------------------------------------------ ownership --

    function test_TransferOwnership_MovesKillSwitch() public {
        address newOwner = address(0xDEAD01);

        vm.expectEmit(true, true, false, true);
        emit OwnershipTransferred(owner, newOwner);
        vm.prank(owner);
        reg.transferOwnership(newOwner);

        assertEq(reg.owner(), newOwner);

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

    // ----------------------------------------------------------------- fuzz --

    function testFuzz_OnlyOwnerCanRevoke(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(CapabilityRegistry.NotOwner.selector);
        reg.revokeAgent(agent, 1);
    }

    function testFuzz_RevokeThenReinstateRoundTrips(address anyAgent, uint16 reasonCode) public {
        vm.assume(anyAgent != address(0));

        vm.startPrank(owner);
        reg.revokeAgent(anyAgent, reasonCode);
        assertTrue(reg.isRevoked(anyAgent));
        reg.reinstateAgent(anyAgent);
        assertFalse(reg.isRevoked(anyAgent));
        vm.stopPrank();
    }
}
