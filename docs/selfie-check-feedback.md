# World ID Selfie Check Feedback

## Submission Context

- Project: Veyra AI agent capability broker
- Evaluation date: 2026-09-09
- Integration surface: `apps/frontend/src/app/sandbox/page.tsx`
- Backend surface: `apps/backend/src/world-id.ts` and the Bazantic request routes
- SDK: `@worldcoin/idkit` 4.x with `IDKitRequestWidget`
- Credential preset: `selfieCheckLegacy()`
- Frontend environment: World ID staging, local Anvil (`31337`), local Veyra backend
- Intended security boundary: an AI agent may request a capability, but a human must pass a liveness check before the scoped secret authorization is submitted on-chain

This report distinguishes repository observations from manual observations that still need to be recorded during the final bounty run. No biometric data, private keys, API keys, or raw provider secrets belong in this document.

## Integration Summary

Veyra uses Selfie Check as a human-presence and abuse-prevention gate in a larger authorization flow:

1. An agent request is admitted through the local Bazantic-style adapter after payment validation or local mock payment headers.
2. The request enters an in-memory `pending_human_auth` queue with an expiry time.
3. The sandbox requests a short-lived RP signature from the backend. The action is the selected allowlisted secret identifier.
4. The sandbox opens `IDKitRequestWidget` with the selected action, signed `rp_context`, `environment="staging"`, and `selfieCheckLegacy()`.
5. The Selfie Check proof signal binds the connected wallet, agent address, and hashed secret identifier.
6. The client normalizes the returned proof and holds it for the registry transaction. Proof completion alone does not execute the capability.
7. The wallet submits `VeyraRegistry.authorizeAgent`, binding the human wallet, agent, secret ID, and request ID.
8. After confirmation, the backend chain listener claims the matching request and executes the allowlisted capability through Ledger Key Ring custody.
9. The sandbox polls for a completed result or a sanitized execution error.

Selfie Check is therefore one control in the chain. It establishes the liveness/human-presence step; the RP signature protects request authenticity; the wallet and registry bind authorization scope; the backend listener performs the capability only after the matching event.

## Documentation Review

### References used

