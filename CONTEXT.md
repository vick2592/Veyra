# Project Veyra: AI Agent Broker with World ID & Ledger Key Ring

## Build Status

Veyra is successfully scaffolded and built as a Web2 application with a separate Web3 workspace. The completed architecture supports Bazantic-style paid request admission, an ephemeral relay queue, World ID Face Auth, and request-correlated on-chain authorization through a Solidity registry, while API secrets remain in the Ledger Key Ring.

## Repository Structure

```text
apps/
  backend/   # Independent Node.js/Express broker, port 3001
  frontend/  # Independent Next.js World ID gate, port 3000
blockchain/  # Web3 packages, contracts, and blockchain tooling
```

The Web2 applications under `apps/` are independently installable with npm. The Web3 packages under `blockchain/` retain their own package and workspace configuration.

## Runtime Flow

1. An agent submits a paid capability request to `POST /api/bazantic/requests`.
2. The backend validates the payment adapter response and creates an ephemeral `pending_human_auth` request.
3. The `/sandbox` route polls `GET /api/bazantic/pending` every three seconds and lets the developer select a request.
4. The sandbox signs the selected secret identifier through `POST /api/world-id/sign`, opens `selfieCheckLegacy`, and stores the normalized World ID proof.
5. The sandbox derives `secretId`, binds the World ID signal to human/agent/secret, and calls `VeyraRegistry.authorizeAgent` with the request ID.
6. After receipt confirmation, the sandbox polls `GET /api/bazantic/requests/:requestId` while the chain listener claims the matching request, decrypts the allowlisted Ledger Key Ring secret, and calls the provider.
7. The sandbox displays the final result or sanitized execution error.

The backend queue is an in-memory Map and is an ephemeral relay only. Authorization trust and replay protection remain on-chain in `VeyraRegistry`; a backend restart discards uncompleted relay requests. Bazantic is intended to host the external agent gateway and payment rails in front of this API; the provider submission document is `docs/veyra-bazantic-openapi.yaml`.

### On-chain authorization flow

1. `blockchain/packages/contracts/src/VeyraRegistry.sol` stores encrypted user metadata and secret ciphertext; it does not store plaintext API keys.
2. `registerUser` registers encrypted user metadata and `storeSecret` stores active ciphertext under a `bytes32 secretId`.
3. `authorizeAgent(address,bytes32,uint256,uint256,uint256[8],bytes32)` verifies the World ID proof, checks the active secret and audit-registry revocation state, and records the nullifier.
4. The proof signal binds the human wallet, agent address, and secret ID. Successful authorization emits `AgentAuthorized` with the secret ID, nullifier, request ID, and timestamp.
5. `apps/backend/src/services/chainListener.ts` watches the configured registry address with `viem`, waits for configured transaction confirmations, and claims the matching request ID from the in-memory queue.
6. The listener reuses the shared provider execution function and existing `SecretKeyring` allowlist. Decrypted key material is held only for the provider request and is never logged or persisted.

The listener is intentionally asynchronous and read-only. It retries watcher failures, suppresses duplicate or concurrent log delivery, and does not make the HTTP server dependent on RPC availability. Durable log cursors and exactly-once processing across restarts are not implemented yet.

### Frontend Web3 integration

The Next.js app is wrapped in `Web3Provider`, which provides Wagmi and React Query with an injected connector and a local Anvil chain (`31337`). The root page is unchanged; `/sandbox` is the end-to-end developer dashboard. It simulates requests, selects queue entries, captures IDKit proof, derives the current contract's `secretId`, submits `authorizeAgent` through `useWriteContract`, waits for receipt confirmation, and polls the backend result. Frontend configuration uses `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_REGISTRY_ADDRESS`.

## Backend

The backend lives in `apps/backend/` and listens on port `3001` by default.

