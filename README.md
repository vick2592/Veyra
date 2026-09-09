# Veyra

> Secure AI agent infrastructure gated by World ID Face Auth and Ledger Key Ring custody.

Veyra is a capability broker that lets an AI agent request sensitive work without holding raw API keys. A human completes World ID Face Auth before the broker verifies the proof, retrieves an allowlisted secret through Ledger Key Ring, and performs the agent-provider request.

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

1. The frontend requests a short-lived RP signature from `POST /api/world-id/sign`.
2. The frontend builds an `rp_context` and opens `IDKitRequestWidget` with the `execute-agent` action and `selfieCheckLegacy()` preset.
3. After World ID returns, the frontend sends `{ rp_id, idkitResponse }` unchanged to the backend.
4. The backend forwards the complete IDKit response to the World ID 4.0 verification endpoint.
5. Only after a successful verification response does the backend use `wallet-cli` through `execFile` to decrypt the Ledger Key Ring into a private temporary directory.
6. The allowlisted key is read in memory, the temporary plaintext is removed, and the mock provider request is returned to the frontend.

### Decentralized authorization flow

1. `blockchain/packages/contracts/src/VeyraRegistry.sol` stores Ledger Key Ring identifiers, never plaintext secrets.
2. A user can register an identifier with `registerSecret` and submit a World ID proof through `authorizeAgent`.
3. The registry verifies the proof against its constructor-fixed World ID group and external nullifier, then records the nullifier so the proof cannot be replayed.
4. A successful authorization emits `AgentAuthorized`.
5. The backend listener watches only the configured registry address, waits for the configured confirmation depth, and passes the event identifier through the shared agent execution path.
6. The listener uses the existing allowlisted Ledger Key Ring decryption flow and calls the configured agent provider without logging or persisting the plaintext API key.

The listener is a background, read-only service. RPC failures do not block the HTTP server; watcher errors are retried, and duplicate event delivery is suppressed in memory.

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
# Set WORLD_ID_APP_ID, WORLD_ID_RP_ID, WORLD_ID_SIGNING_KEY, WORLD_ACTION, and WALLET_PASS in .env
npm run dev
```

To enable the blockchain listener, also set `RPC_URL`, `REGISTRY_ADDRESS`, and optionally `CHAIN_ID`, `LISTENER_STARTING_BLOCK`, `LISTENER_CONFIRMATIONS`, and `LISTENER_POLLING_INTERVAL_MS`.

The Express backend listens on `http://localhost:3001`.

### Frontend

```bash
cd apps/frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_WORLD_ID_APP_ID and NEXT_PUBLIC_WORLD_ID_RP_ID in .env.local
npm run dev
```

The Next.js frontend listens on `http://localhost:3000` and calls `http://localhost:3001` through `NEXT_PUBLIC_BACKEND_URL`.

## Validation Commands

```bash
cd apps/backend && npm run typecheck && npm test && npm run build
cd apps/frontend && npm run typecheck && npm run build
forge build --root blockchain/packages/contracts
forge test --root blockchain/packages/contracts -vv
```

## Web3 Workspace

The `blockchain/` directory is separate from the Web2 apps. It contains the Web3 packages, smart contracts, and blockchain-specific workspace configuration. The Veyra registry is at `blockchain/packages/contracts/src/VeyraRegistry.sol`; the existing `CapabilityRegistry.sol` remains a separate audit registry. Changes to blockchain packages do not require joining or modifying the independent npm projects under `apps/`.