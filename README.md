# Veyra

> Secure AI agent infrastructure gated by World ID Face Auth, Ledger Key Ring custody, and Bazantic x402 micro-payments.

Veyra is a capability broker that allows autonomous AI agents and human operators to manage and execute sensitive tasks without ever exposing raw, plaintext API keys. The platform bridges three distinct trust layers:
1. **World ID Face Auth:** Verifies human liveness and uniqueness via zero-knowledge proofs before authorizing agent execution.
2. **Ledger Key Ring Custody:** Derives per-user isolated encryption slots directly on a physical Ledger device (`@ledgerhq/wallet-cli`) or secure fallback.
3. **Bazantic x402 Gateway:** Token-gates agent execution endpoints on Base Sepolia, enabling autonomous agents to pay micro-tolls (1,000 millicents / $0.01 per call) to lock credentials into hardware enclaves.

---

## Status

The platform is fully scaffolded, deployed to **Base Sepolia**, and operational.

- **Phase 1 — Multi-User Dashboard & Per-User Hardware Decryption:** Complete. Connected wallets can register, encrypt, and store secrets under hardware-derived key slots and trigger the World ID authorization pipeline from `/dashboard` and `/sandbox`.
- **Phase 2 — Bazantic x402 Agent Gateway Integration:** Complete. The Veyra Hardware Broker is published as an active Gateway and reusable Recipe on Bazantic, exposing headless hardware encryption directly to cloud agents paying via Base Sepolia smart contracts.

---

## Core Technologies & Integrations

| Layer | Technology | Integration Details |
|---|---|---|
| **Identity & ZK-Proofs** | **World ID** (IDKit / Staging Router) | Zero-knowledge proof verification preventing Sybil attacks. Binds human liveness to the `execute-agent` action and burns nullifiers on-chain (`VeyraRegistry.sol`) to prevent replay attacks. |
| **Hardware Custody** | **Ledger** (`@ledgerhq/wallet-cli`) | Universal Hardware Custodian running on the host machine. Derives deterministic, collision-resistant hardware keys (`veyra-user-<leafIndex>`) via BIP-32 slots (`m/44'/60'/0'/0/<index>`). Includes software HKDF + AES-256-GCM fallback when `VEYRA_DEMO_MODE=true`. |
| **Agent Monetization** | **Bazantic x402 Gateway** | Implements the x402 micropayment protocol. Inbound requests from autonomous cloud agents are metered and settled on Base Sepolia at $0.01 per call before routing through an `ngrok` tunnel to the local Express backend. |
| **Agent Orchestration** | **Bazantic Recipes & MCP** | Exposes an `openapi.yaml` schema allowing Claude and other LLMs to discover, bind, and autonomously call Veyra's hardware broker tools (`encryptSecret`). |
| **Settlement Chain** | **Base Sepolia (Chain ID: 84532)** | Hosts `VeyraRegistry.sol` for state tracking, secret metadata storage, and event emission (`AgentAuthorized`). |
| **Fullstack Framework** | **Next.js & Express** | Next.js 14 App Router frontend (`apps/frontend`, port 3000) and an Express Node.js listener/broker (`apps/backend`, port 3001) with Viem-based polling. |

---

## Architecture

```text
                                  +-----------------------+
                                  | Autonomous AI Agents  |
                                  +-----------+-----------+
                                              |
                                              | (x402 Micro-payment: $0.01)
                                              v
+-----------------------+         +-----------------------+
| Human User (IDKit)    |         | Bazantic x402 Gateway |
+-----------+-----------+         +-----------+-----------+
            |                                 |
 (ZK Proof) |                                 | (HTTP POST /ngrok)
            v                                 v
+-----------+---------------------------------+-----------+
|                      Veyra Express Broker               |
|                           (Port 3001)                   |
+-----------------------------+---------------------------+
                              |
     +------------------------+------------------------+
     |                                                 |
     v                                                 v
+----+--------------------+               +------------+------------+
|  Ledger Hardware Enclave|               | Base Sepolia Blockchain |
|  (@ledgerhq/wallet-cli) |               |  (VeyraRegistry.sol)    |
|  - BIP-32 Key Ring      |               |  - World ID Router      |
|  - Ciphertext Decrypt   |               |  - Secret Metadata      |
+-------------------------+               +-------------------------+
```

### Dual Execution Paths

#### 1. Autonomous Agent Path (Bazantic Cloud Flow)
1. An autonomous agent discovers the `Veyra Hardware Broker` recipe on Bazantic.
2. The agent submits a request with an API credential to `/api/secrets/encrypt`.
3. Bazantic intercepts the call, deducts $0.01 via x402 smart contract settlement, and forwards the payload to Veyra's ngrok tunnel.
4. The local Express backend invokes `@ledgerhq/wallet-cli` to encrypt the credential into a dedicated BIP-32 hardware slot.
5. The backend returns the `ciphertextHex` and `bip32Path` to the agent, confirming the credential is safely locked into the physical hardware enclave.

