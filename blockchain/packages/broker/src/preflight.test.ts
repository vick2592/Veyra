import { expect, test } from 'vitest';
import { ed25519Ok, schemaOk, fastifyOk, pgOk, viemOk } from './preflight.js';

test('ed25519 sign/verify works in node crypto', () => expect(ed25519Ok).toBe(true));
test('zod resolves', () => expect(schemaOk).toBe(true));
test('fastify resolves', () => expect(fastifyOk).toBe(true));
test('pg resolves', () => expect(pgOk).toBe(true));
test('viem resolves and knows base sepolia', () => expect(viemOk).toBe(true));
