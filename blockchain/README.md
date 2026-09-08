# Veyra — Blockchain Layer

The on-chain audit mirror for the Veyra capability broker, plus the Foundry
workspace that builds it.

> **Status: implemented and green.** `CapabilityRegistry.sol` is written, with
> 24 Foundry tests passing (including two fuzz properties at 256 runs each).
> Not yet deployed — `REGISTRY_ADDRESS` is still unset.

## What goes on chain, and what deliberately does not

Veyra lets an AI agent borrow a short-lived, narrowly-scoped capability instead
of holding a raw API key. The broker decides; the chain remembers.

`CapabilityRegistry` is an **append-only audit mirror**. It is emphatically *not*
the source of truth for authorization. Three consequences shape the whole design:

- **Nothing in the request path blocks on a transaction.** The broker mints and
  redeems capabilities entirely off-chain. If Base Sepolia is down, slow, or the
  emitter key is missing, the broker keeps working and the audit log lags.
- **Writes are batched.** An off-chain emitter worker accumulates decisions and
  flushes them periodically, so a decision's block timestamp is *not* when it
  happened. Every record carries its own `occurredAt`.
- **Compromising the chain does not grant access.** An attacker with the emitter
  key can pollute history, but cannot authorize a single API call.

The chain exists so that a third party — a judge, an auditor, the agent's owner —
can reconstruct what the broker did and why, without trusting the broker.

## Contract: `CapabilityRegistry.sol`

Solidity `0.8.28`, no proxies, no upgradeability, no libraries beyond `forge-std`.

### Types

```solidity
enum Decision        { Allow, Deny, Downgrade, ConfirmRequired }
enum Tier            { Untrusted, Verified, Elevated }
enum ConfirmationMode{ None, Software, LedgerEip712 }
```

`reasonCode` is a `uint16`, not a string. Strings cost gas, cannot be indexed
usefully, and would duplicate a taxonomy the API and UI already own. The
frontend maps the code to human text from the shared `reason_code` enum, so the
timeline reads as prose while the chain stores two bytes.

### Events — the contract's real API

The subgraph must build **everything** from these alone: no `eth_call`, no
contract reads, no off-chain joins. Solidity allows at most three indexed
parameters, and indexing a dynamic type stores only its hash — so no event below
indexes a string it needs to read back.

```solidity
event ResourceRegistered(
    bytes32 indexed resource,     // keccak256(name)
    string  name,                 // NOT indexed — the subgraph reads this
    uint8   riskClass
);

event PrincipalEnrolled(
    bytes32 indexed nullifierHash,   // World ID nullifier. Never PII.
    address indexed principal,
    uint8   verificationLevel,       // orb | device
    uint64  enrolledAt
);

event AgentRegistered(
    address indexed agent,
    bytes32 indexed principalNullifier,
    bytes32 agentPubKeyHash,         // keccak of the agent's ed25519 public key
    uint64  registeredAt
);

event CapabilityDecided(
    bytes32 indexed decisionId,      // broker-generated; the idempotency key
    address indexed agent,
    bytes32 indexed resource,
    uint8   decision,                // Decision
    uint16  reasonCode,
    uint64  notionalUsdE6,           // USD * 1e6 — the detector's primary signal
    uint8   tierAtDecision,          // Tier
    uint8   confirmationMode,        // ConfirmationMode
    bytes32 paramsHash,              // commitment to the exact request parameters
    uint64  occurredAt               // when the BROKER decided, not when mined
);

event ConfirmationRecorded(
    bytes32 indexed decisionId,
    address indexed confirmer,       // Ledger signer, or the principal
    uint8   mode,                    // ConfirmationMode
    bytes32 typedDataHash,           // the EIP-712 digest actually signed
    uint64  confirmedAt
);

event CapabilityUsed(
    bytes32 indexed decisionId,
    address indexed agent,
    bytes32 indexed jti,             // single-use token id
    bool    upstreamOk,
    uint16  reasonCode,
    uint64  usedAt
);

event AgentRevoked(
    address indexed agent,
    address indexed by,
    uint16  reasonCode,
    uint64  revokedAt
);

event AgentReinstated(address indexed agent, address indexed by, uint64 reinstatedAt);

event RiskScoreUpdated(
    address indexed agent,
    uint16  score,                   // 0..1000
    uint8   priorTier,
    uint8   newTier,
    bytes32 evidenceRef,             // hash of the detector's reasoning
    uint64  updatedAt
);

event EmitterSet(address indexed emitter, bool allowed);
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
```