#### 2. Human-in-the-Loop Path (World ID Sandbox Flow)
1. A pending agent action requires access to an existing sensitive secret.
2. The human opens `/dashboard` and initiates World ID Face Auth.
3. IDKit generates a ZK proof bound to the static action `"execute-agent"` and the packed signal `encodePacked(user, agent, secretId)`.
4. The frontend calls `VeyraRegistry.authorizeAgent` on Base Sepolia.
5. The contract verifies the proof against the World ID Router and emits `AgentAuthorized`.
6. The backend's stateless Viem polling listener picks up the event, pulls the ciphertext from the registry, decrypts it via the physical Ledger (or demo fallback), and runs the delegated task.

---

## Live Contract Deployments (Base Sepolia)

| Contract | Address | Purpose |
|---|---|---|
| **VeyraRegistry** | `0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC` | Stores secret ciphertexts, verifies ZK proofs, tracks nullifiers |
| **World ID Router** | `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` | Staging World ID verification contract (Group ID: 1) |

---

## Local Setup & Development

### 1. Prerequisites
- Node.js 22+
- MetaMask or Web3 browser wallet configured for Base Sepolia
- Foundry (`cast`, `forge`)
- [ngrok](https://ngrok.com/) (for exposing local backend to Bazantic)
- Optional: Physical Ledger device with Ethereum app opened (or use `VEYRA_DEMO_MODE=true`)

---

### 2. Backend Configuration

```bash
cd apps/backend
npm install
cp .env.example .env
```

Set the following in `apps/backend/.env`:
```env
RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
CHAIN_ID=84532
REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC

# Fast polling configuration (avoids public RPC 10,000 block scanning limit)
LISTENER_STARTING_BLOCK=46740641

# Set to true to mock Ledger operations if physical hardware is disconnected
VEYRA_DEMO_MODE=true
OPENAI_API_KEY=sk-your-trial-key-here
```

Start the backend:
```bash
npm run dev
# Running on http://localhost:3001
```

---

### 3. Frontend Configuration

```bash
cd apps/frontend
npm install
cp .env.example .env.local
```

Set the following in `apps/frontend/.env.local`:
```env
NEXT_PUBLIC_RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
NEXT_PUBLIC_WORLD_ID_APP_ID=app_30cf964190e1900108f1a3abb75d39c0
NEXT_PUBLIC_WORLD_ID_RP_ID=veyra-local
```

Start the frontend:
```bash
npm run dev
# Running on http://localhost:3000
```

---

### 4. Contract State Initialization

The Base Sepolia registry requires that your testing wallet address is registered and has an initialized secret slot before processing human authorizations.

Using Foundry (`cast`):
```bash
# 1. Register your test wallet
cast send 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC \
  "registerUser(bytes,uint32)" 0x00 0 \
  --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
  --private-key <YOUR_TEST_WALLET_PK>

# 2. Store the mock secret payload
cast send 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC \
  "storeSecret(bytes32,string,bytes)" \
  0xb7c13b673a2c35d90c6173b5f0840fb89b35ea037ec004e2dc888c43eb082896 "openai-key" 0x12345678 \
  --rpc-url [https://sepolia.base.org](https://sepolia.base.org) \
  --private-key <YOUR_TEST_WALLET_PK>
```

---

## Testing & Verification

### Test A: Bazantic Autonomous Agent Flow (Demo Mode)
1. In a separate terminal, expose your backend:
   ```bash
   ngrok http 3001
   ```
2. Verify your Bazantic Gateway routes to the active ngrok URL with **No Auth** (handled by x402).
3. Open your published **Veyra Hardware Broker** Recipe on Bazantic.
4. Input test parameters into the Recipe Sandbox:
   - **Credential Type:** `api_key`
   - **API Service Name:** `OpenAI`
   - **Hardware Slot ID:** `m/44'/60'/0'/0/1`
   - **Agent Task Description:** `Encrypt the dummy API key 'sk-proj-12345' securely into the hardware slot.`
5. Click **Test**.
6. Observe the Bazantic agent trigger the x402 payment, receive a `200 OK` from `POST /api/secrets/encrypt`, and return the `ciphertextHex` and `bip32Path`.

---

### Test B: World ID Human-in-the-Loop Sandbox Flow
1. Navigate to `http://localhost:3000/sandbox`.
2. Connect MetaMask to **Base Sepolia** using the address initialized above.
3. Click **Simulate Incoming Agent Request**.
4. Open the World ID Face Auth Simulator and generate a new zero-knowledge proof.
   > **Note:** World ID enforces strict double-spend protection. Reusing an existing or expired proof will cause the contract to revert with `InvalidNullifier`. Always generate a fresh proof in the simulator.
5. Click **Authorize Agent** and confirm the on-chain transaction.
6. Check your backend terminal: the stateless polling loop detects `AgentAuthorized`, executes the decryption sequence, and finishes the task.

---

## Project Verification Commands

Run full-suite static analysis, contract tests, and compilation checks:

```bash
# Backend checks
cd apps/backend && npm run typecheck && npm test && npm run build

# Frontend checks
cd apps/frontend && npm run typecheck && npm run build

# Smart contract tests
cd blockchain/packages/contracts && forge test -vv
```