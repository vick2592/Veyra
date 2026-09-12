# Veyra

> Secure AI agent infrastructure gated by World ID Face Auth and Ledger Key Ring custody.

Veyra is a capability broker that lets an AI agent request sensitive work without holding raw API keys. A human completes World ID Face Auth before the broker mathematically verifies the proof on-chain, retrieves an allowlisted secret through Ledger Key Ring (or a secure environment fallback), and performs the agent-provider request. The `/sandbox` frontend route provides a complete developer workflow for testing this sequence on Base Sepolia.

## Status

The application is fully scaffolded, built, and deployed to **Base Sepolia**. The repository contains an independently installable Next.js frontend and Express backend, plus a separate Web3 workspace containing the decentralized registry and blockchain tooling.

**Phase 1 — Multi-User Dashboard & Per-User Hardware Decryption: complete.** Any connected wallet can register, encrypt-and-store a secret under its own hardware-derived key slot, and trigger the same World ID authorization pipeline from `/dashboard`. The chain listener decrypts the specific per-user secret an authorization is for, rather than a single shared operator key. Next up: Bazantic x402 bounty integration (not started).

## Architecture: Universal Hardware Custodian

Veyra never lets an AI agent, or the broker itself, hold a raw API key. Three independent layers compose into one authorization chain, and each is designed so that compromising one alone isn't enough:

1. **On-chain storage (`VeyraRegistry.storeSecret`)** — `blockchain/packages/contracts/src/VeyraRegistry.sol` holds every secret as ciphertext in `mapping(address => mapping(bytes32 => Secret)) _secrets`. Storage is keyed per user, so a `secretId` only has to be unique within one person's own labels (`secretId = keccak256(label)`) — the contract itself never sees, and cannot decrypt, a plaintext secret. `storeSecret` bumps a version and timestamp on every write; `revokeSecret` only flips an `active` flag, since nothing written to a public chain can actually be erased.
2. **World ID ZK proof verification** — before any stored secret can be used, a human proves liveness through World ID Face Auth (staging environment, `execute-agent` action). The proof is verified on-chain against the World ID Router inside `authorizeAgent`, which binds the specific user, agent, and secret into the signed action and emits `AgentAuthorized`. This is the only step that involves a person; the rest of the pipeline is machine-to-machine.
3. **Ledger Key Ring hardware custody** — the backend acts as a Universal Hardware Custodian via `@ledgerhq/wallet-cli`. Each user's secrets are encrypted and decrypted under a hardware-scoped key named `veyra-user-<leafIndex>`, where `leafIndex = keccak256(userAddress) % 2^31`. `wallet-cli ring encrypt`/`ring decrypt` take an opaque `--key <name>`, not a BIP-32 derivation path — the leaf index is a deterministic, collision-resistant naming scheme for that scoped key, not on-device child-key derivation. A software HKDF + AES-256-GCM fallback (`VEYRA_DEMO_MODE=true` or `NODE_ENV=development`) exists so the full flow runs without a physical Ledger attached; the derivation and key-selection logic are otherwise identical either way.

The result: the contract can't decrypt anything, the broker can't act without a fresh human liveness proof, and no single secret's ciphertext is usable without the specific hardware-derived key it was encrypted under.

## Architecture

```text
apps/
    frontend/  Next.js App Router gate, port 3000
    backend/   Express broker API, port 3001
blockchain/  Web3 packages, contracts, and tooling
```

### Request flow

1. An agent submits a paid request to `POST /api/bazantic/requests` with an idempotency key.
2. The Bazantic adapter validates the request and payment headers before placing it in the ephemeral `pending_human_auth` Map queue.
3. The endpoint returns `202` with a `requestId`; the sandbox polls `GET /api/bazantic/pending` every three seconds and lets the human select a request.
4. The sandbox utilizes the headless `useIDKitRequest` hook (`environment: 'staging'`). It hardcodes the action to `"execute-agent"` and passes the raw `encodePacked` bytes as the signal to prevent double-hashing mismatches. It exposes a direct deep-link `connectorURI` to bypass QR scanning friction.
5. After proof capture, the sandbox submits the selected agent, hashed secret ID, proof, and request ID through `VeyraRegistry.authorizeAgent`.
6. The registry mathematically verifies the proof on-chain against the World ID Router, updates replay state to prevent double-spending the nullifier, and emits `AgentAuthorized`.
7. The stateless backend listener polls for confirmations, claims the matching queued request, retrieves the API key (via Ledger Key Ring or demo fallback), and calls the configured provider.
8. The sandbox polls `GET /api/bazantic/requests/:requestId` for `completed` or `failed` and displays the final result.

