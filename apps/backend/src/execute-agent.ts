import type { Request, Response } from 'express';
import { z } from 'zod';
import type { SecretKeyring } from './keyring.js';
import { WorldIdVerificationError, type WorldIdVerifier } from './world-id.js';

const executeAgentRequestSchema = z.object({
  rp_id: z.string().regex(/^rp_/),
  secretIdentifier: z.string().min(1),
  idkitResponse: z.unknown(),
});

export type AgentExecutorConfig = {
  agentApiUrl: string;
};

type FetchLike = typeof fetch;

export async function executeAgentWithSecret(
  secretIdentifier: string,
  keyring: SecretKeyring,
  config: AgentExecutorConfig,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  if (secretIdentifier.length === 0) {
    throw new Error('A secret identifier is required');
  }

  let apiKey: string | undefined;
  try {
    apiKey = await keyring.decryptSecret('execute-agent');
    const upstreamResponse = await fetchImpl(config.agentApiUrl, {
      headers: { authorization: `Bearer ${apiKey}` },
    });

    if (!upstreamResponse.ok) {
      throw new Error('Agent provider request failed');
    }

    return await upstreamResponse.json();
  } finally {
    apiKey = undefined;
  }
}

export function createExecuteAgentHandler(
  verifier: WorldIdVerifier,
  keyring: SecretKeyring,
  config: AgentExecutorConfig,
  fetchImpl: FetchLike = fetch,
) {
  return async (request: Request, response: Response): Promise<void> => {
    const parsed = executeAgentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'secret identifier and proof are required' });
      return;
    }

    try {
      await verifier(parsed.data.rp_id, parsed.data.idkitResponse, parsed.data.secretIdentifier);
    } catch (error) {
      if (error instanceof WorldIdVerificationError) {
        response.status(error.statusCode).json({ error: error.message });
        return;
      }
      response.status(502).json({ error: 'World ID verification failed' });
      return;
    }

    try {
      response.status(200).json({
        action: parsed.data.secretIdentifier,
        result: await executeAgentWithSecret(parsed.data.secretIdentifier, keyring, config, fetchImpl),
      });
    } catch {
      response.status(502).json({ error: 'Agent execution failed' });
    }
  };
}