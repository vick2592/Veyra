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
/// World ID is verified off chain by the backend against the Developer Portal, so no
/// router address or external nullifier is needed here.
contract DeployVeyraRegistry is Script {
    function run() external returns (CapabilityRegistry capabilityRegistry, VeyraRegistry registry) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address registrar = vm.envOr("REGISTRAR_ADDRESS", deployer);
        address existingAudit = vm.envOr("CAPABILITY_REGISTRY_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        if (existingAudit == address(0)) {
            capabilityRegistry = new CapabilityRegistry();
        } else {
            capabilityRegistry = CapabilityRegistry(existingAudit);
        }

        registry = new VeyraRegistry(address(capabilityRegistry), registrar);

        vm.stopBroadcast();

        console2.log("CapabilityRegistry", address(capabilityRegistry));
        console2.log("VeyraRegistry     ", address(registry));
        console2.log("Owner             ", deployer);
        console2.log("Registrar         ", registrar);
    }
}
