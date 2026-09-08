// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title  CapabilityRegistry
/// @notice Append-only audit mirror for Veyra broker decisions.
/// @dev    This contract is NOT the source of truth for authorization. The broker
///         mints and redeems capabilities entirely off-chain; nothing in the request
///         path blocks on a transaction. An off-chain emitter worker batches records
///         here after the fact, which is why every batched record carries its own
///         timestamp rather than relying on `block.timestamp`.
///
///         Storage is deliberately thin: it exists only to enforce write-once
///         idempotency and the kill switch. Everything a consumer needs lives in
///         events, because the subgraph must rebuild the audit timeline and the
///         value-creep detector from events alone — no reads, no off-chain joins.
contract CapabilityRegistry {
    // ------------------------------------------------------------------ types --

    enum Decision {
        Allow,
        Deny,
        Downgrade,
        ConfirmRequired
    }

    enum Tier {
        Untrusted,
        Verified,
        Elevated
    }

    enum ConfirmationMode {
        None,
        Software,
        LedgerEip712
    }

    /// @dev Enum-valued fields travel as uint8 so the ABI stays stable if a variant
    ///      is appended later. Range is validated on write.
    struct DecisionRecord {
        bytes32 decisionId;
        address agent;
        bytes32 resource;
        uint8 decision;
        uint16 reasonCode;
        uint64 notionalUsdE6;
        uint8 tierAtDecision;
        uint8 confirmationMode;
        bytes32 paramsHash;
        uint64 occurredAt;
    }

    struct UseRecord {
        bytes32 decisionId;
        address agent;
        bytes32 jti;
        bool upstreamOk;
        uint16 reasonCode;
        uint64 usedAt;
    }

    // ----------------------------------------------------------------- errors --

    error NotOwner();
    error NotEmitter();
    error ZeroAddress();
    error ZeroId();
    error EmptyBatch();
    error EmptyResourceName();
    error InvalidDecision(uint8 value);
    error InvalidTier(uint8 value);
    error InvalidConfirmationMode(uint8 value);
    error ScoreOutOfRange(uint16 score);

    // ----------------------------------------------------------------- events --

    event ResourceRegistered(bytes32 indexed resource, string name, uint8 riskClass);

    event PrincipalEnrolled(
        bytes32 indexed nullifierHash, address indexed principal, uint8 verificationLevel, uint64 enrolledAt
    );

    event AgentRegistered(
        address indexed agent,
        bytes32 indexed principalNullifier,
        bytes32 agentPubKeyHash,
        uint64 registeredAt
    );

    event CapabilityDecided(
        bytes32 indexed decisionId,
        address indexed agent,
        bytes32 indexed resource,
        uint8 decision,
        uint16 reasonCode,
        uint64 notionalUsdE6,
        uint8 tierAtDecision,
        uint8 confirmationMode,
        bytes32 paramsHash,
        uint64 occurredAt
    );

    event ConfirmationRecorded(
        bytes32 indexed decisionId,
        address indexed confirmer,
        uint8 mode,
        bytes32 typedDataHash,
        uint64 confirmedAt
    );

    event CapabilityUsed(
        bytes32 indexed decisionId,
        address indexed agent,
        bytes32 indexed jti,
        bool upstreamOk,
        uint16 reasonCode,
        uint64 usedAt
    );

    event AgentRevoked(address indexed agent, address indexed by, uint16 reasonCode, uint64 revokedAt);

    event AgentReinstated(address indexed agent, address indexed by, uint64 reinstatedAt);

    event RiskScoreUpdated(
        address indexed agent,
        uint16 score,
        uint8 priorTier,
        uint8 newTier,
        bytes32 evidenceRef,
        uint64 updatedAt
    );

    event EmitterSet(address indexed emitter, bool allowed);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------- storage --

    address public owner;

    mapping(address => bool) public isEmitter;
    mapping(address => bool) public isRevoked;

    /// @dev decisionId => seen. Makes every decision write-once.
    mapping(bytes32 => bool) public recordedDecision;

    /// @dev jti => seen. A capability token is single-use by construction.
    mapping(bytes32 => bool) public recordedUse;

    // -------------------------------------------------------------- modifiers --

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyEmitter() {
        if (!isEmitter[msg.sender]) revert NotEmitter();
        _;
    }

    constructor(address initialEmitter) {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);

        if (initialEmitter != address(0)) {
            isEmitter[initialEmitter] = true;
            emit EmitterSet(initialEmitter, true);
        }
    }

    // ------------------------------------------------------------ admin (cold) --

    /// @notice Rotate the hot emitter key. The emitter is assumed to leak eventually;
    ///         this is the containment lever, and it is owner-only by design.
    function setEmitter(address emitter, bool allowed) external onlyOwner {
        if (emitter == address(0)) revert ZeroAddress();
        isEmitter[emitter] = allowed;
        emit EmitterSet(emitter, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    /// @notice Publish a resource name preimage so the subgraph can render
    ///         `keccak256("coingecko.price.read")` back as readable text.
    function registerResource(string calldata name, uint8 riskClass)
        external
        onlyOwner
        returns (bytes32 resource)
    {
        bytes memory raw = bytes(name);
        if (raw.length == 0) revert EmptyResourceName();

        resource = keccak256(raw);
        emit ResourceRegistered(resource, name, riskClass);
    }

    // ------------------------------------------------------------- kill switch --

    /// @notice Revoke an agent. Owner-only, and idempotent: revoking an already
    ///         revoked agent is a silent no-op rather than a revert, so a retried
    ///         incident-response script cannot fail halfway.
    /// @dev    Revoking here does not itself stop a request — the chain is not in
    ///         the request path. The broker holds authoritative revocation state and
    ///         fails closed. This event is the public, timestamped record, and lets
    ///         the subgraph flag any Allow occurring after it as an integrity
    ///         violation.
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

    // -------------------------------------------------------- identity (batched) --

    function enrollPrincipal(
        bytes32 nullifierHash,
        address principal,
        uint8 verificationLevel,
        uint64 enrolledAt
    ) external onlyEmitter {
        if (nullifierHash == bytes32(0)) revert ZeroId();
        if (principal == address(0)) revert ZeroAddress();

        emit PrincipalEnrolled(nullifierHash, principal, verificationLevel, enrolledAt);
    }

    function registerAgent(
        address agent,
        bytes32 principalNullifier,
        bytes32 agentPubKeyHash,
        uint64 registeredAt
    ) external onlyEmitter {
        if (agent == address(0)) revert ZeroAddress();
        if (principalNullifier == bytes32(0) || agentPubKeyHash == bytes32(0)) revert ZeroId();

        emit AgentRegistered(agent, principalNullifier, agentPubKeyHash, registeredAt);
    }

    // ------------------------------------------------------------ audit (batched) --

    /// @notice Append a batch of broker decisions.
    /// @dev    Duplicates are SKIPPED, not reverted: the emitter retries after a
    ///         crash, and one already-written record must not poison a whole batch.
    ///         Malformed records DO revert — that is a bug in the emitter, not a
    ///         race, and this contract fails closed on bad input.
    ///
    ///         Records for a revoked agent are still written. The log is append-only
    ///         truth, not an enforcement point; suppressing them here would hide
    ///         exactly the anomaly an auditor needs to see.
    /// @return written Number of records newly appended.
    function recordDecisions(DecisionRecord[] calldata records)
        external
        onlyEmitter
        returns (uint256 written)
    {
        uint256 len = records.length;
        if (len == 0) revert EmptyBatch();

        for (uint256 i = 0; i < len; ++i) {
            DecisionRecord calldata r = records[i];

            if (r.decisionId == bytes32(0)) revert ZeroId();
            if (r.agent == address(0)) revert ZeroAddress();
            if (r.decision > uint8(Decision.ConfirmRequired)) revert InvalidDecision(r.decision);
            if (r.tierAtDecision > uint8(Tier.Elevated)) revert InvalidTier(r.tierAtDecision);
            if (r.confirmationMode > uint8(ConfirmationMode.LedgerEip712)) {
                revert InvalidConfirmationMode(r.confirmationMode);
            }

            if (recordedDecision[r.decisionId]) continue;
            recordedDecision[r.decisionId] = true;
            unchecked {
                ++written;
            }

            emit CapabilityDecided(
                r.decisionId,
                r.agent,
                r.resource,
                r.decision,
                r.reasonCode,
                r.notionalUsdE6,
                r.tierAtDecision,
                r.confirmationMode,
                r.paramsHash,
                r.occurredAt
            );
        }
    }

    /// @notice Append a batch of capability redemptions, keyed on the single-use jti.
    /// @return written Number of records newly appended.
    function recordUses(UseRecord[] calldata records) external onlyEmitter returns (uint256 written) {
        uint256 len = records.length;
        if (len == 0) revert EmptyBatch();

        for (uint256 i = 0; i < len; ++i) {
            UseRecord calldata r = records[i];

            if (r.decisionId == bytes32(0) || r.jti == bytes32(0)) revert ZeroId();
            if (r.agent == address(0)) revert ZeroAddress();

            if (recordedUse[r.jti]) continue;
            recordedUse[r.jti] = true;
            unchecked {
                ++written;
            }

            emit CapabilityUsed(r.decisionId, r.agent, r.jti, r.upstreamOk, r.reasonCode, r.usedAt);
        }
    }

    /// @notice Attach a human confirmation to a decision.
    /// @param typedDataHash The EIP-712 digest actually signed — for the Ledger path
    ///        this is what binds the approval to those exact parameters, so an
    ///        approval for one transfer cannot be replayed against another.
    function recordConfirmation(
        bytes32 decisionId,
        address confirmer,
        uint8 mode,
        bytes32 typedDataHash,
        uint64 confirmedAt
    ) external onlyEmitter {
        if (decisionId == bytes32(0)) revert ZeroId();
        if (confirmer == address(0)) revert ZeroAddress();
        if (mode > uint8(ConfirmationMode.LedgerEip712)) revert InvalidConfirmationMode(mode);

        emit ConfirmationRecorded(decisionId, confirmer, mode, typedDataHash, confirmedAt);
    }

    /// @notice Record a value-creep detector verdict and the tier transition it caused.
    /// @dev    This is the feedback edge: the detector reads the subgraph, computes
    ///         drift, and writes the downgrade back here, where the subgraph indexes
    ///         it again. Score is 0..1000.
    function updateRiskScore(
        address agent,
        uint16 score,
        uint8 priorTier,
        uint8 newTier,
        bytes32 evidenceRef,
        uint64 updatedAt
    ) external onlyEmitter {
        if (agent == address(0)) revert ZeroAddress();
        if (score > 1000) revert ScoreOutOfRange(score);
        if (priorTier > uint8(Tier.Elevated)) revert InvalidTier(priorTier);
        if (newTier > uint8(Tier.Elevated)) revert InvalidTier(newTier);

        emit RiskScoreUpdated(agent, score, priorTier, newTier, evidenceRef, updatedAt);
    }
}
