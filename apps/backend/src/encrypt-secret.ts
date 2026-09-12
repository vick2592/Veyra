import 'dotenv/config';
import * as fs from 'fs';
import { leafIndexFromAddress } from './secrets.js';

const userWalletAddress = '0x685dd8760c40F269A410468E71fD3561149cF5FB';
const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

// Must match secrets.ts's leafIndexFromAddress (keccak256(address) % 2^31) —
// the same formula the frontend's registerUser call commits on-chain via
// deriveLeafIndex. The previous parseInt(last-6-hex-chars) derivation here
// landed on a different leaf entirely, so this secret would have been
// encrypted under a key nobody's on-chain registration actually points at.
const leafIndex = leafIndexFromAddress(userWalletAddress);
const bip32Path = `m/44'/60'/0'/0/${leafIndex}`;
const keyName = `veyra-user-${leafIndex}`;
const tempFile = '.temp-secret.txt';

fs.writeFileSync(tempFile, openAiKey, 'utf8');

console.log(`\n🔐 Deriving Ledger Key Ring for User: ${userWalletAddress}`);
console.log(`🌿 BIP-32 Leaf Path: ${bip32Path} (display only — the real LKRP CLI has no --path flag, the key is scoped by --key)`);
console.log(`\n✅ API Key temporarily saved to ${tempFile}`);
console.log(`\n--- RUN THIS EXACT COMMAND IN YOUR TERMINAL ---`);
console.log(`wallet-cli ring encrypt --key "${keyName}" --input ${tempFile}`);
console.log(`-----------------------------------------------\n`);