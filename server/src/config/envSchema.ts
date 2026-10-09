import { z } from 'zod';

import { databaseUrlSchema } from './databaseUrl';
import { accessTokenTtlSchema } from './tokenTtl';

/** Minimum length for JWT signing secrets (matches docs/DEPLOYMENT.md). */
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Values copied verbatim from server/.env.example. They are public, so a token
 * signed with them could be forged by anyone. Refuse to start with them.
 */
const PLACEHOLDER_SECRET_PATTERN = /^change-me/i;

export const jwtSecretSchema = (name: string) =>
  z
    .string()
    .min(
      MIN_JWT_SECRET_LENGTH,
      `${name} must be at least ${MIN_JWT_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 48`,
    )
    .refine((value) => !PLACEHOLDER_SECRET_PATTERN.test(value), {
      message: `${name} is still the placeholder value from .env.example. Replace it with a random secret.`,
    });

export const envSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_URL: z
      .string()
      .default('http://localhost:5173,https://school-grading-system-nu.vercel.app'),
    JWT_ACCESS_SECRET: jwtSecretSchema('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: jwtSecretSchema('JWT_REFRESH_SECRET'),
    ACCESS_TOKEN_TTL: accessTokenTtlSchema,
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),
    SCHOOL_NAME: z.string().default('Kigali Secondary School'),
    SCHOOL_MOTTO: z.string().default(''),
    // Optional external notification configuration
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().default('noreply@school-grading-system.local'),
    EMAIL_HOST: z.string().optional(),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASS: z.string().optional(),
    EMAIL_PORT: z.coerce.number().int().positive().optional(),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    WHATSAPP_ENABLED: z.coerce.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Access and refresh tokens must not share a key: a refresh token would then
    // validate as an access token and vice versa.
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET.',
      });
    }
  });
