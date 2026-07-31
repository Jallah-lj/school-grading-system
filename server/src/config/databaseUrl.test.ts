import assert from 'node:assert/strict';
import { parseDatabaseUrl } from './databaseUrl';

const url = 'postgresql://user:password@example.com:5432/school';

assert.equal(parseDatabaseUrl(url), url);
assert.equal(parseDatabaseUrl(`  "${url}"  `), url);
assert.equal(parseDatabaseUrl(`'${url}'`), url);
assert.equal(
  parseDatabaseUrl('postgres://user:password@example.com:5432/school'),
  'postgres://user:password@example.com:5432/school',
);

assert.throws(() => parseDatabaseUrl(''), /DATABASE_URL is required/);
assert.throws(() => parseDatabaseUrl('DATABASE_URL=postgresql://example.com/school'), /connection URI itself/);
assert.throws(() => parseDatabaseUrl('${{Postgres.DATABASE_URL}}'), /connection URI itself/);
assert.throws(() => parseDatabaseUrl('<supabase-uri>'), /connection URI itself/);
assert.throws(
  () => parseDatabaseUrl(`${url}?pgbouncer=true&connection_limit=1`),
  /connection_limit is too low/,
);
assert.equal(
  parseDatabaseUrl(`${url}?connection_limit=5&pool_timeout=30`),
  `${url}?connection_limit=5&pool_timeout=30`,
);

console.log(' database URL configuration: all tests passed');
