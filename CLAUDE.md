# Veyra Project Directives for Claude Code

## Context & Architecture
Veyra is an autonomous AI agent broker built for ETHOnline 2026.
- **Smart Contract**: `VeyraRegistry` on Base Sepolia (`0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC`). Secrets are stored per user (`user => secretId => Secret`), so `secretId` only needs to be unique within one user's own labels — `getSecretId(label) = keccak256(label)` (`apps/frontend/src/lib/worldIdAuthorization.ts`).
- **World ID**: Verification on-chain via ZK proof (`execute-agent` action, staging/Face Auth).
- **Ledger Key Ring**: Backend acts as a Universal Hardware Custodian using `@ledgerhq/wallet-cli`. Per-user secrets are encrypted/decrypted under a hardware-scoped key named `veyra-user-<leafIndex>`, where `leafIndex = keccak256(address) % 2^31` (`apps/backend/src/secrets.ts#leafIndexFromAddress`, mirrored exactly by the frontend's `deriveLeafIndex`). Note: `wallet-cli ring encrypt`/`ring decrypt` only accept a `--key <name>` string — there is no `--path` flag, so the "BIP-32 leaf" is a naming convention for the scoped key, not on-device child-key derivation.
- **Bazantic x402 Gateway**: Integrated as an inbound API gateway for autonomous AI agents paying micro-tolls ($0.01) to securely request Ledger hardware encryption via `openapi.yaml` and the `/api/secrets/encrypt` endpoint. 
- **Demo mode**: `VEYRA_DEMO_MODE=true` OR `NODE_ENV=development` makes `keyring.ts` and `secrets.ts` use a software HKDF + AES-256-GCM fallback instead of the real Ledger. The two conditions are OR'd — if `.env` has `NODE_ENV=development`, demo mode is active regardless of `VEYRA_DEMO_MODE`.

## Current Status
- **Phase 1 Complete**: The multi-user onboarding dashboard (`/dashboard` and `/setup`) and the per-user hardware encryption/decryption loop are implemented end-to-end. The frontend securely routes plaintext secrets through the backend hardware custodian (`POST /api/secrets/encrypt`) to retrieve ciphertext *before* storing it on-chain.
- **Phase 2 Complete**: Bazantic x402 bounty integration is live. Cloud AI agents route through the Bazantic gateway directly to the local backend tunnel.
- **Documentation Phase**: Currently finalizing UI copy, architecture diagrams, and the `JUDGING.md` bounty mapping.

## Strict Operational Rules
1. **Never break working files**: Do not modify `apps/backend/src/services/chainListener.ts` or the decryption logic in `apps/backend/src/keyring.ts` without explicit user permission.
2. **No Bazantic in the Frontend**: Bazantic is strictly an inbound routing and payment gateway for the backend. Never attempt to build x402 payment logic or agent simulation into the Next.js frontend. The frontend is exclusively for human World ID authorization and hardware-routed secret management.
3. **Atomic Commits**: Run one task at a time. After writing code and verifying syntax, run `git add` and make a descriptive git commit before moving to the next task.
4. **No blocking commands**: Never run long-running servers (`npm run dev`, `watch`) in foreground interactive bash. Use discrete build checks (`npm run build`, `npx tsc --noEmit`).
5. **Clean Code**: Use existing UI components (Tailwind, `@hugeicons/react` icons, Viem/Wagmi, and `TransactionStatus.tsx`) matching the existing frontend aesthetic.