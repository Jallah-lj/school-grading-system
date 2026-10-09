import 'dotenv/config';

import { envSchema } from './envSchema';

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
