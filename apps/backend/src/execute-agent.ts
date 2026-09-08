import type { Request, Response } from 'express';
import { z } from 'zod';
import type { SecretKeyring } from './keyring.js';
import { WorldIdVerificationError, type WorldIdVerifier } from './world-id.js';

const executeAgentRequestSchema = z.object({
  rp_id: z.string().regex(/^rp_/),
  idkitResponse: z.unknown(),
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
      await verifier(parsed.data.rp_id, parsed.data.idkitResponse);
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
      apiKey = await keyring.decryptSecret('execute-agent');
      const upstreamResponse = await fetchImpl(config.agentApiUrl, {
        headers: { authorization: `Bearer ${apiKey}` },
      });

      if (!upstreamResponse.ok) {
        response.status(502).json({ error: 'Agent provider request failed' });
        return;
      }

      response.status(200).json({
        action: 'execute-agent',
        result: await upstreamResponse.json(),
      });
    } catch {
      response.status(502).json({ error: 'Agent execution failed' });
    } finally {
      apiKey = undefined;
    }
  };
}