# Project Veyra: AI Agent Broker with World ID & Ledger Key Ring

## Build Status

Veyra is successfully scaffolded and built as a two-part Web2 application with a separate Web3 workspace. The completed flow gates agent execution with World ID's RP architecture, then lets the backend broker access an allowlisted API key through the Ledger Key Ring.

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
3. The frontend opens `IDKitRequestWidget` with `selfieCheckLegacy()`, the `execute-agent` action, and the signed `rp_context`.
4. After World ID returns, the frontend posts `{ rp_id, idkitResponse }` unchanged to `http://localhost:3001/api/execute-agent`.
5. The Express backend forwards the complete response to `https://developer.world.org/api/v4/verify/{rp_id}`.
6. Only after a successful verification response does the backend invoke the globally installed `wallet-cli` with `execFile`, decrypt the Ledger Key Ring output into a private temporary directory, read the allowlisted `AI_API_KEY` in memory, and remove the temporary plaintext directory in a `finally` block.
7. The backend performs the mock agent-provider request and returns the result to the frontend. Raw keys are never sent to the browser or agent.

## Backend

The backend lives in `apps/backend/` and listens on port `3001` by default.

- Framework: Express with TypeScript
- Route: `POST /api/execute-agent`
- RP signing route: `POST /api/world-id/sign`
- World ID verification: `https://developer.world.org/api/v4/verify/{rp_id}`
- Verification payload: complete IDKit response, forwarded without legacy field remapping
- Secret custody: Ledger Key Ring via globally installed `wallet-cli`
- Action allowlist: `execute-agent` maps to `AI_API_KEY`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`

The backend expects `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, `WORLD_ID_SIGNING_KEY`, `WORLD_ACTION`, and `WALLET_PASS` before the execution route is enabled. The signing key is server-only and must never be exposed to the browser. See `apps/backend/.env.example` for the complete configuration.

## Frontend

The frontend lives in `apps/frontend/` and runs on port `3000` by default.

- Framework: Next.js App Router with TypeScript and Tailwind CSS
- World ID SDK: current `@worldcoin/idkit` 4.x
- Widget: `IDKitRequestWidget` with a signed `rp_context`
- Credential preset: `selfieCheckLegacy()`
- Action: `execute-agent`
- Broker URL: `NEXT_PUBLIC_BACKEND_URL`, defaulting to `http://localhost:3001`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm run build`

Set `NEXT_PUBLIC_WORLD_ID_APP_ID` and `NEXT_PUBLIC_WORLD_ID_RP_ID` in `apps/frontend/.env.local` before using the widget. The local frontend calls the local backend at port `3001`.

Selfie Check is currently exposed by the SDK as the `selfieCheckLegacy()` preset. The request uses the World ID 4.0 RP signing and verification architecture, while the credential preset remains the SDK's legacy Selfie Check flow.

## Web3 Packages

The `blockchain/` directory contains the Web3 packages, contracts, and blockchain-specific workspace configuration. It is separate from the independently installable Web2 applications under `apps/`.