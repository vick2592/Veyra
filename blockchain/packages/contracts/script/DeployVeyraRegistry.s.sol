// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CapabilityRegistry} from "../src/CapabilityRegistry.sol";
import {VeyraRegistry} from "../src/VeyraRegistry.sol";

/// @notice Deploys the audit registry then the gate, because VeyraRegistry requires a
///         non-zero CapabilityRegistry at construction — that is what makes the kill
///         switch impossible to leave unwired.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY         required
///   REGISTRAR_ADDRESS            optional — backend key allowed to register users and
///                                store secrets on their behalf. Defaults to deployer.
///   CAPABILITY_REGISTRY_ADDRESS  optional — reuse an existing kill-switch registry.
///
contract DeployVeyraRegistry is Script {
    function run() external returns (CapabilityRegistry capabilityRegistry, VeyraRegistry registry) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address registrar = vm.envOr("REGISTRAR_ADDRESS", deployer);
        address existingAudit = vm.envOr("CAPABILITY_REGISTRY_ADDRESS", address(0));
        uint256 appIdHash = uint256(keccak256(abi.encodePacked("app_30cf964190e1900108f1a3abb75d39c0"))) >> 8;
        uint256 externalNullifier = uint256(keccak256(abi.encodePacked(appIdHash, "execute-agent"))) >> 8;
        address worldIdRouter = vm.envAddress("WORLD_ID_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        if (existingAudit == address(0)) {
            capabilityRegistry = new CapabilityRegistry();
        } else {
            capabilityRegistry = CapabilityRegistry(existingAudit);
        }

        registry =
            new VeyraRegistry(address(capabilityRegistry), registrar, worldIdRouter, 1, externalNullifier);

        vm.stopBroadcast();

        console2.log("CapabilityRegistry", address(capabilityRegistry));
        console2.log("VeyraRegistry     ", address(registry));
        console2.log("Owner             ", deployer);
        console2.log("Registrar         ", registrar);
        console2.log("World ID group    ", uint256(1));
        console2.log("External nullifier", externalNullifier);
    }
}
