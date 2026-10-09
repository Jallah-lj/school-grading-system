import assert from 'node:assert/strict';

import { envSchema } from './envSchema';

const STRONG_ACCESS = 'Zk3vQ9pLr7sT2mN8wXy4aB6cD1eF5gH0';
const STRONG_REFRESH = 'Yh8uJ2kP6oL0nM4bV9cX3zA7sD1fG5qW';

/** Minimal valid environment; individual tests override fields. */
const base = {
  DATABASE_URL: 'postgresql://sgs:sgs@localhost:5432/school_grading?schema=public',
  JWT_ACCESS_SECRET: STRONG_ACCESS,
  JWT_REFRESH_SECRET: STRONG_REFRESH,
  ACCESS_TOKEN_TTL: '15m',
};

const parse = (overrides: Record<string, unknown>) =>
  envSchema.safeParse({ ...base, ...overrides });

const messages = (result: ReturnType<typeof parse>) =>
  result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

// A strong, distinct pair of secrets is accepted.
assert.equal(parse({}).success, true);

// Secrets shorter than 32 characters are rejected.
assert.equal(parse({ JWT_ACCESS_SECRET: 'short-secret-1234' }).success, false);
assert.match(
  messages(parse({ JWT_REFRESH_SECRET: 'short-secret-1234' })).join('\n'),
  /at least 32 characters/,
);

// The placeholder values from server/.env.example are rejected, even when long enough.
assert.equal(
  parse({ JWT_ACCESS_SECRET: 'change-me-access-secret-value-padded-out' }).success,
  false,
);
assert.equal(
  parse({ JWT_REFRESH_SECRET: 'change-me-refresh-secret-value-padded-out' }).success,
  false,
);
assert.match(
  messages(parse({ JWT_ACCESS_SECRET: 'change-me-access-secret-value-padded-out' })).join('\n'),
  /placeholder value/,
);

// Access and refresh secrets must differ.
const same = parse({ JWT_REFRESH_SECRET: STRONG_ACCESS });
assert.equal(same.success, false);
assert.match(messages(same).join('\n'), /must differ from JWT_ACCESS_SECRET/);

console.log(' environment schema (JWT secrets): all tests passed');