`RiskScoreUpdated` is the one that matters for The Graph submission. It closes
the loop: the detector reads the subgraph, computes drift, and writes the
downgrade back on chain, where the subgraph indexes it again. The feedback edge
is visible as data rather than asserted in a slide.

### Functions

| Signature | Access | Purpose |
| --- | --- | --- |
| `constructor(address initialEmitter)` | — | deployer becomes owner |
| `recordDecisions(DecisionRecord[] calldata) returns (uint256)` | emitter | batch-append decisions; returns count newly written |
| `recordUses(UseRecord[] calldata) returns (uint256)` | emitter | batch-append redemptions, keyed on `jti` |
| `recordConfirmation(bytes32, address, uint8, bytes32, uint64)` | emitter | attach a human confirmation |
| `registerResource(string calldata, uint8) returns (bytes32)` | owner | publish a resource name preimage |
| `enrollPrincipal(bytes32, address, uint8, uint64)` | emitter | World ID enrollment |
| `registerAgent(address, bytes32, bytes32, uint64)` | emitter | bind agent to principal |
| `revokeAgent(address, uint16)` | **owner** | kill switch |
| `reinstateAgent(address)` | **owner** | undo a revocation |
| `updateRiskScore(address, uint16, uint8, uint8, bytes32, uint64)` | emitter | detector feedback |
| `setEmitter(address, bool)` | owner | rotate the emitter key |
| `transferOwnership(address)` | owner | move the cold key |

Every emitter-facing call takes an explicit `uint64` timestamp, because batched
writes land long after the event they describe. Owner-driven calls
(`revokeAgent`, `reinstateAgent`, `registerResource`) use `block.timestamp`, since
those happen interactively rather than through the batch queue.

`revokeAgent` and `reinstateAgent` are idempotent — repeating one is a silent
no-op, not a revert, so a retried incident-response script cannot fail halfway.

### Storage

```solidity
address public owner;
mapping(address => bool)  public isEmitter;
mapping(address => bool)  public isRevoked;
mapping(bytes32 => bool)  public recordedDecision;   // decisionId => seen
mapping(bytes32 => bool)  public recordedUse;        // jti => seen
```

Storage is deliberately thin. It exists only to enforce idempotency and the kill
switch — everything else lives in events, because events are what the subgraph
reads and they cost roughly an order of magnitude less gas than storage.

## Access control and the emitter key

Two roles. `owner` is a cold key. `isEmitter` is a hot key on a laptop
(`EMITTER_PRIVATE_KEY`), and the design assumes **it will leak**.

What a leaked emitter key buys an attacker: the ability to append false history —
fabricated decisions, bogus risk scores, spurious enrollments. That is real, and
the mitigation is bounded rather than absolute.

What it does **not** buy: authorization. It cannot mint a capability token, cannot
make the broker call an upstream API, cannot revoke or reinstate an agent (owner
only), and cannot rewrite or delete an existing record — `recordedDecision` makes
every `decisionId` write-once.

Containment is `setEmitter(old, false)` from the cold owner key, after which the
subgraph filters records by the authorized emitter set and flags the window.

## Kill switch

`revokeAgent(address, uint16)` is **owner-only**, sets `isRevoked[agent] = true`,
and emits `AgentRevoked`.

