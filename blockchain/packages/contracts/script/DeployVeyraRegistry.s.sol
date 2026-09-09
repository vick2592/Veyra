// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {VeyraRegistry} from "../src/VeyraRegistry.sol";

contract DeployVeyraRegistry is Script {
    function run() external returns (VeyraRegistry registry) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address worldIdAddress = vm.envAddress("WORLD_ID_ADDRESS");
        uint256 worldIdGroupId = vm.envUint("WORLD_ID_GROUP_ID");
        uint256 worldIdExternalNullifierHash = vm.envUint("WORLD_ID_EXTERNAL_NULLIFIER_HASH");

        vm.startBroadcast(deployerPrivateKey);
        registry = new VeyraRegistry(
            worldIdAddress,
            worldIdGroupId,
            worldIdExternalNullifierHash
        );
        vm.stopBroadcast();

        console2.log("VeyraRegistry deployed at", address(registry));
        console2.log("World ID verifier", worldIdAddress);
        console2.log("World ID group ID", worldIdGroupId);
        console2.log("External nullifier hash", worldIdExternalNullifierHash);
    }
}