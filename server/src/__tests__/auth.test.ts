/**
 * Auth middleware unit tests.
 *
 * Tests the authenticate / authorize middleware in isolation using
 * mock Request/Response objects — no HTTP server required.
 *
 * Run via:  npx tsx src/__tests__/run-tests.ts
 */
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { authenticate, authorize } from '../middleware/auth';

import type { NextFunction, Request, Response } from 'express';

// ── Mock helpers ─────────────────────────────────────────────────────────────
function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function mockRes(): Response & { _status?: number; _json?: unknown } {
  const res: Record<string, unknown> = {
    _status: 200,
    _json: null,
    status(code: number) { res._status = code; return res; },
    json(body: unknown) { res._json = body; return res; },
  };
  return res as unknown as Response & { _status?: number; _json?: unknown };
}

let nextCalled = false;
let nextError: unknown = null;
function mockNext(): NextFunction {
  nextCalled = false;
  nextError = null;
  return ((err?: unknown) => {
    nextCalled = true;
    nextError = err ?? null;
  }) as NextFunction;
}

// ── Token helpers ────────────────────────────────────────────────────────────
const SECRET = process.env.JWT_ACCESS_SECRET!;
function makeToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, SECRET, { expiresIn: '15m' });
}

// ── Tests ────────────────────────────────────────────────────────────────────
export async function runAuthTests() {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  async function t(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      failures.push(name);
      console.log(`  ✗ ${name}`);
      console.log(`    ${(e as Error).message.split('\n')[0]}`);
    }
  }

  console.log('🔐 Auth middleware tests\n');

  // ── authenticate ─────────────────────────────────────────────────────────
  console.log('── authenticate() ──');

  await t('rejects request with no Authorization header', () => {
    const next = mockNext();
    authenticate(mockReq(), mockRes() as Response, next);
    assert.ok(nextCalled, 'next() should be called');
    assert.ok(nextError, 'next() should receive an error');
    assert.equal((nextError as { statusCode: number }).statusCode, 401);
  });

  await t('rejects request with non-Bearer authorization', () => {
    const next = mockNext();
    authenticate(mockReq({ headers: { authorization: 'Basic abc123' } }), mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 401);
  });

  await t('rejects request with invalid JWT token', () => {
    const next = mockNext();
    authenticate(mockReq({ headers: { authorization: 'Bearer not-a-jwt' } }), mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 401);
  });

  await t('rejects request with JWT signed by wrong secret', () => {
    const next = mockNext();
    const badToken = jwt.sign({ sub: 'u1', email: 'a@b.c', name: 'X', role: 'ADMIN' }, 'wrong-secret-key-32chars!!!!!!', { expiresIn: '15m' });
    authenticate(mockReq({ headers: { authorization: `Bearer ${badToken}` } }), mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 401);
  });

  await t('accepts valid JWT and attaches user to request', () => {
    const next = mockNext();
    const token = makeToken({ sub: 'user-123', email: 'test@x.com', name: 'Test', role: 'ADMIN' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    authenticate(req, mockRes() as Response, next);
    assert.ok(nextCalled, 'next() should be called');
    assert.equal(nextError, null, 'next() should not receive an error');
    assert.equal(req.user?.id, 'user-123');
    assert.equal(req.user?.email, 'test@x.com');
    assert.equal(req.user?.role, 'ADMIN');
  });

  await t('rejects expired JWT', () => {
    const next = mockNext();
    const token = jwt.sign({ sub: 'u1', email: 'a@b.c', name: 'X', role: 'ADMIN' }, SECRET, { expiresIn: '0s' });
    // Small delay to ensure token is expired
    authenticate(mockReq({ headers: { authorization: `Bearer ${token}` } }), mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 401);
  });

  // ── authorize ────────────────────────────────────────────────────────────
  console.log('\n── authorize() ──');

  await t('returns 401 when no user is attached', () => {
    const next = mockNext();
    const req = mockReq();
    authorize('ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 401);
  });

  await t('returns 403 when user role is not authorized', () => {
    const next = mockNext();
    const req = mockReq({ user: { id: 'u1', email: 'a@b.c', name: 'X', role: 'STUDENT' } } as Partial<Request>);
    authorize('ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 403);
  });

  await t('allows ADMIN through authorize(ADMIN)', () => {
    const next = mockNext();
    const req = mockReq({ user: { id: 'u1', email: 'a@b.c', name: 'X', role: 'ADMIN' } } as Partial<Request>);
    authorize('ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.equal(nextError, null);
  });

  await t('allows TEACHER through authorize(TEACHER, ADMIN)', () => {
    const next = mockNext();
    const req = mockReq({ user: { id: 'u1', email: 'a@b.c', name: 'X', role: 'TEACHER' } } as Partial<Request>);
    authorize('TEACHER' as never, 'ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.equal(nextError, null);
  });

  await t('allows ADMIN through authorize(TEACHER, ADMIN)', () => {
    const next = mockNext();
    const req = mockReq({ user: { id: 'u1', email: 'a@b.c', name: 'X', role: 'ADMIN' } } as Partial<Request>);
    authorize('TEACHER' as never, 'ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.equal(nextError, null);
  });

  await t('rejects STUDENT from authorize(TEACHER, ADMIN)', () => {
    const next = mockNext();
    const req = mockReq({ user: { id: 'u1', email: 'a@b.c', name: 'X', role: 'STUDENT' } } as Partial<Request>);
    authorize('TEACHER' as never, 'ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 403);
  });

  await t('rejects PARENT from authorize(TEACHER, ADMIN)', () => {
    const next = mockNext();
    const req = mockReq({ user: { id: 'u1', email: 'a@b.c', name: 'X', role: 'PARENT' } } as Partial<Request>);
    authorize('TEACHER' as never, 'ADMIN' as never)(req, mockRes() as Response, next);
    assert.ok(nextCalled);
    assert.ok(nextError);
    assert.equal((nextError as { statusCode: number }).statusCode, 403);
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Auth tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    for (const f of failures) console.log(`    ✗ ${f}`);
    throw new Error(`${failed} auth test(s) failed`);
  }
  console.log('  ✅ All auth tests passed');
}