The subtlety is that revoking on chain cannot itself stop anything, because the
chain is not in the request path. So revocation works in two layers:

1. **Off-chain, authoritative.** The broker holds its own revocation state and
   checks it on every decision. This is what actually denies the request, and it
   **fails closed** — if the broker cannot determine an agent's status, it denies.
2. **On chain, evidential.** `AgentRevoked` timestamps the decision publicly. The
   contract still records decisions for a revoked agent, because the log is
   append-only truth rather than an enforcement point. The subgraph then surfaces
   any `Allow` with an `occurredAt` after a revocation as an **integrity
   violation** — which is exactly the anomaly worth showing on camera.

Reinstatement is symmetric and also owner-only.

## Batching and idempotency

The emitter submits arrays. Duplicate submission must be harmless, because a
worker that crashes between broadcasting and confirming will retry.

- **Idempotency** — keyed on `decisionId` (and `jti` for uses). A record already
  present is **skipped, not reverted**. Reverting would let one stale entry poison
  an entire batch.
- **Partial failure** — the batch is atomic per transaction. Anything not written
  stays queued in the broker's outbox and is retried in the next flush.
- **Ordering** — not guaranteed and not relied upon. Consumers order by
  `occurredAt`, never by block or log index.
- **Gas** — events over storage, `uint64`/`uint16` packed over `uint256`, and
  `calldata` arrays. Only the two idempotency mappings touch storage.

## Privacy

No PII on chain, ever. Identity is a World ID nullifier hash.

The tension is that a fully hashed log is also an unreadable one, and this has to
be legible to someone watching a four-minute video. It resolves per field:

| Field | On chain as | Why |
| --- | --- | --- |
| Principal identity | `nullifierHash` | World ID's own unlinkable primitive |
| Agent key | `keccak(ed25519 pubkey)` | binding without publishing the key |
| Resource | `keccak(name)` + a one-time `ResourceRegistered` carrying the plaintext | hashed in the hot path, but the subgraph resolves it back to `"coingecko.price.read"` for display |
| Request parameters | `paramsHash` | a recipient address or amount may be sensitive; the hash still proves what was approved |
| Notional value | plaintext `uint64` USD·1e6 | the detector needs the magnitude, and it is the story |

So the timeline reads *"agent-3 requested a USDC transfer of $240, downgraded,
value creep"* while the recipient address stays a commitment.

## What the subgraph builds

| Entity | From | Powers |
| --- | --- | --- |
| `Agent` | `AgentRegistered`, `AgentRevoked`, `RiskScoreUpdated` | agent list, current tier and risk badge |
| `Principal` | `PrincipalEnrolled` | World ID verification state |
| `Resource` | `ResourceRegistered` | hash-to-name resolution for the timeline |
| `Decision` | `CapabilityDecided`, `ConfirmationRecorded`, `CapabilityUsed` | the audit timeline |
| `RiskSnapshot` | `RiskScoreUpdated` | the value-creep chart and the downgrade moment |

The detector needs `(agent, resource, notionalUsdE6, occurredAt)` grouped by
agent and ordered by time — all four are on `CapabilityDecided`, which is why
that event carries value in plaintext.

## Foundry tests

24 tests, all passing. Kill switch and idempotency are the two that must be
airtight, so both are covered from several angles — including that the hot
emitter key **cannot** reach the kill switch.

```bash
forge test --root blockchain/packages/contracts -vv
```

