// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract MockWorldIDRouter {
    bool public shouldRevert;
    uint256 public lastRoot;
    uint256 public lastGroupId;
    uint256 public lastSignalHash;
    uint256 public lastNullifierHash;
    uint256 public lastExternalNullifierHash;
    uint256[8] public lastProof;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external {
        if (shouldRevert) revert("invalid proof");
        lastRoot = root;
        lastGroupId = groupId;
        lastSignalHash = signalHash;
        lastNullifierHash = nullifierHash;
        lastExternalNullifierHash = externalNullifierHash;
        lastProof = proof;
    }
}
