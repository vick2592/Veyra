import type { Request, Response as ExpressResponse } from 'express';
import { signRequest } from '@worldcoin/idkit-core/signing';
import { z } from 'zod';


const idKitResponseSchema = z.object({
  protocol_version: z.enum(['3.0', '4.0']),
  nonce: z.string().min(1),
  action: z.string().min(1).optional(),
  responses: z.array(z.object({
    nullifier: z.string().min(1).optional(),
    session_nullifier: z.array(z.string().min(1)).optional(),
  }).passthrough()).min(1),
}).passthrough();

const signRequestSchema = z.object({
  action: z.string().min(1),
});

const verifyResponseSchema = z.object({
  success: z.literal(true),
}).passthrough();

export type WorldIdConfig = {
  appId: string;
  rpId: string;
  signingKey: string;
  apiBaseUrl?: string;
};

export type WorldIdVerifier = (
  rpId: string,
  idKitResponse: unknown,
  expectedAction: string,
) => Promise<WorldIdVerificationResult>;

export type WorldIdVerificationResult = {
  nullifier: string;
};

export class WorldIdVerificationError extends Error {
  public readonly statusCode: 400 | 502;

  public constructor(message: string, statusCode: 400 | 502) {
    super(message);
    this.name = 'WorldIdVerificationError';
    this.statusCode = statusCode;
  }
}

 type FetchLike = typeof fetch;

export function createWorldIdSignHandler(config: WorldIdConfig) {
  return (request: Request, response: ExpressResponse): void => {
    const parsed = signRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'The requested action is not allowed' });
      return;
    }

    try {
      const signature = signRequest({
        signingKeyHex: config.signingKey,
        action: parsed.data.action,
      });

      response.json({
        rp_id: config.rpId,
        nonce: signature.nonce,
        created_at: signature.createdAt,
        expires_at: signature.expiresAt,
        signature: signature.sig,
      });
    } catch {
      response.status(500).json({ error: 'World ID request signing failed' });
    }
  };
}

export function createWorldIdVerifier(
  config: WorldIdConfig,
  fetchImpl: FetchLike = fetch,
): WorldIdVerifier {
  const apiBaseUrl = config.apiBaseUrl ?? 'https://developer.world.org';

  return async (rpId, input, expectedAction): Promise<WorldIdVerificationResult> => {
    if (rpId !== config.rpId) {
      throw new WorldIdVerificationError('World ID RP ID mismatch', 400);
    }

    const idKitResponse = idKitResponseSchema.safeParse(input);
    if (!idKitResponse.success) {
      throw new WorldIdVerificationError('A complete IDKit response is required', 400);
    }

    if (idKitResponse.data.action !== expectedAction) {
      throw new WorldIdVerificationError('World ID action mismatch', 400);
    }

    const nullifier = extractNullifier(idKitResponse.data.responses);
    if (nullifier === undefined) {
      throw new WorldIdVerificationError('World ID response has no nullifier', 400);
    }

    let portalResponse: globalThis.Response;
    try {
      portalResponse = await fetchImpl(
        `${apiBaseUrl}/api/v4/verify/${encodeURIComponent(config.rpId)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
    } catch {
      throw new WorldIdVerificationError('World ID verification is unavailable', 502);
    }

    let rawBody: string;
    try {
      rawBody = await portalResponse.text();
    } catch {
      throw new WorldIdVerificationError('World ID verification response could not be read', 502);
    }

    console.error('World ID verification response', {
      status: portalResponse.status,
      statusText: portalResponse.statusText,
      body: rawBody,
    });

    if (!portalResponse.ok) {
      throw new WorldIdVerificationError('World ID proof verification failed', 400);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      throw new WorldIdVerificationError('World ID returned an invalid verification response', 502);
    }

    const verification = verifyResponseSchema.safeParse(parsedBody);
    if (!verification.success) {
      throw new WorldIdVerificationError('World ID returned an invalid verification response', 502);
    }

    return { nullifier };
  };
}

function extractNullifier(
  responses: Array<{
    nullifier?: string | undefined;
    session_nullifier?: string[] | undefined;
  }>,
): string | undefined {
  for (const response of responses) {
    if (response.nullifier !== undefined) {
      return response.nullifier;
    }
    if (response.session_nullifier?.[0] !== undefined) {
      return response.session_nullifier[0];
    }
  }
  return undefined;
}

export function getWorldIdConfig(config: {
  worldIdAppId?: string;
  worldIdRpId?: string;
  worldIdSigningKey?: string;
  worldIdApiBaseUrl?: string;
}): WorldIdConfig {
  const parsed = z.object({
    worldIdAppId: z.string().regex(/^app_/),
    worldIdRpId: z.string().regex(/^rp_/),
    worldIdSigningKey: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
    worldIdApiBaseUrl: z.string().url().default('https://developer.world.org'),
  }).safeParse(config);

  if (!parsed.success) {
    throw new Error('WORLD_ID_APP_ID, WORLD_ID_RP_ID, and WORLD_ID_SIGNING_KEY must be configured');
  }

  return {
    appId: parsed.data.worldIdAppId,
    rpId: parsed.data.worldIdRpId,
    signingKey: parsed.data.worldIdSigningKey,
    apiBaseUrl: parsed.data.worldIdApiBaseUrl,
  };
}
