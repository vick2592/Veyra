# Veyra — Blockchain Layer

Two contracts and the Foundry workspace that builds them.

| Contract | Size | Role |
| --- | --- | --- |
| `VeyraRegistry` | 6.8 KB | the gate — user registry, encrypted secret storage, authorization |
| `CapabilityRegistry` | 1.0 KB | the kill switch — which agents are barred |

**Status:** implemented, 79 tests, 100% coverage on both, `forge fmt` clean. Deploy
script validated end to end against a local Anvil. **Not yet deployed to Base
Sepolia** — `REGISTRY_ADDRESS` is unset.

## What is verified where

This is the thing to be clear about, because it is easy to assume the chain does
more than it does.

**Proof of personhood is verified off chain**, by the backend, against the World ID
Developer Portal. The contract does not re-verify it.

That was a deliberate change. An on-chain `verifyProof` needs the external nullifier
to match what IDKit derived, and a *fixed* external nullifier gives a human one
usable nullifier for the life of the deployment — meaning each person could authorize
exactly once, ever. The two-part demo worked on take one and died on take two.

So `nullifierHash` on `AgentAuthorized` is an **attestation**, not a verification.
Anyone can put any value there. It is recorded because the backend, which did verify,
is the thing that acts on it. Never trust that field on its own.

Replay protection moved to the payment request instead — a request is the thing that
should be single-use, and unlike a nullifier there is a fresh one every time.

## VeyraRegistry

### Users

`registerUser(bytes encryptedUserId, uint32 leafIndex)` — register yourself.
`registerUserFor(address, bytes, uint32)` — registrar-only, for the backend.

Only the machine holding the Ledger can produce the encrypted blob, hence the second
path. Reads: `userCount`, `userAt`, `listUsers(offset, limit)`, `getUser`,
`isRegistered`. `rotateUserId` replaces the ciphertext after a key rotation.

`leafIndex` is the BIP32 leaf the server derives that user's key at. It is derived
from their World ID nullifier, not assigned — no counter, no race, and a returning
user always resolves to the same key.

### Secrets

`storeSecret(bytes32 secretId, string label, bytes ciphertext)` — store or rotate.
`storeSecretFor(address, bytes32, string, bytes)` — registrar-only.
`revokeSecret(bytes32)` — deactivate.

Calling `storeSecret` again on the same `secretId` bumps `version` and reactivates, so
store and rotate are one function. Reads: `getSecret`, `secretIdsOf`.

### Authorization

```solidity
function authorizeAgent(
    address agentAddress,
    bytes32 secretId,
    uint256 nullifierHash,   // attested off chain — see above
    bytes32 requestId        // the x402 payment request; single-use
) external
```

Five fail-closed checks: caller registered, agent non-zero, `requestId` non-zero and
unused, secret exists and is active and belongs to the caller, agent not revoked.

Emits `AgentAuthorized(user, agent, secretId, nullifierHash, requestId, authorizedAt)`
— the event the backend listener fires on.

## CapabilityRegistry

`revokeAgent(address, uint16 reasonCode)` and `reinstateAgent(address)`, both
owner-only and both idempotent so a retried incident-response script cannot fail
halfway. `isRevoked` is what `VeyraRegistry` consults.

It is required non-zero in `VeyraRegistry`'s constructor, so the kill switch cannot be
left unwired.

This contract previously doubled as an append-only audit log feeding a subgraph. That
vertical was dropped, and every consumer with it, so those functions were removed
rather than deployed as code nothing reads.

## Deploy

`CapabilityRegistry` first, then `VeyraRegistry` — the gate takes the audit address at
construction. The script does both.

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export REGISTRAR_ADDRESS=0x...        # optional, defaults to deployer
export CAPABILITY_REGISTRY_ADDRESS=   # optional, to reuse an existing one

forge script script/DeployVeyraRegistry.s.sol:DeployVeyraRegistry \
  --root blockchain/packages/contracts \
  --rpc-url "$RPC_URL" --broadcast --verify
```

No World ID router address or external nullifier is needed — verification is off
chain.

Then set `REGISTRY_ADDRESS` in the backend `.env`, `NEXT_PUBLIC_REGISTRY_ADDRESS` in
the frontend, and hand the ABI from `out/VeyraRegistry.sol/VeyraRegistry.json` to
whoever is wiring the client.

Note the frontend's `Web3Provider` currently declares **only Anvil (31337)**. Base
Sepolia has to be added there before it can talk to a real deployment.

## Test

```bash
forge test  --root blockchain/packages/contracts          # 79 tests
forge test  --root blockchain/packages/contracts -vv --match-contract ScenarioTest
```

`ScenarioTest` walks the demo end to end and prints observed state, so behaviour can
be checked against the design rather than assumed from it. `DesignProperties` covers
fail-closed behaviour, reentrancy and fuzzed invariants; `InputValidation` covers every
guard on every entry point.

## Known trade-offs

Stated here rather than discovered by a reviewer.

**On-chain ciphertext is permanent and public.** Anyone can archive it today and
decrypt everything the day the Ledger seed leaks. `revokeSecret` closes the gate; it
cannot erase bytes. Storing the ciphertext off chain with only a hash on chain keeps
every property this design wanted and drops that risk — worth doing if there is time.

**One seed protects every user.** BIP32 derivation isolates users from each other, not
from a server compromise.

**`secretId` is reversible.** It is `keccak256(name)` over a tiny preimage space, so
which services each user holds keys for is public. Salting with a per-user value fixes
it in one line.

**The chain does not prove personhood.** It records that a registered user authorized a
paid request against a secret they own. Everything about *who they are* rests on the
backend's off-chain verification.

## Layout

```
blockchain/packages/contracts/
  src/     VeyraRegistry.sol, CapabilityRegistry.sol
  test/    VeyraRegistry, CapabilityRegistry, DesignProperties, InputValidation, Scenario
  script/  DeployVeyraRegistry.s.sol
  lib/forge-std/   submodule — git submodule update --init --recursive
```
