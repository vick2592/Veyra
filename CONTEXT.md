# Project Veyra: AI Agent Broker with World ID & Ledger Key Ring

## Build Status

Veyra is successfully scaffolded and built as a two-part Web2 application with a separate Web3 workspace. The completed flow gates agent execution with World ID Orb verification, then lets the backend broker access an allowlisted API key through the Ledger Key Ring.

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
2. The user completes World ID Face Auth through `@worldcoin/idkit` with the `execute-agent` action and strict Orb verification.
3. The frontend posts the flattened proof payload to `http://localhost:3001/api/execute-agent`.
4. The Express backend verifies the proof against the Worldcoin Developer Portal v2 API and rejects any verification level other than `orb`.
5. After successful verification, the backend invokes the globally installed `wallet-cli` with `execFile`, decrypts the Ledger Key Ring output into a private temporary directory, reads the allowlisted `AI_API_KEY` in memory, and removes the temporary plaintext directory in a `finally` block.
6. The backend performs the mock agent-provider request and returns the result to the frontend. Raw keys are never sent to the browser or agent.

## Backend

The backend lives in `apps/backend/` and listens on port `3001` by default.

- Framework: Express with TypeScript
- Route: `POST /api/execute-agent`
- World ID verification: `https://developer.worldcoin.org/api/v2/verify/{app_id}`
- Required verification level: `orb`
- Secret custody: Ledger Key Ring via globally installed `wallet-cli`
- Action allowlist: `execute-agent` maps to `AI_API_KEY`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`

The backend expects `WORLD_APP_ID`, `WORLD_ACTION`, and `WALLET_PASS` before the execution route is enabled. See `apps/backend/.env.example` for the complete configuration.

## Frontend

The frontend lives in `apps/frontend/` and runs on port `3000` by default.

- Framework: Next.js App Router with TypeScript and Tailwind CSS
- World ID SDK: `@worldcoin/idkit@2.4.2`
- Widget: `IDKitWidget` with `VerificationLevel.Orb`
- Action: `execute-agent`
- Broker URL: `NEXT_PUBLIC_BACKEND_URL`, defaulting to `http://localhost:3001`
- Commands: `npm install`, `npm run dev`, `npm run typecheck`, `npm run build`

Set `NEXT_PUBLIC_WORLD_ID_APP_ID` in `apps/frontend/.env.local` before using the widget. The local frontend calls the local backend at port `3001`.

## Web3 Packages

The `blockchain/` directory contains the Web3 packages, contracts, and blockchain-specific workspace configuration. It is separate from the independently installable Web2 applications under `apps/`.