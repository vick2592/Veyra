// Toolchain preflight: proves the installed prerequisites actually work.
// Run `pnpm test` on a fresh clone to verify your machine is set up.

import { generateKeyPairSync, sign, verify } from 'node:crypto';
import Fastify from 'fastify';
import { z } from 'zod';
import { Client } from 'pg';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

// Ed25519 — the capability-token signing primitive (item 18)
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const msg = Buffer.from('veyra-capability');
const sig = sign(null, msg, privateKey);
export const ed25519Ok: boolean = verify(null, msg, publicKey, sig);

// deps resolve and typecheck
export const schemaOk: boolean = z.object({ jti: z.string() }).safeParse({ jti: 'x' }).success;
export const fastifyOk: boolean = typeof Fastify === 'function';
export const pgOk: boolean = typeof Client === 'function';
export const viemOk: boolean =
  typeof createPublicClient === 'function' &&
  typeof http === 'function' &&
  parseAbi(['event Ping(address indexed who, uint256 n)']).length === 1 &&
  baseSepolia.id === 84532;
