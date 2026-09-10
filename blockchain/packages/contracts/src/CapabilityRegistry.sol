// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title  CapabilityRegistry
/// @notice The agent kill switch. Holds, publicly and with a timestamp, which agents
///         are barred from being authorized.
///
/// @dev    This contract used to double as an append-only audit log feeding a subgraph:
///         decisions, capability uses, human confirmations, principal enrollment and
///         value-creep risk scores. That vertical was dropped, and with it every
///         consumer of those records — so they were removed rather than deployed as
///         code nothing reads. What remains is the one thing VeyraRegistry actually
///         depends on: `isRevoked`.
///
///         Revocation here does not by itself stop a request. The chain is not in the
///         request path — VeyraRegistry consults this contract when a user authorizes,
///         and the broker holds its own revocation state for anything off chain. What
///         this contract provides is a public, timestamped record of the decision, and
///         a single source of truth both can read.
contract CapabilityRegistry {
    // ----------------------------------------------------------------- errors --

    error NotOwner();
    error ZeroAddress();

    // ----------------------------------------------------------------- events --

    event AgentRevoked(address indexed agent, address indexed by, uint16 reasonCode, uint64 revokedAt);

    event AgentReinstated(address indexed agent, address indexed by, uint64 reinstatedAt);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------- storage --

    address public owner;

    mapping(address => bool) public isRevoked;

    // -------------------------------------------------------------- modifiers --

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    /// @notice Revoke an agent. Owner-only, and idempotent: revoking an already revoked
    ///         agent is a silent no-op rather than a revert, so a retried
    ///         incident-response script cannot fail halfway.
    function revokeAgent(address agent, uint16 reasonCode) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (isRevoked[agent]) return;

        isRevoked[agent] = true;
        emit AgentRevoked(agent, msg.sender, reasonCode, uint64(block.timestamp));
    }

    /// @notice Undo a revocation. Owner-only and idempotent, mirroring revokeAgent.
    function reinstateAgent(address agent) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (!isRevoked[agent]) return;

        isRevoked[agent] = false;
        emit AgentReinstated(agent, msg.sender, uint64(block.timestamp));
    }
}
