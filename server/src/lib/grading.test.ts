/* Self-contained engine tests:  npx tsx src/lib/grading.test.ts */
import assert from 'node:assert/strict';
import {
  computeCgpa,
  computeGpa,
  computeSubjectResult,
  computeWeightedPercentage,
  gradeFor,
  rankIds,
  type GradeBand,
} from './grading';

// Reference scale from the specification
const scale: GradeBand[] = [
  { minScore: 90, maxScore: 100, letter: 'A+', gradePoint: 4.0, remark: 'Excellent' },
  { minScore: 80, maxScore: 89.99, letter: 'A', gradePoint: 3.7, remark: 'Very Good' },
  { minScore: 70, maxScore: 79.99, letter: 'B+', gradePoint: 3.3, remark: 'Good' },
  { minScore: 60, maxScore: 69.99, letter: 'B', gradePoint: 3.0, remark: 'Credit' },
  { minScore: 50, maxScore: 59.99, letter: 'C', gradePoint: 2.0, remark: 'Pass' },
  { minScore: 0, maxScore: 49.99, letter: 'F', gradePoint: 0.0, remark: 'Fail' },
];

// Letter-grade table boundary checks
assert.equal(gradeFor(95, scale)?.letter, 'A+');
assert.equal(gradeFor(90, scale)?.gradePoint, 4.0);
assert.equal(gradeFor(85, scale)?.letter, 'A');
assert.equal(gradeFor(79.5, scale)?.letter, 'B+'); // fractional safety
assert.equal(gradeFor(72, scale)?.letter, 'B+');
assert.equal(gradeFor(65, scale)?.letter, 'B');
assert.equal(gradeFor(55, scale)?.letter, 'C');
assert.equal(gradeFor(49.9, scale)?.letter, 'F');
assert.equal(gradeFor(0, scale)?.remark, 'Fail');

// Weighted percentage: Assignment 10, Quiz 10, CAT 20, Midterm 20, Final 40
const components = [
  { weight: 10, maxScore: 100, score: 80 },
  { weight: 10, maxScore: 100, score: 90 },
  { weight: 20, maxScore: 100, score: 70 },
  { weight: 20, maxScore: 100, score: 60 },
  { weight: 40, maxScore: 100, score: 85 },
];
assert.equal(computeWeightedPercentage(components), 77);

// Non-100 max scores are normalised (quiz marked out of 20)
assert.equal(
  computeWeightedPercentage([{ weight: 50, maxScore: 20, score: 10 }, { weight: 50, maxScore: 100, score: 50 }]),
  50,
);

// Mixed maxima: 15/20 -> 75%, 60/100 -> 60% : (0.5*75 + 0.5*60) = 67.5
assert.equal(
  computeWeightedPercentage([{ weight: 50, maxScore: 20, score: 15 }, { weight: 50, maxScore: 100, score: 60 }]),
  67.5,
);

// Full subject result through the engine
const res = computeSubjectResult(components, scale);
assert.equal(res.letterGrade, 'B+');
assert.equal(res.gradePoint, 3.3);
assert.equal(res.remark, 'Good');

// Credit-weighted GPA: A (3.7 × 3cr) + B+ (3.3 × 4cr) + F (0 × 2cr) = 24.3/9 = 2.7
assert.equal(computeGpa([
  { gradePoint: 3.7, creditUnits: 3 },
  { gradePoint: 3.3, creditUnits: 4 },
  { gradePoint: 0, creditUnits: 2 },
]), 2.7);

// CGPA across terms
assert.equal(computeCgpa([
  { totalPoints: 11.1, totalCredits: 3 },
  { totalPoints: 12.0, totalCredits: 3 },
]), 3.85);

// Competition ranking with ties: 92, 92, 80 → positions 1, 1, 3
const ranks = rankIds([
  { id: 'a', value: 80 },
  { id: 'b', value: 92 },
  { id: 'c', value: 92 },
]);
assert.equal(ranks.get('b'), 1);
assert.equal(ranks.get('c'), 1);
assert.equal(ranks.get('a'), 3);

console.log(' grading engine: all tests passed');
