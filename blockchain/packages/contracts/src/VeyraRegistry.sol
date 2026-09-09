// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external;
}

/// @title VeyraRegistry
/// @notice Stores Ledger Key Ring identifiers and authorizes agents with World ID proofs.
contract VeyraRegistry {
    error EmptySecretIdentifier();
    error InvalidAddress();
    error InvalidNullifier();
    error NullifierAlreadyUsed();

    event AgentAuthorized(address indexed user, address agent, string secretIdentifier);

    IWorldID public immutable worldId;
    uint256 public immutable groupId;
    uint256 public immutable externalNullifierHash;

    mapping(address => string[]) public userSecretIdentifiers;
    mapping(uint256 => bool) public nullifierHashUsed;

    constructor(address worldIdAddress, uint256 worldIdGroupId, uint256 worldIdExternalNullifierHash) {
        if (worldIdAddress == address(0)) revert InvalidAddress();

        worldId = IWorldID(worldIdAddress);
        groupId = worldIdGroupId;
        externalNullifierHash = worldIdExternalNullifierHash;
    }

    function registerSecret(string memory secretIdentifier) external {
        if (bytes(secretIdentifier).length == 0) revert EmptySecretIdentifier();

        userSecretIdentifiers[msg.sender].push(secretIdentifier);
    }

    function authorizeAgent(
        address agentAddress,
        string memory secretIdentifier,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        if (agentAddress == address(0)) revert InvalidAddress();
        if (bytes(secretIdentifier).length == 0) revert EmptySecretIdentifier();
        if (nullifierHash == 0) revert InvalidNullifier();
        if (nullifierHashUsed[nullifierHash]) revert NullifierAlreadyUsed();

        uint256 signalHash = uint256(keccak256(abi.encodePacked(msg.sender)));
        worldId.verifyProof(
            root,
            groupId,
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
        );

        nullifierHashUsed[nullifierHash] = true;
        emit AgentAuthorized(msg.sender, agentAddress, secretIdentifier);
    }
}