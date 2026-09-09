import { z } from 'zod';

export const bazanticRequestSchema = z.object({
  secretIdentifier: z.string().min(1),
  agentAddress: z.string().min(1),
  input: z.unknown().optional(),
  idempotencyKey: z.string().min(1).max(200),
  expiresAt: z.string().datetime().optional(),
});

export type BazanticRequest = z.infer<typeof bazanticRequestSchema>;

export type X402PaymentHeaders = Record<string, string | string[] | undefined>;

export type BazanticPayment = {
  reference: string;
  settledAt: string;
};

export type BazanticSettlement = (
  request: BazanticRequest,
  headers: X402PaymentHeaders,
) => Promise<BazanticPayment | undefined>;

export type BazanticAdapter = {
  parseRequest(input: unknown): BazanticRequest;
  settle(request: BazanticRequest, headers: X402PaymentHeaders): Promise<BazanticPayment | undefined>;
};

export function createBazanticAdapter(settlement: BazanticSettlement): BazanticAdapter {
  return {
    parseRequest(input: unknown): BazanticRequest {
      return bazanticRequestSchema.parse(input);
    },
    settle: settlement,
  };
}