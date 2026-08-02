import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Auto-generated, conflict-proof identifiers.
 *
 * A row in IdSequence per key is atomically incremented inside the caller's
 * transaction — the row lock makes concurrent registrations safe, and the
 * first use bootstraps above any numbers already present in the data.
 */

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function maxTrailingNumber(values: string[], prefix: string): number {
  let max = 0;
  for (const value of values) {
    if (prefix && !value.startsWith(prefix)) continue;
    const tail = value.match(/(\d+)$/)?.[1];
    if (tail) max = Math.max(max, parseInt(tail, 10));
  }
  return max;
}

/** Atomically take the next value of a sequence, creating it from `bootstrap()` on first use. */
async function nextSeq(tx: Tx, key: string, bootstrap: () => Promise<number>): Promise<number> {
  const row = await tx.idSequence.findUnique({ where: { key }, select: { key: true } });
  if (row) {
    const updated = await tx.idSequence.update({
      where: { key },
      data: { next: { increment: 1 } },
      select: { next: true },
    });
    return updated.next;
  }
  // First use: seed above any pre-existing numbers. A concurrent first use
  // raises P2002, which withIdRetry() retries — the row then exists.
  const start = await bootstrap();
  const created = await tx.idSequence.create({
    data: { key, next: start + 1 },
    select: { next: true },
  });
  return created.next;
}

/** e.g. SGS-2026-0013 — keyed per prefix + year so each cohort increments cleanly. */
export async function generateAdmissionNumber(
  tx: Tx,
  prefix: string,
  year: number,
): Promise<string> {
  const key = `student:${prefix}:${year}`;
  const next = await nextSeq(tx, key, async () => {
    const existing = await tx.studentProfile.findMany({
      where: { admissionNumber: { startsWith: `${prefix}-${year}-` } },
      select: { admissionNumber: true },
    });
    return maxTrailingNumber(
      existing.map((s) => s.admissionNumber),
      `${prefix}-${year}-`,
    );
  });
  return `${prefix}-${year}-${pad(next, 4)}`;
}

/** e.g. SGS-STF-004 */
export async function generateStaffNumber(tx: Tx, prefix: string): Promise<string> {
  const key = `staff:${prefix}`;
  const next = await nextSeq(tx, key, async () => {
    const existing = await tx.teacherProfile.findMany({ select: { staffNumber: true } });
    return maxTrailingNumber(
      existing.map((t) => t.staffNumber),
      '',
    );
  });
  return `${prefix}-STF-${pad(next, 3)}`;
}

/** Retry a transaction a few times when a first-use sequence bootstrap races. */
export async function withIdRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      attempts > 1
    ) {
      return withIdRetry(fn, attempts - 1);
    }
    throw err;
  }
}
