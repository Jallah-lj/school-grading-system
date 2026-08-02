/**
 * Automatic grading engine.
 *
 * Everything downstream (totals, percentages, letter grades, grade points,
 * GPA, CGPA, positions) is computed here — never manually.
 */

export interface GradeBand {
  minScore: number;
  maxScore: number;
  letter: string;
  gradePoint: number;
  remark: string;
}

export interface WeightedScore {
  /** Component weight (all weights should sum to 100 for a full subject). */
  weight: number;
  /** Maximum achievable raw score for the component. */
  maxScore: number;
  /** Score actually obtained (0 when the mark is missing). */
  score: number;
}

export interface GradedSubjectResult {
  totalScore: number; // normalised to /100
  percentage: number; // 0–100, 2dp
  letterGrade: string;
  gradePoint: number;
  remark: string;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Weighted percentage across assessment components.
 * percentage = Σ(weight × score / maxScore) / Σ(weight) × 100
 */
export function computeWeightedPercentage(scores: WeightedScore[]): number {
  const totalWeight = scores.reduce((acc, s) => acc + s.weight, 0);
  if (totalWeight <= 0) return 0;
  const earned = scores.reduce((acc, s) => {
    const max = s.maxScore > 0 ? s.maxScore : 100;
    const clamped = Math.min(Math.max(s.score, 0), max);
    return acc + (s.weight * clamped) / max;
  }, 0);
  return round2((earned / totalWeight) * 100);
}

/**
 * Look up the letter grade for a percentage. Bands are matched on
 * `percentage >= minScore`, scanning from the highest band down, which makes
 * the scale robust to fractional gaps between declared min/max ranges.
 */
export function gradeFor(percentage: number, bands: GradeBand[]): GradeBand | undefined {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((b) => percentage >= b.minScore && percentage <= Math.max(b.maxScore, 100));
}

/** Full computation for one subject: weighted % → letter grade + points. */
export function computeSubjectResult(
  scores: WeightedScore[],
  bands: GradeBand[],
): GradedSubjectResult {
  const percentage = computeWeightedPercentage(scores);
  const band = gradeFor(percentage, bands);
  return {
    totalScore: percentage,
    percentage,
    letterGrade: band?.letter ?? 'N/A',
    gradePoint: band?.gradePoint ?? 0,
    remark: band?.remark ?? 'Not graded',
  };
}

/**
 * Credit-weighted GPA:  GPA = Σ(gradePoint × creditUnits) / Σ(creditUnits)
 */
export function computeGpa(results: { gradePoint: number; creditUnits: number }[]): number {
  const credits = results.reduce((acc, r) => acc + r.creditUnits, 0);
  if (credits <= 0) return 0;
  const points = results.reduce((acc, r) => acc + r.gradePoint * r.creditUnits, 0);
  return round2(points / credits);
}

/** CGPA across several terms: weight each term by its credit load. */
export function computeCgpa(terms: { totalPoints: number; totalCredits: number }[]): number {
  const credits = terms.reduce((acc, t) => acc + t.totalCredits, 0);
  if (credits <= 0) return 0;
  const points = terms.reduce((acc, t) => acc + t.totalPoints, 0);
  return round2(points / credits);
}

/**
 * Standard competition ranking ("1224"): equal values share a position and the
 * following position skips accordingly. Input is an id → value map.
 */
export function rankIds<T extends { id: string; value: number }>(rows: T[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const positions = new Map<string, number>();
  sorted.forEach((row, index) => {
    const prev = sorted[index - 1];
    positions.set(
      row.id,
      prev && prev.value === row.value ? (positions.get(prev.id) as number) : index + 1,
    );
  });
  return positions;
}
