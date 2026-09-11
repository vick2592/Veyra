# Veyra - Architecture & System Context

**Objective:** A decentralized, Sybil-resistant AI agent capability broker utilizing World ID Face Auth, Ledger Key Ring, and Bazantic middleware.

## 1. Live Network State (Base Sepolia)
*   **Chain ID:** `84532`
*   **VeyraRegistry:** `0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC`
*   **World ID Router:** `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` (Group ID: 1)

## 2. Cryptographic Alignment & Execution Flow
1.  **Request Queue:** AI agent requests enter the ephemeral Bazantic in-memory Map (`pending_human_auth`).
2.  **World ID Auth:** The frontend IDKit uses a static `action="execute-agent"` to generate the proof, while the `signal` passes the raw `encodePacked(user, agent, secretId)` bytes to prevent double-hashing mismatches in the World ID Simulator.
3.  **On-Chain Verification:** `authorizeAgent` dynamically derives the `externalNullifier` via `keccak256("execute-agent")` and verification mathematically succeeds against the World ID Router on Base Sepolia. The `nullifierHash` is saved to state to prevent replay attacks.
4.  **Stateless Polling Listener:** To bypass public RPC load-balancer state drops (`filter not found`), the Viem listener utilizes a custom `getLogs` polling loop tracking `lastPolledBlock`.
5.  **Decryption & Execution:** The backend attempts Ledger Key Ring decryption. If `VEYRA_DEMO_MODE=true`, it safely falls back to environment variables (`OPENAI_API_KEY`) to ensure uninterrupted execution without physical hardware.

---

## End-to-End Testing Guide

Follow this sequence exactly to test the decentralized authorization and execution flow on your local machine.

### 1. Environment Setup

**Backend (`apps/backend/.env`):**
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

**Frontend (`apps/frontend/.env.local`):**
```env
NEXT_PUBLIC_RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
NEXT_PUBLIC_WORLD_ID_APP_ID=app_30cf964190e1900108f1a3abb75d39c0
NEXT_PUBLIC_WORLD_ID_RP_ID=veyra-local
```

### 2. Contract State Initialization
The Base Sepolia registry strictly requires an active user and secret in its state. Execute these transactions from the **exact same wallet address** you will use in the frontend sandbox. 

Using Foundry (`cast`):
```bash
# 1. Register your test wallet
cast send 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC "registerUser(bytes,uint32)" 0x00 0 --rpc-url [https://sepolia.base.org](https://sepolia.base.org) --private-key <YOUR_TEST_WALLET_PK>

# 2. Store the mock secret payload
cast send 0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC "storeSecret(bytes32,string,bytes)" 0xb7c13b673a2c35d90c6173b5f0840fb89b35ea037ec004e2dc888c43eb082896 "openai-key" 0x12345678 --rpc-url [https://sepolia.base.org](https://sepolia.base.org) --private-key <YOUR_TEST_WALLET_PK>
```

### 3. Execution
1. Start both servers by running `npm run dev` in `apps/backend` and `apps/frontend`.
2. Ensure your MetaMask wallet is connected to **Base Sepolia** using the address initialized in Step 2.
3. Open `http://localhost:3000/sandbox`.
4. Click to simulate an incoming agent request. 
5. Complete the World ID Face Auth Simulator flow. *(Note: World ID employs strict double-spend protection. You must generate a **brand new proof** for every authorization attempt. Stale proofs will revert with an `InvalidNullifier` error).*
6. Click **Authorize Agent** and confirm the transaction in MetaMask.
7. Monitor your backend terminal. The stateless polling loop will detect the `AgentAuthorized` event, decrypt the key via the demo fallback, and execute the final agent task.