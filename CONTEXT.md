# Veyra - Architecture & System Context

**Objective:** A decentralized, Sybil-resistant AI agent capability broker. It utilizes World ID 4.0 (Face Auth) for human-in-the-loop authorization, Ledger Key Ring for encrypted API secret custody, and Bazantic middleware for x402 paid request admission.

## 1. Live Network State (Base Sepolia)
*   **Chain ID:** `84532` (Base Sepolia)
*   **VeyraRegistry:** `0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC` (Deployed Block: `46653253`)
*   **CapabilityRegistry (Audit):** `0xcdd2EEfAdDB243FF07b97B65574be4fEfF4D8ff7`
*   **World ID Router:** `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` (Group ID: `1`)

## 2. Workspace Structure
*   `apps/frontend/`: Next.js App Router (Port 3000). Houses the Web3 Wagmi/Viem gate and the `/sandbox` developer dashboard.
*   `apps/backend/`: Express/Node.js API (Port 3001). Handles the Bazantic request queue, blockchain event listener, and Ledger Key Ring decryption.
*   `blockchain/`: Foundry workspace containing smart contracts (`src/`) and deployment scripts (`script/`).

## 3. The End-to-End Execution Flow
1.  **Request:** An AI agent submits a paid request to `POST /api/bazantic/requests`. The backend queues this in an ephemeral, in-memory Map (`pending_human_auth`).
2.  **World ID Auth (Frontend):** The `/sandbox` UI polls the pending queue. A human selects the request and triggers IDKit. 
3.  **On-Chain Verification:** The frontend submits the normalized proof to `VeyraRegistry.authorizeAgent`. The smart contract dynamically derives the `externalNullifier` (binding human, agent, and secret) and strictly verifies the proof on-chain against the World ID Router.
4.  **Event Emission:** Upon valid cryptographic verification, the registry emits `AgentAuthorized(user, agent, secretId, nullifierHash, requestId, authorizedAt)`.
5.  **Execution (Backend):** A Viem chain listener detects the event, maps it to the pending request ID, uses `@ledgerhq/wallet-cli` to decrypt the allowlisted API key into memory, executes the provider task, and immediately discards the plaintext key.

## 4. Key Technical Constraints & Decisions
*   **Strict On-Chain Verification:** The previous off-chain World ID API verification was deprecated. The contract mathematically verifies the proof via the Base Sepolia router.
*   **Headless IDKit Integration:** The frontend bypasses the default `IDKitWidget` visual modal. It uses the headless `useIDKitRequest` (`environment: 'staging'`) to extract the raw `connectorURI`, enabling a custom UI and a direct `?connect_url=` deep link for frictionless World ID Simulator testing.
*   **Proof Normalization:** The frontend normalizes both v4 (8-element array) and v3/legacy (ABI-encoded string) proof payloads before contract submission to prevent transaction reverts.
*   **Ephemeral State:** The backend queue is intentionally stateless across restarts. Persistent DB architecture is excluded to maintain decentralized trust on-chain.
*   **Secret Custody:** API keys are never stored in plaintext. The contract stores ciphertext, and the backend decrypts on-the-fly using the Ledger keyring.

## 5. Critical Environment Variables

**Backend (`apps/backend/.env`):**
```env
RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
CHAIN_ID=84532
REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
LISTENER_STARTING_BLOCK=46653253
```

**Frontend (`apps/frontend/.env.local`):**
```env
NEXT_PUBLIC_RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
NEXT_PUBLIC_WORLD_ID_APP_ID=app_30cf964190e1900108f1a3abb75d39c0
NEXT_PUBLIC_WORLD_ID_RP_ID=veyra-local
```