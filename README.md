# Veyra 🔐

> **Secure AI Agent Infrastructure gated by World ID and Ledger Key Ring Protocol.**

Veyra is a headless broker that allows AI agents to securely utilize API keys and secrets without ever holding them in plaintext. By combining Ledger's hardware-backed Key Ring with World ID's Face Auth, Veyra ensures that autonomous agents cannot execute sensitive capabilities without explicit, human-verified authorization.

**🏆 Built for ETHOnline 2026**
* **Ledger Track:** AI Agents x Ledger (Headless Host & Secret Broker)
* **World Track:** SelfieCheck & Face Auth Integration

---

## 📖 The Problem & Solution

**The Problem:** AI agents require API keys to execute tasks, but deploying these secrets to cloud environments, CI runners, or directly to the agent exposes them to severe leakage and Sybil risks. 
**The Solution:** Veyra shifts secret management entirely off the agent. 

1. **Vaulted at Rest:** Secrets are encrypted under a hierarchical leaf key derived from a Ledger Secure Element using the Ledger Key Ring Protocol (LKRP). 
2. **Gated by Liveness:** When an agent needs to act, execution halts until the user completes a World ID Face Auth (Selfie Check) to prove they are physically present, stopping bot-driven attacks.
3. **Headless Decryption:** Upon ZK-proof verification, the Veyra broker headlessly decrypts the keys into memory, executes the task, and instantly scrubs the key from RAM.

---

## 🏗️ Architecture

Veyra operates as a multi-tenant capability broker:

* **Frontend (Next.js):** Uses `@worldcoin/idkit` to trigger a Face Auth verification when an agent requests a capability.
* **Backend (Node.js/Express):** Verifies the World ID ZK-proof against the Developer Portal.
* **The Key Ring (wallet-cli):** Spawns `wallet-cli ring decrypt` as a child process. Because the server is an authorized member of the Key Ring, it decrypts the `secrets.enc` file headlessly over the network—requiring no physical USB connection at runtime.

---

## 🛠️ Prerequisites

* Node.js (v18+)
* A physical **Ledger Device** (for initial vault provisioning only)
* `@ledgerhq/wallet-cli` installed globally (`npm i -g @ledgerhq/wallet-cli`)
* A **World ID Developer Portal** account and App ID

---

## 🚀 Quick Start (Local Admin Setup)

### 1. Provision the Key Ring
Plug in your Ledger device, open the Ledger app, and provision your local machine as an authorized Key Ring member:
```bash
# Provide a custom password to secure the local trustchain
WALLET_PASS="your_secure_password" wallet-cli ring init