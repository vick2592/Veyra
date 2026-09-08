import { z } from 'zod';

const worldIdProofSchema = z.object({
  proof: z.string().min(1),
  merkle_root: z.string().min(1),
  nullifier_hash: z.string().min(1),
  verification_level: z.literal('orb'),
});

const worldIdVerificationResponseSchema = z.object({
  success: z.literal(true),
  nullifier_hash: z.string().min(1).optional(),
  verification_level: z.literal('orb').optional(),
});

export type WorldIdProof = z.infer<typeof worldIdProofSchema>;

export type WorldIdConfig = {
  appId: string;
  action: string;
  apiBaseUrl?: string;
};

export type WorldIdVerifier = (
  proof: unknown,
) => Promise<WorldIdVerificationResult>;

export type WorldIdVerificationResult = {
  nullifierHash: string;
  verificationLevel: 'orb';
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

export function createWorldIdVerifier(
  config: WorldIdConfig,
  fetchImpl: FetchLike = fetch,
): WorldIdVerifier {
  const apiBaseUrl = config.apiBaseUrl ?? 'https://developer.worldcoin.org';

  return async (input): Promise<WorldIdVerificationResult> => {
    const proof = worldIdProofSchema.safeParse(input);
    if (!proof.success) {
      throw new WorldIdVerificationError('A valid orb World ID proof is required', 400);
    }

    const response = await fetchImpl(
      `${apiBaseUrl}/api/v2/verify/${encodeURIComponent(config.appId)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: config.action,
          ...proof.data,
        }),
      },
    );

    if (!response.ok) {
      throw new WorldIdVerificationError('World ID proof verification failed', 400);
    }

    const verification = worldIdVerificationResponseSchema.safeParse(
      await response.json(),
    );
    if (!verification.success) {
      throw new WorldIdVerificationError('World ID returned an invalid verification response', 502);
    }

    if (
      verification.data.nullifier_hash !== undefined &&
      verification.data.nullifier_hash !== proof.data.nullifier_hash
    ) {
      throw new WorldIdVerificationError('World ID nullifier mismatch', 400);
    }

    return {
      nullifierHash: proof.data.nullifier_hash,
      verificationLevel: 'orb',
    };
  };
}

export function getWorldIdConfig(config: {
  worldAppId?: string;
  worldAction?: string;
}): WorldIdConfig {
  const parsed = z
    .object({
      worldAppId: z.string().regex(/^app_/),
      worldAction: z.string().min(1),
    })
    .safeParse(config);

  if (!parsed.success) {
    throw new Error('WORLD_APP_ID and WORLD_ACTION must be configured');
  }

  return {
    appId: parsed.data.worldAppId,
    action: parsed.data.worldAction,
  };
}