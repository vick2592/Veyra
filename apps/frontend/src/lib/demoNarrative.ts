/**
 * The Bazantic request queue only carries agentAddress + secretIdentifier — no
 * action, amount, or recipient field (a real schema gap, already flagged for
 * the team). This maps the one scripted demo request to the narrative label
 * used across the confirmation screens; it is a display label, not data read
 * from the request itself. Anything outside the demo falls back to a plain
 * description of the real secret being accessed.
 */
export type ActionNarrative = {
  headline: string;
  detail: string;
  technical: string;
};

const demoNarratives: Record<string, ActionNarrative> = {
  'openai-key': {
    headline: '$100 USDC transfer',
    detail: 'to 0x9F1C...4B2A',
    technical: 'transfer:execute @ usdc-sepolia',
  },
};

export function getActionNarrative(secretIdentifier: string): ActionNarrative {
  return (
    demoNarratives[secretIdentifier] ?? {
      headline: `Access ${secretIdentifier}`,
      detail: '',
      technical: `secret:access @ ${secretIdentifier}`,
    }
  );
}

/**
 * The registry has no agent-naming concept either — only a hex address. Same
 * scripted-label treatment: the demo's own dummy agent address gets the
 * "Market Agent" name used throughout the copy pages, any other address
 * falls back to its truncated hex form.
 */
const demoAgentLabels: Record<string, string> = {
  '0x0000000000000000000000000000000000000001': 'Market Agent',
};

export function getAgentLabel(agentAddress: string): string {
  return demoAgentLabels[agentAddress.toLowerCase()] ?? `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`;
}

/**
 * The demo's one agent + the secret it's scoped to. There is no real
 * "register an agent" mechanism anywhere in the contracts (VeyraRegistry has
 * no such function; CapabilityRegistry only revokes/reinstates) — any
 * address can call the Bazantic API, trust is established per-request via
 * World ID + a wallet signature, not via a pre-approved roster. These
 * constants exist so the Agents page can trigger a real request for this
 * one demo agent, same as /sandbox's "Simulate Agent Request" button.
 */
export const DEMO_AGENT_ADDRESS = '0x0000000000000000000000000000000000000001';
export const DEMO_SECRET_IDENTIFIER = 'openai-key';
