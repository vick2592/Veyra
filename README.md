# Veyra

> Secure AI agent infrastructure gated by World ID Face Auth and Ledger Key Ring custody.

Veyra is a capability broker that lets an AI agent request sensitive work without holding raw API keys. A human completes World ID Face Auth before the broker verifies the proof, retrieves an allowlisted secret through Ledger Key Ring, and performs the agent-provider request. The `/sandbox` frontend route provides a complete local developer workflow for testing this sequence.

## Status

The application is scaffolded and built. The repository contains an independently installable Next.js frontend and Express backend, plus a separate Web3 workspace containing the decentralized registry and blockchain tooling.

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
4. The sandbox requests a short-lived RP signature from `POST /api/world-id/sign`, opens `IDKitRequestWidget` with `selfieCheckLegacy`, normalizes the returned World ID proof, and exposes the authorization prerequisites in the UI.
5. After proof capture, the sandbox submits the selected agent, hashed secret ID, proof, and request ID through `VeyraRegistry.authorizeAgent`.
6. The registry verifies the proof and emits `AgentAuthorized` with the hashed secret ID, nullifier, request ID, and timestamp.
7. The chain listener waits for confirmations, claims the matching queued request, decrypts the allowlisted Ledger Key Ring secret, and calls the configured provider.
8. After the authorization transaction is confirmed, the sandbox polls `GET /api/bazantic/requests/:requestId` every three seconds for `completed` or `failed` and displays the final result or sanitized error.

Bazantic's hosted gateway is the production payment boundary: submit `docs/veyra-bazantic-openapi.yaml` (or the deployed API URL) through the Bazantic provider flow and let Bazantic generate the agent-facing gateway, MCP surface, and x402/MPP payment handling. The local `services/bazantic.ts` adapter remains useful for direct/local testing, but it is not a replacement for Bazantic's hosted settlement service.

### Decentralized authorization flow

1. `blockchain/packages/contracts/src/VeyraRegistry.sol` stores encrypted user metadata and secret ciphertext, never plaintext API keys.
2. A registered user stores a secret under a `bytes32 secretId`; the frontend derives this ID from the selected identifier before authorization.
3. `authorizeAgent(address agentAddress, bytes32 secretId, uint256 root, uint256 nullifierHash, uint256[8] proof, bytes32 requestId)` verifies the World ID proof, checks the secret is active, checks the audit registry has not revoked the agent, and records the nullifier.
4. The World ID signal binds the human wallet, selected agent address, and hashed secret ID. This prevents reusing a proof for a different agent or secret.
5. A successful authorization emits `AgentAuthorized(user, agent, secretId, nullifierHash, requestId, authorizedAt)`.
6. The backend listener watches only the configured registry address, waits for the configured confirmation depth, claims the matching in-memory request, and passes its identifier through the shared agent execution path.
7. The listener uses the existing allowlisted Ledger Key Ring decryption flow and calls the configured agent provider without logging or persisting the plaintext API key.

The listener is a background, read-only service. RPC failures do not block the HTTP server; watcher errors are retried, and duplicate event delivery is suppressed in memory. The queue is intentionally ephemeral: backend restart loses pending requests, so durable queue persistence is not part of the decentralized trust layer or this deployment mode.

### Frontend Web3 flow

The root frontend page remains the original gate. The developer sandbox lives at `/sandbox` and uses Wagmi, Viem, React Query, and an injected wallet connector configured for local Anvil (`chainId 31337`). It simulates an incoming request, polls the pending queue, derives the contract `secretId`, computes the World ID signal bound to human/agent/secret, captures Face Auth proof, submits `authorizeAgent`, waits for the transaction receipt, and polls the backend listener result.

### Sandbox diagnostics and proof formats

The sandbox accepts both current and legacy IDKit response shapes:

- v4 responses with an eight-element `proof` array and `nullifier`.
- v3/legacy responses with an ABI-encoded proof string and `merkle_root`.
- Legacy top-level payloads using `root`, `nullifier_hash`, and either an array or encoded proof.

