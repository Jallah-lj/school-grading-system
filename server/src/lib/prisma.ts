import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Reuse a single client across dev hot-reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
    // Remote poolers can need more than Prisma's 2s/5s interactive defaults.
    // Grade bulk writes use batch transactions, but these limits protect the
    // remaining short administrative transactions from transient contention.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
