/**
 * Client utility function tests.
 *
 * These are pure function tests that don't require a DOM or React.
 * Run:  npx tsx src/__tests__/utils.test.ts
 */
import assert from 'node:assert/strict';

import { gradeBadgeClass, statusBadgeClass, fmtDate, initials, ordinal, timeAgo } from '../lib/utils';

let passed = 0;
let failed = 0;

function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message.split('\n')[0]}`);
  }
}

console.log('\n🧩 Client utility tests\n');

// ── gradeBadgeClass ────────────────────────────────────────────────────────
console.log('── gradeBadgeClass ──');

t('A grades → emerald classes', () => {
  const cls = gradeBadgeClass('A+');
  assert.ok(cls.includes('emerald'), `Expected emerald, got: ${cls}`);
});

t('A grades (plain) → emerald classes', () => {
  assert.ok(gradeBadgeClass('A').includes('emerald'));
});

t('B grades → sky classes', () => {
  assert.ok(gradeBadgeClass('B+').includes('sky'));
  assert.ok(gradeBadgeClass('B').includes('sky'));
});

t('C grade → amber classes', () => {
  assert.ok(gradeBadgeClass('C').includes('amber'));
});

t('F grade → rose classes', () => {
  assert.ok(gradeBadgeClass('F').includes('rose'));
});

// ── statusBadgeClass ───────────────────────────────────────────────────────
console.log('\n── statusBadgeClass ──');

t('DRAFT → slate classes', () => {
  assert.ok(statusBadgeClass('DRAFT').includes('slate'));
});

t('SUBMITTED → amber classes', () => {
  assert.ok(statusBadgeClass('SUBMITTED').includes('amber'));
});

t('APPROVED → blue classes', () => {
  assert.ok(statusBadgeClass('APPROVED').includes('blue'));
});

t('PUBLISHED → emerald classes', () => {
  assert.ok(statusBadgeClass('PUBLISHED').includes('emerald'));
});

t('GENERATED → blue classes', () => {
  assert.ok(statusBadgeClass('GENERATED').includes('blue'));
});

t('Unknown status → slate fallback', () => {
  assert.ok(statusBadgeClass('UNKNOWN').includes('slate'));
});

// ── fmtDate ────────────────────────────────────────────────────────────────
console.log('\n── fmtDate ──');

t('null → dash', () => {
  assert.equal(fmtDate(null), '—');
});

t('undefined → dash', () => {
  assert.equal(fmtDate(undefined), '—');
});

t('ISO string → formatted date', () => {
  const result = fmtDate('2024-06-15T10:30:00Z');
  assert.ok(result.includes('2024'), `Expected year in result: ${result}`);
  assert.ok(result.includes('15') || result.includes('Jun'), `Expected month/day in: ${result}`);
});

// ── ordinal ────────────────────────────────────────────────────────────────
console.log('\n── ordinal ──');

t('null → dash', () => {
  assert.equal(ordinal(null), '—');
});

t('undefined → dash', () => {
  assert.equal(ordinal(undefined), '—');
});

t('1 → 1st', () => {
  assert.equal(ordinal(1), '1st');
});

t('2 → 2nd', () => {
  assert.equal(ordinal(2), '2nd');
});

t('3 → 3rd', () => {
  assert.equal(ordinal(3), '3rd');
});

t('4 → 4th', () => {
  assert.equal(ordinal(4), '4th');
});

t('11 → 11th', () => {
  assert.equal(ordinal(11), '11th');
});

t('12 → 12th', () => {
  assert.equal(ordinal(12), '12th');
});

t('13 → 13th', () => {
  assert.equal(ordinal(13), '13th');
});

t('21 → 21st', () => {
  assert.equal(ordinal(21), '21st');
});

t('22 → 22nd', () => {
  assert.equal(ordinal(22), '22nd');
});

t('100 → 100th', () => {
  assert.equal(ordinal(100), '100th');
});

// ── initials ───────────────────────────────────────────────────────────────
console.log('\n── initials ──');

t('single name → one letter', () => {
  assert.equal(initials('Alice'), 'A');
});

t('two words → two letters', () => {
  assert.equal(initials('Alice Bob'), 'AB');
});

t('three words → first two letters', () => {
  assert.equal(initials('Alice Bob Charlie'), 'AB');
});

t('lowercase names → uppercase initials', () => {
  assert.equal(initials('alice bob'), 'AB');
});

t('empty string → empty', () => {
  assert.equal(initials(''), '');
});

// ── timeAgo ────────────────────────────────────────────────────────────────
console.log('\n── timeAgo ──');

t('null → dash', () => {
  assert.equal(timeAgo(null), '—');
});

t('recent timestamp → "just now"', () => {
  const now = new Date().toISOString();
  assert.equal(timeAgo(now), 'just now');
});

t('5 minutes ago → "5 min ago"', () => {
  const d = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(timeAgo(d), '5 min ago');
});

t('3 hours ago → "3h ago"', () => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  assert.equal(timeAgo(d), '3h ago');
});

t('2 days ago → "2d ago"', () => {
  const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(timeAgo(d), '2d ago');
});

t('60 days ago → formatted date', () => {
  const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const result = timeAgo(d);
  // Should be a formatted date, not "Xd ago"
  assert.ok(!result.includes('d ago') || result.includes('/'), `Expected date format, got: ${result}`);
});

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  Client utils: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('  ✅ All client utility tests passed');
}
