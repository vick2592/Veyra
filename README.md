# Veyra

> Secure AI agent infrastructure gated by World ID Face Auth and Ledger Key Ring custody.

Veyra is a capability broker that lets an AI agent request sensitive work without holding raw API keys. A human completes World ID Face Auth before the broker mathematically verifies the proof on-chain, retrieves an allowlisted secret through Ledger Key Ring, and performs the agent-provider request. The `/sandbox` frontend route provides a complete developer workflow for testing this sequence on Base Sepolia.

## Status

The application is fully scaffolded, built, and deployed to **Base Sepolia**. The repository contains an independently installable Next.js frontend and Express backend, plus a separate Web3 workspace containing the decentralized registry and blockchain tooling.

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
4. The sandbox requests a short-lived RP signature from `POST /api/world-id/sign`. Using the headless `useIDKitRequest` hook (`environment: 'staging'`), it normalizes the returned proof and exposes a direct deep-link `connectorURI` to bypass QR scanning friction.
5. After proof capture, the sandbox submits the selected agent, hashed secret ID, proof, and request ID through `VeyraRegistry.authorizeAgent`.
6. The registry mathematically verifies the proof on-chain against the World ID Router, updates replay state, and emits `AgentAuthorized`.
7. The chain listener waits for confirmations, claims the matching queued request, decrypts the allowlisted Ledger Key Ring secret, and calls the configured provider.
8. After the authorization transaction is confirmed, the sandbox polls `GET /api/bazantic/requests/:requestId` every three seconds for `completed` or `failed` and displays the final result or sanitized error.

Bazantic's hosted gateway is the production payment boundary: submit `docs/veyra-bazantic-openapi.yaml` (or the deployed API URL) through the Bazantic provider flow and let Bazantic generate the agent-facing gateway, MCP surface, and x402/MPP payment handling. The local `services/bazantic.ts` adapter remains useful for direct/local testing, but it is not a replacement for Bazantic's hosted settlement service.

### Decentralized authorization flow

1. `blockchain/packages/contracts/src/VeyraRegistry.sol` stores encrypted user metadata and secret ciphertext, never plaintext API keys.
2. A registered user stores a secret under a `bytes32 secretId`; the frontend derives this ID from the selected identifier before authorization.
3. `authorizeAgent(address agentAddress, bytes32 secretId, uint256 root, uint256 nullifierHash, uint256[8] proof, bytes32 requestId)` verifies the World ID proof, checks the secret is active, checks the audit registry has not revoked the agent, and records the nullifier.
4. The World ID verification utilizes a dynamically derived SNARK scalar field `externalNullifier` to bind the human wallet, agent address, and secret ID. This prevents reusing a proof for a different agent or secret.
5. A successful authorization emits `AgentAuthorized(user, agent, secretId, nullifierHash, requestId, authorizedAt)`.
6. The backend listener watches the configured Base Sepolia registry address, waits for the configured confirmation depth, claims the matching in-memory request, and passes its identifier through the shared agent execution path.
7. The listener uses the existing allowlisted Ledger Key Ring decryption flow and calls the configured agent provider without logging or persisting the plaintext API key.

The listener is a background, read-only service. RPC failures do not block the HTTP server; watcher errors are retried, and duplicate event delivery is suppressed in memory.

### Frontend Web3 flow

The root frontend page remains the original gate. The developer sandbox lives at `/sandbox` and uses Wagmi, Viem, React Query, and an injected wallet connector configured for **Base Sepolia (`chainId 84532`)**. It simulates an incoming request, polls the pending queue, derives the contract `secretId`, computes the World ID signal, captures Face Auth proof via a custom modal or Simulator fallback link, submits `authorizeAgent`, and polls the backend listener result.

### Sandbox diagnostics and proof formats

