import 'dotenv/config';
import { z } from 'zod';

import { databaseUrlSchema } from './databaseUrl';
import { accessTokenTtlSchema } from './tokenTtl';

const envSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z
    .string()
    .default('http://localhost:5173,https://school-grading-system-nu.vercel.app'),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(' Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CLIENT_ORIGINS: parsed.data.CLIENT_URL.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
