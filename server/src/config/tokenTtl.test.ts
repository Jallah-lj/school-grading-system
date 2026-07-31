import assert from 'node:assert/strict';
import { parseAccessTokenTtl } from './tokenTtl';

assert.equal(parseAccessTokenTtl(undefined), '15m');
assert.equal(parseAccessTokenTtl('15m'), '15m');
assert.equal(parseAccessTokenTtl('  "1H"  '), '1h');
assert.equal(parseAccessTokenTtl("'30s'"), '30s');
assert.equal(parseAccessTokenTtl('1.5d'), '1.5d');

assert.throws(() => parseAccessTokenTtl(''), /must be a timespan/);
assert.throws(() => parseAccessTokenTtl('15'), /must be a timespan/);
assert.throws(() => parseAccessTokenTtl('ACCESS_TOKEN_TTL=15m'), /must be a timespan/);
assert.throws(() => parseAccessTokenTtl('fifteen minutes'), /must be a timespan/);

console.log(' access-token TTL configuration: all tests passed');