The sandbox accepts both current and legacy IDKit response shapes:
- v4 responses with an eight-element `proof` array and `nullifier`.
- v3/legacy responses with an ABI-encoded proof string and `merkle_root`.
- Legacy top-level payloads using `root`, `nullifier_hash`, and either an array or encoded proof.

Proof normalization is guarded and logs the raw callback shape and normalization failures in the browser console. A failed normalization clears the candidate proof and leaves the authorization button disabled instead of allowing a partial payload to reach the contract.

## Prerequisites

- Node.js 22 or newer
- A World ID Developer Portal app ID
- `@ledgerhq/wallet-cli` installed globally for real keyring execution
- A provisioned Ledger Key Ring and encrypted `secrets.enc` file for real secret access

## Run Locally

### Backend

```bash
cd apps/backend
npm install
cp .env.example .env
# Set WORLD_ID_APP_ID, WORLD_ID_RP_ID, and WORLD_ID_SIGNING_KEY in .env
```

To enable the blockchain listener on the live testnet, configure the Base Sepolia deployment:
```env
RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
CHAIN_ID=84532
REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
LISTENER_STARTING_BLOCK=46653253
```
Start the listener with `npm run dev` (Listens on `http://localhost:3001`).

### Frontend

```bash
cd apps/frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_WORLD_ID_APP_ID and NEXT_PUBLIC_WORLD_ID_RP_ID in .env.local
# Set NEXT_PUBLIC_REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
npm run dev
```

The Next.js frontend listens on `http://localhost:3000`. Open `http://localhost:3000/sandbox` for the end-to-end developer dashboard.

## Validation Commands

```bash
cd apps/backend && npm run typecheck && npm test && npm run build
cd apps/frontend && npm run typecheck && npm run build
forge build --root blockchain/packages/contracts
forge test --root blockchain/packages/contracts -vv
```

### Deploy to Base Sepolia

Ensure `.env` inside `blockchain/packages/contracts` contains your funded `DEPLOYER_PRIVATE_KEY` and the correct `WORLD_ID_ADDRESS`. 

```bash
cd blockchain/packages/contracts
forge script script/DeployVeyraRegistry.s.sol:DeployVeyraRegistry \
    --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
    --broadcast \
    --legacy
```

Record both deployed addresses and update `REGISTRY_ADDRESS` and `NEXT_PUBLIC_REGISTRY_ADDRESS`. The backend signs the requested secret identifier and verifies that the returned World ID action matches the same identifier. The chain listener bypasses legacy HTTP routes and trusts only `AgentAuthorized` events from the configured registry.

---

# Current Technical Context (Veyra Project)
**Objective:** Finalizing ETHOnline 2026 hackathon submission for a decentralized, Sybil-resistant agent capability broker using World ID 4.0 and Bazantic middleware.

**Current Architecture State:**
*   **Blockchain (Base Sepolia, Chain ID 84532):** Smart contracts are deployed and stable. `VeyraRegistry` is live at `0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC` (Block `46653253`). `CapabilityRegistry` is at `0xcdd2EEfAdDB243FF07b97B65574be4fEfF4D8ff7`.
*   **Verification Security:** Replaced off-chain mockup with strict, mathematically verified on-chain proof resolution. `VeyraRegistry.authorizeAgent` dynamically derives the SNARK scalar field `externalNullifier` and calls `verifyProof` directly against the Base Sepolia World ID router (`0x42FF98C4E85212a5D31358ACbFe76a621b50fC02`).
*   **Frontend UX:** Replaced the default `IDKitWidget` with the headless `useIDKitRequest` hook (`environment: 'staging'`). Created a custom modal that intercepts the `connectorURI` to generate a one-click `?connect_url=` deep link directly to the World ID Simulator, bypassing desktop QR scanning friction.
*   **Backend Listener:** Express server running Viem client is actively polling Base Sepolia starting at block `46653253`. Successfully detects `AgentAuthorized` events, maps them to pending Bazantic x402 requests, and decrypts the allowlisted Ledger Key Ring secret.