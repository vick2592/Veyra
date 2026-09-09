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
///   DEPLOYER_PRIVATE_KEY              required
///   WORLD_ID_ADDRESS                  required — World ID router for the target chain
///   WORLD_ID_GROUP_ID                 required
///   WORLD_ID_EXTERNAL_NULLIFIER_HASH  required
///   EMITTER_ADDRESS                   optional — hot key allowed to append audit records
///   CAPABILITY_REGISTRY_ADDRESS       optional — reuse an existing audit registry
contract DeployVeyraRegistry is Script {
    function run() external returns (CapabilityRegistry capabilityRegistry, VeyraRegistry registry) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address worldIdAddress = vm.envAddress("WORLD_ID_ADDRESS");
        uint256 worldIdGroupId = vm.envUint("WORLD_ID_GROUP_ID");
        uint256 worldIdExternalNullifierHash = vm.envUint("WORLD_ID_EXTERNAL_NULLIFIER_HASH");
        address emitter = vm.envOr("EMITTER_ADDRESS", vm.addr(deployerPrivateKey));
        address existingAudit = vm.envOr("CAPABILITY_REGISTRY_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        if (existingAudit == address(0)) {
            capabilityRegistry = new CapabilityRegistry(emitter);
        } else {
            capabilityRegistry = CapabilityRegistry(existingAudit);
        }

        registry = new VeyraRegistry(
            worldIdAddress, worldIdGroupId, worldIdExternalNullifierHash, address(capabilityRegistry)
        );

        vm.stopBroadcast();

        console2.log("CapabilityRegistry", address(capabilityRegistry));
        console2.log("VeyraRegistry     ", address(registry));
        console2.log("World ID verifier ", worldIdAddress);
        console2.log("World ID group ID ", worldIdGroupId);
        console2.log("External nullifier", worldIdExternalNullifierHash);
        console2.log("Audit emitter     ", emitter);
    }
}
