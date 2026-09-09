# Project Veyra: AI Agent Broker with World ID & Ledger Key Ring

## Build Status

Veyra is successfully scaffolded and built as a Web2 application with a separate Web3 workspace. The completed architecture supports both HTTP World ID execution and on-chain World ID authorization through a Solidity registry, while API secrets remain in the Ledger Key Ring.

## Repository Structure

```text
apps/
  backend/   # Independent Node.js/Express broker, port 3001
  frontend/  # Independent Next.js World ID gate, port 3000
blockchain/  # Web3 packages, contracts, and blockchain tooling
```

The Web2 applications under `apps/` are independently installable with npm. The Web3 packages under `blockchain/` retain their own package and workspace configuration.

## Runtime Flow

1. The Next.js frontend displays the Veyra Agent Execution gate.
2. The frontend requests a signed RP context from `POST /api/world-id/sign`.
3. The frontend connects an injected wallet, opens `IDKitRequestWidget` with `selfieCheckLegacy()`, uses the entered secret identifier as the action, and includes the wallet address as the proof signal.
4. After World ID returns, the frontend posts `{ rp_id, idkitResponse }` unchanged to `http://localhost:3001/api/execute-agent`.
5. The Express backend forwards the complete response to `https://developer.world.org/api/v4/verify/{rp_id}`.
6. Only after a successful verification response does the backend invoke the globally installed `wallet-cli` with `execFile`, decrypt the Ledger Key Ring output into a private temporary directory, read the allowlisted `AI_API_KEY` in memory, and remove the temporary plaintext directory in a `finally` block.
7. The backend performs the mock agent-provider request and returns the result to the frontend. Raw keys are never sent to the browser or agent.

### On-chain authorization flow

1. `blockchain/packages/contracts/src/VeyraRegistry.sol` stores each user's Ledger Key Ring secret identifiers in `userSecretIdentifiers`; it does not store plaintext API keys.
2. `registerSecret` appends an identifier for the caller.
3. `authorizeAgent` verifies the caller's World ID proof through `IWorldID`, using the constructor-fixed group and external nullifier hash.
4. The contract records each nullifier after successful verification and rejects replayed nullifiers before emitting `AgentAuthorized`.
5. `apps/backend/src/services/chainListener.ts` watches the configured registry address with `viem`, waits for configured transaction confirmations, and processes each event once per running process.
6. The listener reuses the shared provider execution function and existing `SecretKeyring` allowlist. Decrypted key material is held only for the provider request and is never logged or persisted.

The listener is intentionally asynchronous and read-only. It retries watcher failures, suppresses duplicate or concurrent log delivery, and does not make the HTTP server dependent on RPC availability. Durable log cursors and exactly-once processing across restarts are not implemented yet.

### Frontend Web3 integration

The Next.js app is wrapped in `Web3Provider`, which provides Wagmi and React Query with an injected connector and a local Anvil chain (`31337`). The authorization page accepts a Ledger Key Ring identifier, extracts the IDKit proof, and calls `VeyraRegistry.authorizeAgent` through `useWriteContract`, using the connected wallet as the agent address. Frontend configuration uses `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_REGISTRY_ADDRESS`.

## Backend

The backend lives in `apps/backend/` and listens on port `3001` by default.

- Framework: Express with TypeScript
- Route: `POST /api/execute-agent`
- RP signing route: `POST /api/world-id/sign`
- World ID verification: `https://developer.world.org/api/v4/verify/{rp_id}`
- Verification payload: complete IDKit response, forwarded without legacy field remapping
- Secret custody: Ledger Key Ring via globally installed `wallet-cli`
- Action allowlist: the current backend maps `execute-agent` to `AI_API_KEY`
- Shared execution: `executeAgentWithSecret` is used by both HTTP and chain-triggered execution
- Chain listener: `viem` watcher for `AgentAuthorized`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`

The backend expects `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, `WORLD_ID_SIGNING_KEY`, `WORLD_ACTION`, and `WALLET_PASS` before the execution route is enabled. To enable the chain listener, configure `RPC_URL` and `REGISTRY_ADDRESS`; `CHAIN_ID` defaults to Base Sepolia (`84532`), while confirmation depth, polling interval, and an optional starting block are configurable. The signing key is server-only and must never be exposed to the browser. See `apps/backend/.env.example` for the complete configuration.

## Frontend

The frontend lives in `apps/frontend/` and runs on port `3000` by default.

- Framework: Next.js App Router with TypeScript and Tailwind CSS
- World ID SDK: current `@worldcoin/idkit` 4.x
- Widget: `IDKitRequestWidget` with a signed `rp_context`
- Credential preset: `selfieCheckLegacy()`
- Action: the entered secret identifier in the Web3 authorization flow; the legacy HTTP flow uses `execute-agent`
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

For local deployment, run `anvil --chain-id 31337`, use one of Anvil's funded private keys as `DEPLOYER_PRIVATE_KEY`, and execute the deployment script with `WORLD_ID_ADDRESS`, `WORLD_ID_GROUP_ID`, and `WORLD_ID_EXTERNAL_NULLIFIER_HASH`. The placeholder verifier address used for local deployment does not validate real World ID proofs. The backend's signing route still enforces the fixed `WORLD_ACTION`, so dynamic secret-identifier actions require a backend action-policy update before production use.