#!/usr/bin/env node
/**
 * Post-build smoke check.
 *
 * Background: the deployed API once returned 404 for POST /api/announcements/broadcast
 * even though the route existed in the repo. The cause was that `npm run build`
 * had been failing for several commits, so the host kept serving an older build.
 * Nothing in the pipeline noticed, because a failed deploy just leaves the
 * previous one running.
 *
 * This script asserts that every router the source mounts actually exists in the
 * compiled output, so an incomplete or stale build fails loudly at CI time.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = join(repoRoot, 'server/src/app.ts');
const distDir = join(repoRoot, 'server/dist');

if (!existsSync(distDir)) {
  console.error(`✗ No compiled output at server/dist — the build did not run or failed.`);
  process.exit(1);
}

const source = readFileSync(appSource, 'utf8');

// Every `app.use('/api/x', ...)` mount in the source.
const mounts = [...source.matchAll(/app\.use\(\s*'(\/api\/[a-z-]+)'/g)].map((m) => m[1]);
if (mounts.length === 0) {
  console.error('✗ Could not parse any route mounts from server/src/app.ts');
  process.exit(1);
}

const compiledApp = join(distDir, 'app.js');
if (!existsSync(compiledApp)) {
  console.error('✗ server/dist/app.js is missing — the build is incomplete.');
  process.exit(1);
}
const compiled = readFileSync(compiledApp, 'utf8');

const missing = mounts.filter((path) => !compiled.includes(`'${path}'`) && !compiled.includes(`"${path}"`));

// Tests must never be emitted into the production bundle.
const leakedTests = readdirSync(distDir, { recursive: true }).filter(
  (f) => typeof f === 'string' && (f.includes('__tests__') || f.endsWith('.test.js')),
);

let failed = false;

if (missing.length > 0) {
  console.error(`✗ Routes present in source but missing from the build: ${missing.join(', ')}`);
  failed = true;
} else {
  console.log(`✓ All ${mounts.length} API route mounts present in the build:`);
  for (const m of mounts) console.log(`    ${m}`);
}

if (leakedTests.length > 0) {
  console.error(`✗ Test files leaked into the production build: ${leakedTests.join(', ')}`);
  failed = true;
} else {
  console.log('✓ No test files in the production build');
}

process.exit(failed ? 1 : 0);
