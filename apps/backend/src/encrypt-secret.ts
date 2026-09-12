import 'dotenv/config';
import * as fs from 'fs';

const userWalletAddress = '0x685dd8760c40F269A410468E71fD3561149cF5FB';
const openAiKey = process.env.OPENAI_API_KEY;

if (!openAiKey) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}

const userHex = userWalletAddress.slice(-6);
const userIndex = parseInt(userHex, 16);
const bip32Path = `m/44'/60'/0'/0/${userIndex}`;
const tempFile = '.temp-secret.txt';

fs.writeFileSync(tempFile, openAiKey, 'utf8');

console.log(`\n🔐 Deriving Ledger Key Ring for User: ${userWalletAddress}`);
console.log(`🌿 BIP-32 Leaf Path: ${bip32Path}`);
console.log(`\n✅ API Key temporarily saved to ${tempFile}`);
console.log(`\n--- RUN THIS EXACT COMMAND IN YOUR TERMINAL ---`);
console.log(`wallet-cli ring encrypt --key "openai-key" --path "${bip32Path}" --input ${tempFile}`);
console.log(`-----------------------------------------------\n`);