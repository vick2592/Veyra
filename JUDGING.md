
## World ID - Selfie Check

**The Bounty Objective:** Validate where a low-friction biometric credential is useful for abuse prevention, treat Selfie Check as a risk signal, and provide detailed integration feedback.

**How Veyra Fulfills It:** Veyra acts as a hardware capability broker for AI agents. To prevent rogue agents or script abuse from draining API limits, World ID acts as our Sybil-resistant risk gate — a live human must generate a proof to explicitly approve the agent's action before any hardware decryption occurs. We used the Face Auth / Simulator flow for a flawless demo while providing extensive feedback on the Selfie Check beta.

**Code Evidence:**
- `apps/frontend/src/components/request/HumanConfirmation.tsx` - **IDKit Integration:** Implements the World ID widget, passing a strict static action (`execute-agent`) and a packed signal (`encodePacked(user, agent, secretId)`).
- `blockchain/packages/contracts/src/VeyraRegistry.sol` - **authorizeAgent() function:** Verifies the ZK proof on-chain via the Base Sepolia World ID Router and emits the nullifier hash in the `AgentAuthorized` event. Note: replay protection itself is scoped to the x402 payment `requestId` (single-use per paid request), not the nullifier — see the contract's own doc comments at lines 25-27 and 342-344.

**Bounty Deliverables:** `docs/selfie-check-feedback.md` contains our comprehensive feedback on Developer Portal navigation, Sandbox states, and Selfie Check friction, as required by the bounty.

---

## Ledger - Developer Ecosystem: Agent Stack & Key Ring CLI

**The Bounty Objective:** Build an application where device-backed security is central — agents that use secrets they cannot leak, built on the Ledger Key Ring CLI (`wallet-cli ring`), incorporating x402-style payments and human-in-the-loop approvals.

**How Veyra Fulfills It:** Veyra is purpose-built as a hardware capability broker. Cloud AI agents (via an x402 payment gateway) can request access to API keys, but the plaintext key never leaves the backend Ledger Key Ring enclave. Combined with our World ID integration, Veyra ensures autonomous behavior is made safer by requiring human-in-the-loop approval before the hardware executes decryption.

**Code Evidence:**
- `apps/backend/src/keyring.ts` - **Universal Hardware Custodian:** Implements `@ledgerhq/wallet-cli`, executing `ring encrypt` and `ring decrypt` commands to secure user credentials inside a physical Ledger device.
- `apps/backend/src/secrets.ts` - **Per-User Hardware Isolation:** Derives a deterministic, collision-resistant hardware slot for every user (`veyra-user-<leafIndex>`) via `leafIndexFromAddress`, using `keccak256(userAddress) % 2^31`, proving dynamic multi-user key management on a single hardware device.
- `apps/backend/src/services/chainListener.ts` - **Human-in-the-Loop Trigger:** Listens for the `AgentAuthorized` smart contract event (emitted only after World ID ZK-proof verification) to trigger the Ledger decryption flow.

**Bounty Deliverables:** `keyring.ts` also ships a `VEYRA_DEMO_MODE=true` software fallback (HKDF + AES-256-GCM in place of the physical device) so judges without a Ledger on hand can still exercise the full cryptographic flow locally.

---

## Bazantic - Add a New API & Create a Recipe

**The Bounty Objective:** Bring a new, useful API service into Bazantic, configure an x402/MPP Gateway, and create a reusable recipe demonstrating capabilities agents previously lacked. Provide a screen recording and the developer's Bazantic username.

**How Veyra Fulfills It:** We brought a novel service to the Bazantic network: physical hardware custody. By exposing our backend over an ngrok tunnel, we turned a local Ledger Key Ring into a cloud-accessible API. Autonomous cloud AI agents can now pay an x402 micro-toll to securely encrypt data directly into a physical hardware enclave — a high-security action cloud agents could not perform before. This recipe is reusable for any agent needing offline custody of API keys.

**Code Evidence:**
- `apps/backend/openai.yaml` - **API Specification:** The OpenAPI schema served over the ngrok tunnel and fetched by Bazantic's `gateway add --spec-url`, defining the `/api/secrets/encrypt` endpoint, its `userAddress`/`secretValue` payload, and the x402 payment parameters.
- `apps/backend/src/secrets.ts` (`createEncryptSecretHandler`, mounted at `/api/secrets/encrypt` in `apps/backend/src/app.ts`) - **x402 Gateway Endpoint:** Receives the inbound payload routed from the Bazantic cloud, validates the request, and passes the plaintext down to the local Ledger hardware layer for encryption.

**Bounty Deliverables:**
- **Demo Video:** Our submitted screen recording demonstrates the Bazantic Sandbox UI paying the micro-toll and triggering the local hardware terminal.
- **Bazantic Username:** `vick2592@gmail.com` (placeholder for the final submission).