- [World ID overview](https://docs.world.org/world-id)
- [IDKit integration guide](https://docs.world.org/world-id/reference/idkit)
- [World ID Developer Portal](https://developer.world.org)
- [World ID simulator](https://simulator.worldcoin.org/)

### What was clear

- The IDKit guide presents a useful client/backend/World App/Developer Portal architecture.
- The guide makes the server-side RP signature requirement explicit and warns not to expose the signing key in client code.
- The guide documents the `app_id`, `rp_id`, and signing key values obtained from the Developer Portal.
- The guide explains that staging should be used with the simulator for development.
- The guide instructs developers to forward the complete IDKit response to the v4 verification endpoint without legacy field remapping.
- The guide explains that nullifiers are application data that must be stored and checked by the relying party.
- The overview describes Selfie Check as a low-friction liveness and uniqueness signal suited to sign-up and bot defense.

### Friction and ambiguity

- The SDK exposes the Selfie Check credential in this integration through `selfieCheckLegacy()`. The `Legacy` suffix can make developers wonder whether the RP 4.0 signing flow is obsolete, even though the application is using the current 4.0 RP architecture.
- The documentation examples show several credential presets and proof shapes. A developer integrating a contract with a fixed proof array needs an additional, explicit explanation of which response fields map to the contract ABI.
- The staging simulator, Developer Portal configuration, app registration, and RP registration are separate concepts. The setup path would be easier to follow with a single Selfie Check checklist from app creation through first staging proof.
- Portal labels and available settings can change. The exact labels used during the bounty run should be captured with the portal version/date rather than copied into a permanent guide as unverified UI instructions.

## Developer Portal Navigation

The following is the intended navigation checklist. Record the exact visible labels and any differences encountered in the final manual run.

1. Open the [Developer Portal](https://developer.world.org) and select the Veyra application or create a dedicated staging application.
2. Locate the application identifiers and record the `app_id` and `rp_id` in local environment configuration only.
3. Complete or confirm World ID 4.0 RP registration if the portal presents an enable or migration step.
4. Locate the RP signing key configuration. Store the signing key only in the backend environment as `WORLD_ID_SIGNING_KEY`; never place it in the frontend bundle or `.env.local` file.
5. Confirm the credential configuration includes the Selfie Check flow required by the SDK preset.
6. Confirm the configured application origins, redirect/callback settings, or domain settings required by the current IDKit widget and staging flow.
7. Use the staging environment with the [World ID simulator](https://simulator.worldcoin.org/) for development proofs. Do not treat a staging proof as production authorization evidence.
8. Keep the portal app ID and RP ID aligned with the frontend `NEXT_PUBLIC_WORLD_ID_APP_ID`, frontend `NEXT_PUBLIC_WORLD_ID_RP_ID`, and backend `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID` values.
9. Verify the backend verification endpoint is configured for the intended environment and RP ID.

**Portal evidence to collect:** portal navigation screenshots with identifiers and secrets redacted, the exact setting names, any setup warnings, and the timestamp/version of the portal experience.

## Sandbox State Walkthrough

| State or surface | Expected behavior | User-facing meaning | Evidence to collect |
| --- | --- | --- | --- |
| Initial sandbox | Shows the agent request simulator and the human authorization narrative | An agent can request work, but cannot authorize a sensitive key alone | Screenshot of initial copy |
| Simulated request | Creates a local mock-paid request with a fresh idempotency key | This is a local relay simulation, not proof of production Bazantic settlement | Request ID and response status, with payment values redacted if needed |
| Pending queue | Polls every three seconds and shows non-expired `pending_human_auth` requests | A human chooses which agent request to review | Request ID, expiry, and queue state |
| Request selection | Resets prior proof and transaction state for the selected request | The Selfie Check action and authorization scope are tied to this request | Selected secret identifier and request ID, without secrets |
| Wallet connection | Connects an injected wallet through Wagmi | The wallet supplies the human address used in the signal and signs the registry transaction; it is not the liveness check | Wallet address may be shortened/redacted |
| RP preparation | Calls `POST /api/world-id/sign` for the selected action | The backend proves that the request came from the configured relying party | HTTP status and redacted response shape |
| IDKit open | Opens the staging `IDKitRequestWidget` with the signed RP context | The user is asked to complete Selfie Check | Screenshot of widget state, with no biometric content |
| Proof received | Normalizes the IDKit response and requires an eight-value on-chain proof | Liveness proof is ready, but no key access has happened yet | Proof shape only; never record proof values in a public report |
| Registry authorization | Calls `authorizeAgent` with agent, secret ID, proof values, and request ID | The contract binds the human authorization to one agent, one key identifier, and one request | Transaction hash and contract address |
| Transaction confirmation | Waits for one receipt confirmation | The authorization is accepted on-chain; backend execution is still asynchronous | Receipt status and block number |
| Listener execution | Polls the request while the listener claims and executes it | The authorized request is being performed through the backend custody path | Request state transition timing |
| Completed | Displays the provider result | The scoped capability completed after authorization | Sanitized result only |
| Failed | Displays a sanitized error and code when available | Authorization or execution failed without exposing key material | Error code/message, with secrets removed |

## Proof Flows

### Successful Selfie Check flow

1. Create or receive a pending request.
2. Select the request and connect a local wallet.
3. Ask the backend to sign the selected action.
4. Open IDKit in staging and complete Selfie Check through the simulator.
5. Let `handleVerify` receive the complete IDKit payload.
6. Normalize the legacy top-level shape or the `responses[0]` shape into `root`, `nullifierHash`, and an eight-element proof.
7. Close the widget and enable the registry authorization action.
8. Submit the proof and request-correlated authorization transaction.
9. Wait for the receipt and the asynchronous chain listener result.

### Cancellation and failure flow

The report should record the exact error code and visible message for each case that can be reproduced:

- User closes or cancels the Selfie Check widget.
- IDKit returns an error or an incomplete response.
- The action in the response does not match the selected secret identifier.
- The response has no usable nullifier or does not contain exactly eight proof values.
- The RP context is incomplete or expires before completion.
- The World ID verification endpoint is unavailable or rejects the proof.
- The registry transaction is rejected, underfunded, sent on the wrong network, or fails contract validation.
- The request expires or disappears before the authorization transaction is submitted.

A completed Selfie Check must never be described as equivalent to a completed registry authorization. The proof is an input to the authorization transaction, not a provider credential or raw API key.

## Test Users and Accounts

Use separate identities for each trust boundary:

- **World ID staging test identity:** Use the test identity or simulator flow supported by the current World ID staging documentation. Do not record the identity, face data, screenshots containing biometric information, or recovery material.
- **Local Anvil wallet:** Use a funded Anvil account only for local transaction signing. Do not reuse a production wallet or publish its private key.
- **Backend test configuration:** Use placeholder app/RP identifiers, a development signing key, and test-only encrypted key material. Do not use a production signing key, `WALLET_PASS`, provider key, or real customer secret.
- **Provider test response:** Prefer a deterministic mock provider or a response whose output contains no sensitive data. Redact any returned authorization headers or provider payloads.

The final evaluation should list only the test roles, configuration class, network, and outcome. It should not identify a person or publish credentials.

## Error and Edge-Case Matrix

| Case | Expected behavior | Developer friction / follow-up |
| --- | --- | --- |
| Missing World ID variables | Backend signing/verification setup is unavailable; the frontend cannot prepare Selfie Check | The UI should make missing `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, or `WORLD_ID_SIGNING_KEY` easy to diagnose |
| Missing frontend app or RP ID | Selfie Check start is disabled or cannot construct a valid widget request | Configuration requirements are split between frontend and backend environment files |
| Backend unavailable | Pending polling and signing fail with an HTTP/network error | The sandbox needs a running backend and a clear local-service status path |
| No injected wallet | Wallet connection cannot begin | Wallet setup is a separate prerequisite from Selfie Check and should not be described as Face Auth |
| Wrong wallet/network | Transaction may be rejected or contract interaction may fail | Local Anvil chain ID and deployed registry address must be visibly aligned |
| Wallet or transaction rejection | Authorization enters an error state; no execution should occur | Capture the wallet/provider error without recording account secrets |
| Missing registry address | Registry authorization cannot be submitted | Frontend and backend registry configuration must point to the same deployment |
| Expired request | It is removed from the pending list and status polling can return 404 | The selected request can become invalid while the user is completing Selfie Check |
| Duplicate idempotency key | The original request is returned with `202` rather than creating a second request | Retry guidance should explain stable idempotency keys |
| Payment rejection | The request returns `402` or `502` depending on payment handling | Local mock headers are not equivalent to production settlement |
| RP signing error | The widget does not open and the authorization state reports an error | Server-side signing key custody is essential but configuration errors are not always self-explanatory |
| Widget cancellation | No proof is retained and no registry transaction should be sent | Capture the SDK error code and preserve a retry path |
| Incomplete proof | The sandbox rejects it before registry submission | The fixed eight-element contract input is stricter than the generic proof examples |
| Wrong action | Backend verification rejects an action mismatch | Action should remain visibly bound to the selected key identifier |
| Verification outage or rejection | Backend returns a sanitized World ID verification failure | Distinguish invalid proof from temporary portal/network unavailability |
| Listener delay | Transaction can be confirmed while the request remains executing | The asynchronous wait needs timing guidance and observability |
| Duplicate event delivery | Listener suppresses duplicate or concurrent processing in memory | Exactly-once processing and durable log cursors are not implemented across restarts |
| Backend restart | Incomplete in-memory relay requests are lost | The queue is intentionally ephemeral and is not a durable authorization record |
| Keyring/provider failure | Request becomes failed with a sanitized error; plaintext key material must not be exposed | More structured local diagnostics would help developers without leaking secrets |

## Honest Developer Friction

### Configuration is distributed

A working run requires coordinated frontend, backend, local chain, registry, World ID, and keyring configuration. The app has environment examples, but a single preflight checklist would reduce time spent diagnosing whether a failure is caused by the browser, backend, RPC, contract, or World ID Portal.

### Wallet and Selfie Check are easy to conflate

The wallet is needed for the signal and registry transaction. Selfie Check is the liveness gate. Treating wallet connection as Face Auth makes the security model harder to understand, so the sandbox now presents these as separate steps.

### Credential naming is surprising

`selfieCheckLegacy()` is the SDK-facing preset even though the integration uses World ID 4.0 RP signing and verification. The naming is technically actionable but creates uncertainty about whether the developer is using the recommended flow. The docs should explain this relationship directly.

### Proof shapes need a contract-oriented example

The generic IDKit guide supports multiple protocol versions and response shapes. A developer integrating a Solidity function with `uint256[8]` needs a clear mapping from the selected Selfie Check response to `root`, `nullifierHash`, and the eight proof values, including which shapes are accepted and which are rejected.

### Local success has several asynchronous boundaries

A successful proof does not mean a successful transaction, and a successful transaction does not mean the provider has completed. The queue, registry receipt, listener confirmation depth, keyring decryption, and provider request each add a separate failure or waiting state.

### Local payment is easy to overread

The sandbox creates payment-like headers to exercise the local adapter. This is useful for testing queue admission, but it should not be mistaken for a production x402/MPP payment or Bazantic-hosted settlement result.

### Observability is intentionally limited

The listener retries watcher failures and suppresses duplicates, but durable cursors and cross-restart exactly-once handling are not present. The developer experience would improve with a redacted request timeline showing the last observed chain block, confirmation target, and listener status.

### Documentation/API mismatch

The current OpenAPI document covers request creation, pending listing, and status polling, but not the frontend-required `POST /api/world-id/sign` route. It also describes an optional `input` field as forwarded to the capability while the current queue/request implementation does not retain or forward that value. These should be resolved or called out before the API is presented as a complete production contract.

## Evidence Checklist

Collect only redacted, non-sensitive evidence:

- [ ] World ID documentation URLs and access date
- [ ] Developer Portal navigation screenshots with app IDs, RP IDs, signing keys, domains, and personal data redacted
- [ ] Sandbox initial, queue, Selfie Check, proof-ready, transaction, execution, success, and error states
- [ ] World ID staging/simulator outcome and exact SDK error codes for failed attempts
- [ ] Request ID, registry address, transaction hash, receipt status, block number, and confirmation depth
- [ ] Backend request status transitions and listener timing
- [ ] Frontend and backend command output summaries
- [ ] Test role and network used for each scenario
- [ ] Confirmation that no proof values, biometric material, private keys, payment credentials, API keys, or plaintext secrets were included

## Verification Record

The automated checks below were run on 2026-09-09. The manual staging items remain unchecked because they were not executed in this pass.

- [x] `cd apps/frontend && npm run typecheck` — passed
- [x] `cd apps/frontend && npm run build` — passed
- [x] `cd apps/backend && npm run typecheck` — passed
- [x] `cd apps/backend && npm test` — passed: 5 files, 36 tests
- [x] `cd apps/backend && npm run build` — passed
- [ ] Manual staging Selfie Check success flow
- [ ] Manual cancellation/error flow
- [ ] Manual expired-request or unavailable-service flow
- [ ] Manual confirmed registry authorization followed by listener execution

## Recommended Improvements

1. Add a first-party Selfie Check setup checklist that joins Developer Portal, RP signing, staging simulator, and proof verification steps.
2. Explain the `selfieCheckLegacy()` name and the distinction between a legacy credential preset and the current RP 4.0 architecture.
3. Add a contract-oriented proof mapping example for each supported IDKit response shape.
4. Add explicit frontend/backend configuration diagnostics for missing or mismatched app IDs, RP IDs, registry addresses, and networks.
5. Document the asynchronous boundary between registry confirmation and listener execution, including confirmation depth and restart behavior.
6. Add the RP signing endpoint to the OpenAPI document and either implement or remove the currently documented `input` field.
7. Provide a redacted local preflight command or health view that checks service availability without exposing secrets.

## Overall Assessment

Selfie Check is a strong fit for Veyra's abuse-prevention boundary: it adds a liveness and human-presence check before an AI agent's request can be bound to a sensitive capability. The integration is clearest when Selfie Check, wallet signing, registry authorization, and backend execution are presented as separate controls. The main developer friction is not the proof concept itself; it is coordinating the portal setup, staging terminology, proof-shape expectations, local chain prerequisites, and asynchronous execution states into one predictable setup path.
