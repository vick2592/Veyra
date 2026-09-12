# Morning Test Plan — Multi-User Hardware Vault Dashboard

Goal: click through the full `/dashboard` flow — register, encrypt-and-store a
secret under your own hardware key slot, then trigger the agent authorization
pipeline that secret feeds into — without needing a physical Ledger attached.

## 0. One thing to read before you start

**`VEYRA_DEMO_MODE=true` means no real Ledger is touched at all.** Encryption
and decryption both run through a local software vault (HKDF + AES-256-GCM)
instead of `wallet-cli`. This is the intended way to test the full UI and
authorization flow tonight — it proves the per-user decryption *loop* end to
end, not the physical hardware step. Don't go looking for `wallet-cli`
process output in demo mode; you won't see any, and that's correct. (Testing
the real Ledger path is a separate exercise — see the bottom of this file.)

## 1. Environment variables to check

### `apps/backend/.env`

These should already be present from last night's setup — just confirm them,
don't need to invent new values:

| Variable | Required value | Why |
|---|---|---|
| `VEYRA_DEMO_MODE` | `true` | Forces the software vault path (see above). |
| `WALLET_PASS` | any non-empty string | **Easy to miss**: the chain listener only starts at all if `RPC_URL`, `REGISTRY_ADDRESS`, *and* `WALLET_PASS` are all set — even in demo mode, which never actually uses the password. Leave it unset and `AgentAuthorized` events are simply never picked up, silently. |
| `RPC_URL` | `https://sepolia.base.org` | Base Sepolia RPC. |
| `CHAIN_ID` | `84532` | Base Sepolia. |
| `REGISTRY_ADDRESS` | `0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC` | The deployed `VeyraRegistry`. |
| `LISTENER_STARTING_BLOCK` | **leave unset/commented out** | Last night's fix makes this dynamic (`latest - 10` on boot). If it's still set to an old block number, remove it or every restart re-scans a growing, eventually-too-large block range. |
| `WORLD_ID_APP_ID` / `WORLD_ID_RP_ID` / `WORLD_ID_SIGNING_KEY` | already configured | Needed for the `/api/world-id/sign` route the dashboard's "Test your agent" card calls. Don't need to change these. |
| `OPENAI_API_KEY` | not used by the new per-user path | This var only feeds the *old* shared-operator-key flow. The dashboard's own execution test uses whatever you type into the "Secret value" field instead — see step 3 below. |

### `apps/frontend/.env.local`

Should already be correct (same values `/sandbox` already uses successfully):

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_REGISTRY_ADDRESS=0x8b0da63371eDaADd199C7654d9FaABb448Ab23BC
NEXT_PUBLIC_WORLD_ID_APP_ID=app_30cf964190e1900108f1a3abb75d39c0
NEXT_PUBLIC_WORLD_ID_RP_ID=rp_d6e5910c7610a8dc
```

### Your wallet

- MetaMask (or equivalent) network set to **Base Sepolia** (Chain ID `84532`).
- Some Base Sepolia testnet ETH in the connected wallet, for `registerUser` /
  `storeSecret` / `authorizeAgent` gas. Use a faucet if you're at zero.

## 2. Boot commands

Two terminals, both from the repo root:

```bash
# Terminal 1 — backend
cd apps/backend
npm install   # only if you haven't already
npm run dev
```

Confirm you see `Veyra backend listening on port 3001` and (assuming
`LISTENER_STARTING_BLOCK` is unset) a line like
`LISTENER_STARTING_BLOCK not set — starting dynamically from latest - 10`.
If you don't see that second line, the listener didn't start — go back to
the `WALLET_PASS` row above.

```bash
# Terminal 2 — frontend
cd apps/frontend
npm install   # only if you haven't already
npm run dev
```

Confirm `http://localhost:3000` is up.

## 3. UI flow to click through

1. Open **`http://localhost:3000/dashboard`**.
2. **Connect Wallet** — use the sidebar/reconnect prompt. Once connected you
   should see the Identity card: your address, "Base Sepolia", and a
   `veyra-user-<leafIndex>` hardware slot badge marked "Ledger Hardware
   Protected".
3. **Provision a secret** (the "Add hardware-encrypted secret" card):
   - Label: leave as `openai-key` (or pick your own — any label works).
   - Secret value: **use a real OpenAI API key here if you want the final
     execution step to fully succeed** (even a low-quota trial key is fine).
     A fake value still proves the whole encrypt/store/decrypt loop works —
     the very last hop (the actual call to OpenAI) will just come back
     `401 Unauthorized` instead of `200`, which is a legitimate pass for
     everything except live-provider connectivity. Either way is a valid
     test; just know which one you're doing.
   - Click **Encrypt & Register Secret**. Watch the status ladder: encrypting
     → awaiting wallet approval → confirming on Base Sepolia → confirmed
     (with a Basescan link). You may get an extra MetaMask prompt the first
     time — that's the one-time `registerUser` call, expected.
4. **Approve MetaMask** for whichever prompts appear (registration, then
   storeSecret). Two prompts on your very first secret, one thereafter.
5. **Trigger the agent** (the "Test your agent" card):
   - Click **Simulate agent request**.
   - Click **Confirm with World ID** when the confirmation panel appears, and
     complete Face Auth via the QR code / World ID Simulator link (same flow
     `/sandbox` already uses).
   - Click **Confirm in wallet** to submit the on-chain authorization.
6. **Verify decryption in the backend terminal.** After the authorization
   transaction confirms, watch Terminal 1 for, in order:
   ```
   [keyring] decrypting user secret via demo/software vault (no Ledger involved) { leafIndex: <number> }
   Processed AgentAuthorized event { requestId: '...', transactionHash: '0x...', logIndex: 0 }
   ```
   The `leafIndex` in that first line should match the number in your
   dashboard's hardware slot badge from step 2 — that's the proof it decrypted
   *your* secret specifically, not a shared one.
   - If you used a real OpenAI key: the dashboard's card shows "Capability
     completed" with a JSON result.
   - If you used a fake value: you'll instead see
     `AgentAuthorized processing failed` in the terminal and the dashboard
     shows a failure — expected, and still proves the decryption step ran
     (it got as far as calling OpenAI and got rejected, not a crash).
7. **Trust chain visualizer** at the bottom of the page should now show all
   five steps lit up: User Wallet → BIP-32 Hardware Slot → On-Chain
   Ciphertext → World ID Authorization → Target Agent Execution.

## Optional: testing the real physical Ledger instead

Not required for tomorrow's UI pass, but if someone wants to exercise real
hardware: set `VEYRA_DEMO_MODE=false` *and* remove/change `NODE_ENV=development`
in `apps/backend/.env` (the two conditions are OR'd — `NODE_ENV=development`
alone forces demo mode regardless of `VEYRA_DEMO_MODE`), have a Ledger
running `wallet-cli ring init` on that machine, and expect the terminal line
in step 6 to instead read `via Ledger Key Ring` with a device confirmation
prompt on the physical device during both encrypt and decrypt.
