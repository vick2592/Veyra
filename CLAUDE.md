# Veyra Project Directives for Claude Code

## Context & Architecture
Veyra is an autonomous AI agent broker built for ETHOnline 2026.
- **Smart Contract**: `VeyraRegistry` on Base Sepolia (`0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC`). Secrets are stored per user (`user => secretId => Secret`), so `secretId` only needs to be unique within one user's own labels — `getSecretId(label) = keccak256(label)` (`apps/frontend/src/lib/worldIdAuthorization.ts`).
- **World ID**: Verification on-chain via ZK proof (`execute-agent` action, staging/Face Auth).
- **Ledger Key Ring**: Backend acts as a Universal Hardware Custodian using `@ledgerhq/wallet-cli`. Per-user secrets are encrypted/decrypted under a hardware-scoped key named `veyra-user-<leafIndex>`, where `leafIndex = keccak256(address) % 2^31` (`apps/backend/src/secrets.ts#leafIndexFromAddress`, mirrored exactly by the frontend's `deriveLeafIndex`). Note: `wallet-cli ring encrypt`/`ring decrypt` only accept a `--key <name>` string — there is no `--path` flag, so the "BIP-32 leaf" is a naming convention for the scoped key, not on-device child-key derivation.
- **Demo mode**: `VEYRA_DEMO_MODE=true` OR `NODE_ENV=development` makes `keyring.ts` and `secrets.ts` use a software HKDF + AES-256-GCM fallback instead of the real Ledger. The two conditions are OR'd — if `.env` has `NODE_ENV=development`, demo mode is active regardless of `VEYRA_DEMO_MODE`.
- **Current Status**: Phase 1 complete — the multi-user onboarding dashboard (`/dashboard`) and the per-user hardware decryption loop (backend encrypt route → on-chain `storeSecret` → chain-listener-triggered per-user decrypt) are implemented end to end. Bazantic x402 bounty integration has not started yet.

## Strict Operational Rules
1. **Never break working files**: Do not modify `apps/backend/src/services/chainListener.ts` or the decryption logic in `apps/backend/src/keyring.ts` without explicit user permission.
2. **Atomic Commits**: Run one task at a time. After writing code and verifying syntax, run `git add` and make a descriptive git commit before moving to the next task.
3. **No blocking commands**: Never run long-running servers (`npm run dev`, `watch`) in foreground interactive bash. Use discrete build checks (`npm run build`, `npx tsc --noEmit`).
4. **Clean Code**: Use existing UI components (Tailwind, `@hugeicons/react` icons, Viem/Wagmi) matching the existing frontend aesthetic.
