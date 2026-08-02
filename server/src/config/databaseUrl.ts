import { z } from 'zod';

const POSTGRES_PROTOCOLS = ['postgresql://', 'postgres://'] as const;

/**
 * Hosting dashboards treat quotes as literal characters, unlike a local .env
 * file. Accept one matching pair so a URI copied as "postgresql://..." still
 * works, while leaving every other character (including the password) intact.
 */
function removeWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if (trimmed.length >= 2 && (first === '"' || first === "'") && first === last) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export const databaseUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' ? removeWrappingQuotes(value) : value),
  z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (value) => POSTGRES_PROTOCOLS.some((protocol) => value.startsWith(protocol)),
      'DATABASE_URL must be the connection URI itself and begin with postgresql:// or postgres:// (do not use DATABASE_URL=, a placeholder, or an unresolved variable reference)',
    )
    .refine((value) => {
      const configuredLimit = value.match(/[?&]connection_limit=(\d+)(?:&|$)/)?.[1];
      return configuredLimit === undefined || Number(configuredLimit) >= 2;
    }, 'DATABASE_URL connection_limit is too low for this API; use connection_limit=5 or greater'),
);

export function parseDatabaseUrl(value: unknown): string {
  return databaseUrlSchema.parse(value);
}