### Decentralized authorization flow

1. `blockchain/packages/contracts/src/VeyraRegistry.sol` stores encrypted user metadata and secret ciphertext, never plaintext API keys.
2. A registered user stores a secret under a `bytes32 secretId`; the frontend derives this ID from the selected identifier before authorization.
3. `authorizeAgent` dynamically derives the SNARK scalar field `externalNullifier` by binding the static `"execute-agent"` action. This locks the math so the proof cannot be replayed or altered.
4. A successful authorization emits `AgentAuthorized(user, agent, secretId, nullifierHash, requestId, authorizedAt)`.
5. The backend listener executes a stateless `getLogs` polling loop to bypass public RPC load-balancer limitations (eliminating `filter not found` errors) and executes the agent provider pathway.

## Prerequisites

- Node.js 22 or newer
- A World ID Developer Portal app ID
- MetaMask or a compatible browser wallet configured for Base Sepolia (Chain ID `84532`)
- Optional: `@ledgerhq/wallet-cli` for hardware Key Ring execution

## Run Locally

### 1. Backend Environment

```bash
cd apps/backend
npm install
cp .env.example .env
```

Configure `apps/backend/.env` for Base Sepolia and Demo Mode:
```env
RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
CHAIN_ID=84532
REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC

# Set this to a recent Base Sepolia block to avoid public RPC 10,000 block scanning limits
LISTENER_STARTING_BLOCK=46693400 

# Bypasses physical Ledger requirement for local/hackathon testing
VEYRA_DEMO_MODE=true
OPENAI_API_KEY=sk-your-trial-key-here
```
Start the listener with `npm run dev` (Listens on port `3001`).

### 2. Frontend Environment

```bash
cd apps/frontend
npm install
cp .env.example .env.local
```

Configure `apps/frontend/.env.local`:
```env
NEXT_PUBLIC_RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
NEXT_PUBLIC_WORLD_ID_APP_ID=app_30cf964190e1900108f1a3abb75d39c0
NEXT_PUBLIC_WORLD_ID_RP_ID=veyra-local
```
Start the frontend with `npm run dev` (Listens on port `3000`).

### 3. Contract State Initialization

The Base Sepolia registry requires an active user and secret in its state before allowing an authorization transaction. You must execute these transactions from the **exact same wallet address** you intend to connect to the frontend sandbox.

Using Foundry (`cast`):
```bash
# 1. Register your test wallet
cast send 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC "registerUser(bytes,uint32)" 0x00 0 --rpc-url [https://sepolia.base.org](https://sepolia.base.org) --private-key <YOUR_TEST_WALLET_PK>

# 2. Store the secret payload
cast send 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC "storeSecret(bytes32,string,bytes)" 0xb7c13b673a2c35d90c6173b5f0840fb89b35ea037ec004e2dc888c43eb082896 "openai-key" 0x12345678 --rpc-url [https://sepolia.base.org](https://sepolia.base.org) --private-key <YOUR_TEST_WALLET_PK>
```

### 4. Testing the Sandbox

Navigate to `http://localhost:3000/sandbox` to access the developer dashboard. 

**Critical Testing Note:** World ID incorporates strict double-spend protection. You cannot reuse a proof for multiple transactions. If a transaction succeeds or if the proof expires, you must run the World ID Simulator flow again to generate a **brand new proof**, otherwise the smart contract will immediately revert with an `InvalidNullifier` error.

## Validation Commands

```bash
cd apps/backend && npm run typecheck && npm test && npm run build
cd apps/frontend && npm run typecheck && npm run build
forge build --root blockchain/packages/contracts
forge test --root blockchain/packages/contracts -vv
```