- Framework: Express with TypeScript
- Routes: `POST /api/bazantic/requests`, `GET /api/bazantic/pending`, and `GET /api/bazantic/requests/:requestId`
- Legacy route: `POST /api/execute-agent`
- RP signing route: `POST /api/world-id/sign`
- World ID verification: `https://developer.world.org/api/v4/verify/{rp_id}`
- Verification payload: complete IDKit response, forwarded without legacy field remapping
- Secret custody: Ledger Key Ring via globally installed `wallet-cli`
- Action allowlist: the current backend maps `execute-agent` to `AI_API_KEY`
- Shared execution: `executeAgentWithSecret` is used by both HTTP and chain-triggered execution
- Chain listener: `viem` watcher for request-correlated `AgentAuthorized`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`

The backend expects `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, `WORLD_ID_SIGNING_KEY`, and `WALLET_PASS` before the execution route is enabled. The signing route signs the requested secret identifier, and the verifier requires the returned World ID action to match that identifier. To enable the chain listener, configure `RPC_URL` and `REGISTRY_ADDRESS`; `CHAIN_ID` defaults to Base Sepolia (`84532`), while confirmation depth, polling interval, and an optional starting block are configurable. The signing key is server-only and must never be exposed to the browser. See `apps/backend/.env.example` for the complete configuration.

## Frontend

The frontend lives in `apps/frontend/` and runs on port `3000` by default. The end-to-end developer sandbox is `apps/frontend/src/app/sandbox/page.tsx` and is available at `/sandbox`; the root `page.tsx` is intentionally left separate.

- Framework: Next.js App Router with TypeScript and Tailwind CSS
- World ID SDK: current `@worldcoin/idkit` 4.x
- Widget: `IDKitRequestWidget` with a signed `rp_context`
- Credential preset: `selfieCheckLegacy()`
- Action: the selected request's secret identifier in the sandbox authorization flow; the legacy HTTP flow uses `execute-agent`
- Web3 stack: Wagmi, Viem, and React Query on local Anvil (`31337`)
- Broker URL: `NEXT_PUBLIC_BACKEND_URL`, defaulting to `http://localhost:3001`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm run build`

Set `NEXT_PUBLIC_WORLD_ID_APP_ID` and `NEXT_PUBLIC_WORLD_ID_RP_ID` in `apps/frontend/.env.local` before using the widget. The local frontend calls the local backend at port `3001`.
Also set `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_REGISTRY_ADDRESS` to enable wallet connection and on-chain authorization.

Selfie Check is currently exposed by the SDK as the `selfieCheckLegacy()` preset. The request uses the World ID 4.0 RP signing and verification architecture, while the credential preset remains the SDK's legacy Selfie Check flow.

## Web3 Packages

The `blockchain/` directory contains the Web3 packages, contracts, and blockchain-specific workspace configuration. It is separate from the independently installable Web2 applications under `apps/`.

- Veyra authorization registry: `blockchain/packages/contracts/src/VeyraRegistry.sol`
- Registry tests: `blockchain/packages/contracts/test/VeyraRegistry.t.sol`
- Deployment script: `blockchain/packages/contracts/script/DeployVeyraRegistry.s.sol`
- Existing audit registry: `blockchain/packages/contracts/src/CapabilityRegistry.sol`
- Contract validation: `forge build --root blockchain/packages/contracts` and `forge test --root blockchain/packages/contracts -vv`

For local deployment, run `anvil --chain-id 31337`, use one of Anvil's funded private keys as `DEPLOYER_PRIVATE_KEY`, and execute the deployment script with `WORLD_ID_ADDRESS`, `WORLD_ID_GROUP_ID`, and `WORLD_ID_EXTERNAL_NULLIFIER_HASH`. The script deploys or reuses `CapabilityRegistry` and passes it into `VeyraRegistry`; set `EMITTER_ADDRESS` when deploying the audit registry. The placeholder verifier address used for local deployment does not validate real World ID proofs. The chain listener does not use the off-chain World ID verifier; it processes only request-correlated `AgentAuthorized` events emitted by the configured registry.