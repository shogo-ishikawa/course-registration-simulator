import test from "node:test";
import assert from "node:assert/strict";
import { deriveRequiredSelection, quarterLabel, semesterQuarterLabel } from "../src/required-selection.ts";

// Synthetic schedules exercise term choices; they are not university assignments.
const course = (id, key, quarters) => ({ id, key, year: 1, quarters });
const required = (key) => ({ key, year: 1, name: key });
const labs = ["工学基盤実験A", "工学基盤実験B", "科学基礎実験A", "科学基礎実験B"];
const candidates = labs.flatMap((key, index) => [
  course(`spring-${index}`, key, [1]),
  course(`fall-${index}`, key, [3]),
]);
const options = {
  requiredCourses: labs.map(required), candidates, selectedCourses: [],
  semester: "fall", quarters: [3, 4], assignments: {}, deferredMatches: [],
};
const select = (changes = {}) => deriveRequiredSelection({ ...options, ...changes });
const pendingKeys = (entries) => entries.filter((entry) => entry.pending).map((entry) => entry.required.key);

test("a subject already selected in spring is absent from fall pending and automatic-placement input", () => {
  const springCourse = candidates.find((candidate) => candidate.id === "spring-0");
  const selectedCourses = [springCourse];
  const entries = select({ selectedCourses });
  assert.deepEqual(pendingKeys(entries), labs.slice(1));
  assert.deepEqual(entries[0].selectedElsewhere, [springCourse]);
  assert.equal(entries[0].isCurrent, false);
  assert.deepEqual(selectedCourses, [springCourse]);
});

test("A and B remain separate required subjects for both experiment series", () => {
  const selectedCourses = [candidates[0], candidates[4]]; // A of each series, in spring
  assert.deepEqual(pendingKeys(select({ selectedCourses })), ["工学基盤実験B", "科学基礎実験B"]);
  const afterAddingBothB = [...selectedCourses, candidates[3], candidates[7]];
  assert.deepEqual(pendingKeys(select({ selectedCourses: afterAddingBothB })), []);
});

test("verified other-term assignments defer an unselected subject and retain its reason", () => {
  const deferred = { course: candidates[0], classLabel: "テストA" };
  const entries = select({ deferredMatches: [deferred] });
  assert.equal(entries[0].pending, false);
  assert.equal(entries[0].isCurrent, false);
  assert.deepEqual(entries[0].deferred, [deferred]);
  assert.equal(semesterQuarterLabel(deferred.course), "前期1Q");
});

test("a changed student assignment cannot hide or replace an existing current-term manual class", () => {
  const manualCourse = candidates[1];
  const deferred = { course: candidates[0], classLabel: "別学期指定" };
  const before = select({ selectedCourses: [manualCourse] })[0];
  const after = select({ selectedCourses: [manualCourse], deferredMatches: [deferred] })[0];
  assert.deepEqual(after.selectedCurrent, before.selectedCurrent);
  assert.equal(after.selectedCurrent[0].id, manualCourse.id);
  assert.equal(after.isCurrent, true);
  assert.equal(after.pending, false);
  assert.deepEqual(after.deferred, [deferred]);
  assert.equal(after.deferred[0].course.id === manualCourse.id, false); // UI must show mismatch
  assert.deepEqual(after.candidates, before.candidates); // manual class alternatives remain available
});

test("saved explicit semester assignments override broad quarter availability", () => {
  const annual = course("annual", "工学基盤実験A", [1, 2, 3, 4]);
  const selectedCourses = [annual];
  const assignments = { annual: "spring" };
  const entries = select({ selectedCourses, assignments, candidates: [annual, ...candidates] });
  assert.equal(entries[0].pending, false);
  assert.deepEqual(entries[0].selectedElsewhere, [annual]);
  assert.deepEqual(entries[0].selectedCurrent, []);
  assert.equal(semesterQuarterLabel(annual, assignments.annual), "前期1Q・2Q");
  const spring = select({ selectedCourses, assignments, semester: "spring", quarters: [1, 2] });
  assert.deepEqual(spring[0].selectedCurrent, [annual]);
});

test("deleting a selection restores pending only if the official table does not assign another term", () => {
  assert.equal(select({ selectedCourses: [candidates[1]] })[0].pending, false);
  assert.equal(select({ selectedCourses: [] })[0].pending, true);
  assert.equal(select({ selectedCourses: [], deferredMatches: [{ course: candidates[0], classLabel: "A" }] })[0].pending, false);
});

test("Q3 and Q4 choices remain separately visible without restricting manual alternatives", () => {
  const thirdQuarter = course("q3", "工学基盤実験A", [3]);
  const fourthQuarter = course("q4", "工学基盤実験A", [4]);
  const entry = select({ candidates: [thirdQuarter, fourthQuarter] })[0];
  assert.deepEqual(entry.candidates.map((candidate) => [candidate.id, quarterLabel(candidate)]), [["q3", "3Q"], ["q4", "4Q"]]);
  assert.equal(entry.pending, true);
  assert.equal(quarterLabel({ quarters: [2, 1, 2] }), "1Q・2Q");
  assert.equal(semesterQuarterLabel(thirdQuarter), "後期3Q");
});

test("a manually selected current-term subject remains visible when current candidates are unavailable", () => {
  const manualCourse = candidates[1];
  const entry = select({ candidates: [candidates[0]], selectedCourses: [manualCourse], deferredMatches: [{ course: candidates[0], classLabel: "A" }] })[0];
  assert.equal(entry.isCurrent, true);
  assert.deepEqual(entry.selectedCurrent, [manualCourse]);
  assert.equal(entry.candidates.length, 0);
});