Proof normalization is guarded and logs the raw callback shape and normalization failures in the browser console. The `Authorization checks` panel beside the button shows the live status of the selected request, proof, wallet connection, wallet address, registry address, and `authorizationState`. The button is enabled from the request, proof, wallet, and registry prerequisites rather than from a transient state label; `authorizationState === proof_ready` remains visible as diagnostic state.

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
# Set WORLD_ID_APP_ID, WORLD_ID_RP_ID, WORLD_ID_SIGNING_KEY, and WALLET_PASS in .env
npm run dev
```

To enable the blockchain listener, also set `RPC_URL`, `REGISTRY_ADDRESS`, and optionally `CHAIN_ID`, `LISTENER_STARTING_BLOCK`, `LISTENER_CONFIRMATIONS`, and `LISTENER_POLLING_INTERVAL_MS`. Set `BAZANTIC_PAYMENT_HEADER` and `PENDING_REQUEST_TTL_MS` for the relay adapter.

The Express backend listens on `http://localhost:3001`.

### Frontend

```bash
cd apps/frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_WORLD_ID_APP_ID and NEXT_PUBLIC_WORLD_ID_RP_ID in .env.local
npm run dev
```

The Next.js frontend listens on `http://localhost:3000` and calls `http://localhost:3001` through `NEXT_PUBLIC_BACKEND_URL`. Open `http://localhost:3000/sandbox` for the end-to-end developer dashboard.
Set `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_REGISTRY_ADDRESS` in `.env.local` to connect the wallet and submit registry transactions.

When debugging a verification attempt, inspect the `[World ID] handleVerify`, `[World ID] onSuccess`, `[World ID] onError`, and proof-normalization logs in the browser console. A failed normalization clears the candidate proof and leaves the authorization button disabled instead of allowing a partial payload to reach the contract.

## Validation Commands

```bash
cd apps/backend && npm run typecheck && npm test && npm run build
cd apps/frontend && npm run typecheck && npm run build
forge build --root blockchain/packages/contracts
forge test --root blockchain/packages/contracts -vv
```

### Deploy locally

Start Anvil and use one of its printed funded private keys as `DEPLOYER_PRIVATE_KEY`:

```bash
anvil --chain-id 31337
```

In another terminal:

```bash
cd blockchain/packages/contracts
export DEPLOYER_PRIVATE_KEY=<funded-anvil-private-key>
export WORLD_ID_ADDRESS=0x0000000000000000000000000000000000000001
export WORLD_ID_GROUP_ID=1
export WORLD_ID_EXTERNAL_NULLIFIER_HASH=$(cast keccak "veyra-local")
# Optional: the script deploys CapabilityRegistry automatically when omitted.
export EMITTER_ADDRESS=<audit-emitter-address>

forge script script/DeployVeyraRegistry.s.sol:DeployVeyraRegistry \
	--rpc-url http://127.0.0.1:8545 \
	--broadcast
```

The script deploys `CapabilityRegistry` first unless `CAPABILITY_REGISTRY_ADDRESS` is supplied, then deploys `VeyraRegistry` with the audit registry address. The placeholder World ID address is deployment-only and cannot verify real proofs. A real World ID verifier address and matching external nullifier configuration are required outside local Anvil. Record both deployed addresses and set `REGISTRY_ADDRESS` and `NEXT_PUBLIC_REGISTRY_ADDRESS` to the new `VeyraRegistry` address. The deployment script is `blockchain/packages/contracts/script/DeployVeyraRegistry.s.sol`.

The backend signs the requested secret identifier and verifies that the returned World ID action matches the same identifier. The Bazantic provider submission spec is `docs/veyra-bazantic-openapi.yaml`. The legacy HTTP route requires `secretIdentifier` in its request body; the chain listener bypasses this route and trusts only `AgentAuthorized` events from the configured registry.

## Web3 Workspace

The `blockchain/` directory is separate from the Web2 apps. It contains the Web3 packages, smart contracts, deployment scripts, and blockchain-specific workspace configuration. The Veyra registry is at `blockchain/packages/contracts/src/VeyraRegistry.sol`; the deployment script is `blockchain/packages/contracts/script/DeployVeyraRegistry.s.sol`; the existing `CapabilityRegistry.sol` remains a separate audit registry. Changes to blockchain packages do not require joining or modifying the independent npm projects under `apps/`.