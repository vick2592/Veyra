# Project Veyra: AI Agent Broker with World ID & Ledger Key Ring

## Architecture Overview
Veyra is a secure API broker for AI agents. It prevents agents from holding raw API keys. Instead, the keys are stored in a Ledger Key Ring encrypted file (`secrets.enc`). When an agent needs to execute an action, the human user must authorize it via a World ID Face Auth zero-knowledge proof. Once verified, the Node.js backend headlessly decrypts the `secrets.enc` file in-memory using `@ledgerhq/wallet-cli`, executes the API call, and immediately destroys the plaintext keys.

## Backend Specification (Node.js/Express)
1.  **Dependencies:** `express`, `cors`, `dotenv`, `@worldcoin/idkit-core`. The server must also assume `@ledgerhq/wallet-cli` is installed globally.
2.  **World ID Middleware:** 
    *   Create an Express route (`/api/execute-agent`) that expects a JSON payload containing the agent's requested action and a World ID proof (`proof`, `merkle_root`, `nullifier_hash`, `verification_level`).
    *   The route must verify the proof against the Worldcoin Developer Portal API (`https://developer.worldcoin.org/api/v2/verify/...`).
    *   Ensure the `verification_level` strictly requires "orb" to enforce Face Auth / strict liveness.
3.  **Ledger Key Ring Decryption (Headless):**
    *   If the World ID proof is valid, use Node's `child_process.exec` to run the following shell command to decrypt the file:
        `WALLET_PASS="${process.env.WALLET_PASS}" wallet-cli ring decrypt -i ../../secrets.enc -o /tmp/secrets.txt --key veyra-root`
    *   Read `/tmp/secrets.txt` into memory (parsing the `.env` formatted API keys).
    *   Immediately use `fs.unlinkSync('/tmp/secrets.txt')` to destroy the file on disk so the raw keys are never left exposed.
4.  **Agent Execution:**
    *   Use the decrypted API key currently held in memory to execute a mock API call (e.g., a dummy fetch to OpenAI).
    *   Return the API response to the frontend.
    *   Ensure the variable holding the plaintext key is garbage collected or overwritten.

## Frontend Specification (Next.js)
1.  **Dependencies:** `@worldcoin/idkit`.
2.  **UI Component:** Implement the `<IDKitWidget>` configured with the `action` and `app_id` corresponding to the Veyra project.
3.  **Flow:** The user clicks "Authorize Agent Execution", completes the World ID prompt, and the `onSuccess` callback passes the proof payload directly to the Express backend's `/api/execute-agent` endpoint.