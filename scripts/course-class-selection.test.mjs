import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCourseClassSelection } from "../src/course-class-selection.ts";
import { lookupClasses } from "../src/class-guidance.ts";
import { isCourseCompatible } from "../src/course-compatibility.ts";

const guidance = JSON.parse(readFileSync(new URL("../src/data/department-guidance.json", import.meta.url)));
const courses = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url))).courses;

function selection(department, studentNumber, clickedId, quarters = [1, 2]) {
  const candidates = courses.filter((course) => course.year === 1 && isCourseCompatible(course, department));
  return buildCourseClassSelection({
    course: courses.find((course) => course.id === clickedId),
    candidates,
    lookup: lookupClasses(guidance, { department, studentNumber, quarters, year: 1, academicYear: 2026 }, candidates),
    coveredCourseKeys: guidance.departments[department].coveredCourseKeys,
  });
}

test("electrical calculus II defaults to the student's assigned Q4 or Q2 across semester boundaries", () => {
  // 02電気 PDF p6: 002 belongs to the Q4 class; 001 to the Q2 class.
  const fourthQuarter = selection("電気", "26B21002", "1103016");
  assert.equal(fourthQuarter.recommended.id, "1103019");
  assert.equal(fourthQuarter.defaultCourse.id, "1103019");
  assert.deepEqual(fourthQuarter.defaultCourse.quarters, [4]);
  assert.deepEqual(fourthQuarter.options.map((course) => course.id), ["1103016", "1103017", "1103018", "1103019"]);
  assert.equal(fourthQuarter.isClassDivided, true);

  const secondQuarter = selection("電気", "26B21001", "1103019", [3, 4]);
  assert.equal(secondQuarter.defaultCourse.id, "1103016");
  assert.deepEqual(secondQuarter.defaultCourse.quarters, [2]);
  assert.deepEqual(secondQuarter.options.map((course) => course.id), fourthQuarter.options.map((course) => course.id));
  // Automatic default selection leaves all three other classes available.
  assert.ok(secondQuarter.options.some((course) => course.id === "1103019"));
});

test("information literacy and chemistry choose verified classes, not just experiments", () => {
  // 02電気 PDF p12 and p10: literacy changes at 059, chemistry at 060.
  for (const [id, literacy, chemistry] of [
    ["26B21058", "1108005", "1105004"],
    ["26B21059", "1108004", "1105004"],
    ["26B21060", "1108004", "1105006"],
    ["26B21115", "1108006", "1105006"],
    ["26B21117", "1108006", "1105005"],
  ]) {
    assert.equal(selection("電気", id, "1108005").defaultCourse.id, literacy, id);
    assert.equal(selection("電気", id, "1105004").defaultCourse.id, chemistry, id);
  }
});

test("source gaps, conflicting records, and empty student numbers keep the clicked class as a manual choice", () => {
  for (const [department, id, clickedId] of [
    ["機械", "26B11059", "1108002"], // PDF omits this literacy number.
    ["電気", "26B21001", "1103012"], // Calculus I instructor conflict.
    ["電気", "", "1103017"],
    ["電気", "not-a-number", "1103017"],
  ]) {
    const result = selection(department, id, clickedId);
    assert.equal(result.recommended, null);
    assert.equal(result.defaultCourse.id, clickedId);
    assert.equal(result.isClassDivided, true);
    assert.ok(result.options.some((course) => course.id === clickedId));
  }
});

const synthetic = (id, quarters, day = "月", period = 1, changes = {}) => ({
  id, key: "テスト選択科目", year: 1, quarters,
  slots: [{ day, period, label: `${day}${period}` }], ...changes,
});
const noMatch = { status: "empty", matches: [], deferredMatches: [], blockedKeys: [] };
const match = (course) => ({ course, classLabel: "テスト" });

test("options retain the clicked class, exclude other subjects and years, and sort without mutating inputs", () => {
  const clicked = synthetic("saved", [4]);
  const candidates = [
    synthetic("q2-tue2", [2], "火", 2),
    synthetic("q2-mon2", [2], "月", 2),
    synthetic("q1", [1]),
    synthetic("q2-mon1", [2], "月", 1),
    synthetic("other-year", [1], "月", 1, { year: 2 }),
    synthetic("other-subject", [1], "月", 1, { key: "別科目" }),
  ];
  const before = structuredClone({ candidates, clicked, lookup: noMatch });
  Object.freeze(candidates);
  const result = buildCourseClassSelection({ course: clicked, candidates, lookup: noMatch, coveredCourseKeys: [] });
  assert.deepEqual(result.options.map((course) => course.id), ["q1", "q2-mon1", "q2-mon2", "q2-tue2", "saved"]);
  assert.strictEqual(result.defaultCourse, clicked);
  assert.deepEqual({ candidates, clicked, lookup: noMatch }, before);
});

test("ambiguous, blocked, ineligible, and out-of-scope recommendations cannot override a manual choice", () => {
  const clicked = synthetic("clicked", [2]);
  const other = synthetic("other", [4]);
  const unavailable = synthetic("unavailable", [3]);
  const valid = { status: "matched", matches: [match(other)], deferredMatches: [], blockedKeys: [] };
  for (const lookup of [
    { ...valid, deferredMatches: [match(clicked)] },
    { ...valid, blockedKeys: [clicked.key] },
    { ...valid, matches: [match(unavailable)] },
    { ...valid, status: "out-of-scope" },
    { ...valid, status: "unverified" },
    { ...valid, matches: [match({ ...other, year: 2 })] },
  ]) {
    const result = buildCourseClassSelection({ course: clicked, candidates: [clicked, other], lookup, coveredCourseKeys: [] });
    assert.equal(result.recommended, null);
    assert.strictEqual(result.defaultCourse, clicked);
    assert.equal(result.options.length, 2);
  }
  const unrelatedWarning = buildCourseClassSelection({
    course: clicked, candidates: [clicked, other],
    lookup: { ...valid, status: "needs-review", blockedKeys: ["別科目"] }, coveredCourseKeys: [],
  });
  assert.strictEqual(unrelatedWarning.recommended, other);
});

test("a covered subject is identified as class-divided even when only one option remains", () => {
  const clicked = synthetic("single", [3]);
  const args = { course: clicked, candidates: [clicked, clicked], lookup: noMatch, coveredCourseKeys: new Set([clicked.key]) };
  const result = buildCourseClassSelection(args);
  assert.equal(result.isClassDivided, true);
  assert.equal(result.options.length, 1);
  assert.strictEqual(result.defaultCourse, clicked);
  assert.equal(buildCourseClassSelection({ ...args, coveredCourseKeys: [] }).isClassDivided, false);
});
