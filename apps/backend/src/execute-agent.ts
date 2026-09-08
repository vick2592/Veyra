import type { Request, Response } from 'express';
import { z } from 'zod';
import type { SecretKeyring } from './keyring.js';
import { WorldIdVerificationError, type WorldIdVerifier } from './world-id.js';

const executeAgentRequestSchema = z.object({
  action: z.literal('execute-agent'),
  proof: z.string().min(1),
  merkle_root: z.string().min(1),
  nullifier_hash: z.string().min(1),
  verification_level: z.string().min(1),
});

export type AgentExecutorConfig = {
  agentApiUrl: string;
};

type FetchLike = typeof fetch;

export function createExecuteAgentHandler(
  verifier: WorldIdVerifier,
  keyring: SecretKeyring,
  config: AgentExecutorConfig,
  fetchImpl: FetchLike = fetch,
) {
  return async (request: Request, response: Response): Promise<void> => {
    const parsed = executeAgentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'action and proof are required' });
      return;
    }

    try {
      await verifier({
        proof: parsed.data.proof,
        merkle_root: parsed.data.merkle_root,
        nullifier_hash: parsed.data.nullifier_hash,
        verification_level: parsed.data.verification_level,
      });
    } catch (error) {
      if (error instanceof WorldIdVerificationError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }
      response.status(502).json({ error: 'World ID verification failed' });
      return;
    }

    let apiKey: string | undefined;
    try {
      apiKey = await keyring.decryptSecret(parsed.data.action);
      const upstreamResponse = await fetchImpl(config.agentApiUrl, {
        headers: { authorization: `Bearer ${apiKey}` },
      });

      if (!upstreamResponse.ok) {
        response.status(502).json({ error: 'Agent provider request failed' });
        return;
      }

      response.status(200).json({
        action: parsed.data.action,
        result: await upstreamResponse.json(),
      });
    } catch {
      response.status(502).json({ error: 'Agent execution failed' });
    } finally {
      apiKey = undefined;
    }
  };
}