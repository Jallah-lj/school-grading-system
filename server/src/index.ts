import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

async function main() {
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(` School Grading System API: http://localhost:${env.PORT}/api`);
    console.log(`   CORS origins: ${env.CLIENT_ORIGINS.join(', ')}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down…`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
