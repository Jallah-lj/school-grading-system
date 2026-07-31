import { z } from 'zod';

const TIMESPAN_PATTERN = /^\d+(?:\.\d+)?(?:ms|s|m|h|d|w|y)$/i;

function normalizeTimespan(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const unquoted = trimmed.length >= 2
    && (first === '"' || first === "'")
    && first === last
    ? trimmed.slice(1, -1).trim()
    : trimmed;

  return unquoted.toLowerCase();
}

export const accessTokenTtlSchema = z.preprocess(
  normalizeTimespan,
  z.string()
    .default('15m')
    .refine(
      (value) => TIMESPAN_PATTERN.test(value),
      'ACCESS_TOKEN_TTL must be a timespan such as 15m, 1h, or 7d (do not use ACCESS_TOKEN_TTL= or surrounding quotes)',
    ),
);

export function parseAccessTokenTtl(value: unknown): string {
  return accessTokenTtlSchema.parse(value);
}