```
test_RevokeAgent_SetsFlagAndEmits
test_RevokeAgent_RevertsForNonOwner
test_RevokeAgent_IsIdempotent
test_ReinstateAgent_ClearsFlag
test_ReinstateAgent_RevertsForNonOwner
test_RecordDecisions_DuplicateIdIsNoOp
test_RecordDecisions_BatchWithDuplicate_RecordsOnlyNew
test_RecordDecisions_RevertsForNonEmitter
test_RecordDecisions_StillRecordsForRevokedAgent   // append-only truth
test_RecordUses_DuplicateJtiIsNoOp
test_SetEmitter_RotatesAndOldKeyRejected
test_RegisterResource_EmitsReadablePreimage
test_UpdateRiskScore_EmitsTierTransition
testFuzz_NotionalUsdE6_NoOverflowAtUint64Bound
testFuzz_OnlyOwnerCanRevoke
test_RevokeAgent_RevertsForEmitter
test_RecordDecisions_RevertsOnInvalidDecisionEnum
test_RecordDecisions_RevertsOnInvalidTier
test_RecordDecisions_RevertsOnZeroId
test_RecordDecisions_RevertsOnEmptyBatch
test_RegisterResource_RevertsOnEmptyName
test_UpdateRiskScore_RevertsAboveRange
test_SetEmitter_RevertsForNonOwner
```

Malformed records **revert** while duplicates are **skipped**. That split is
deliberate: a duplicate is an expected retry, whereas a bad enum or a zero id is
an emitter bug, and the contract fails closed on it.

## Deployment

Base Sepolia, chain id `84532`.

```bash
forge build  --root blockchain/packages/contracts
forge test   --root blockchain/packages/contracts -vv

forge create --root blockchain/packages/contracts \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" \
  src/CapabilityRegistry.sol:CapabilityRegistry

forge verify-contract --chain 84532 "$REGISTRY_ADDRESS" \
  src/CapabilityRegistry.sol:CapabilityRegistry
```

Then set `REGISTRY_ADDRESS` in `.env` and hand the address plus the ABI from
`out/CapabilityRegistry.sol/CapabilityRegistry.json` to whoever owns the subgraph.

## Layout

```
blockchain/
  packages/
    contracts/          Foundry project — solc 0.8.28
      src/              CapabilityRegistry.sol
      test/             CapabilityRegistry.t.sol         24 tests
      lib/forge-std/    submodule, v1.16.2
      foundry.toml
      foundry.lock
    broker/             TypeScript broker package
```

`lib/forge-std` is a git submodule. On a fresh clone:

```bash
git submodule update --init --recursive
```

## Known issues in this workspace

The `apps/` + `blockchain/` restructure moved these files without updating their
relative paths. None of it blocks Foundry, but the pnpm side is inert until fixed:

1. `packages/pnpm-workspace.yaml` globs `packages/*` and `apps/*` — neither
   exists relative to its new location, so `pnpm -r` resolves **zero** projects
   and `build`/`typecheck`/`test` silently no-op instead of failing.
2. `packages/broker/tsconfig.json` extends `../../tsconfig.base.json`, one level
   too high. The file is at `../tsconfig.base.json`.
3. `packages/package.json` runs `forge --root packages/contracts`; from its new
   home that path is `contracts`.
4. The root `.gitignore` still lists `packages/contracts/{cache,broadcast}/` by
   the old path, so `forge build` output at the new location is no longer
   ignored. `out/` is still caught by the bare pattern on line 17; `cache/` and
   `broadcast/` are not.

There is also no `pnpm-lock.yaml` here yet — one cannot be generated correctly
until issue 1 is resolved.

## Open questions

- **Agent on-chain identity.** Events key on `address agent`, but agents
  authenticate with an ed25519 key, which is not an Ethereum address. Either
  derive a stable synthetic address per agent, or switch the key to `bytes32`.
  This must be settled before the subgraph schema is written.
- **`notionalUsdE6` for non-financial resources.** A CoinGecko read has no
  dollar value. Zero is the obvious answer, but the detector must not read a run
  of zeros as "no drift" when scope is widening — scope creep and value creep are
  different signals.
- **Who holds `owner`?** The kill switch is only as good as the key behind it,
  and a demo where the owner key sits in the same `.env` as the emitter key
  undercuts the story.
- **Where the broker lives.** `apps/backend` and `blockchain/packages/broker`
  both currently claim that role; the emitter worker belongs to whichever wins.
