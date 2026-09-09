import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planRequiredAutoPlacement } from "../src/required-auto-placement.ts";
import { lookupClasses } from "../src/class-guidance.ts";
import { isCourseCompatible } from "../src/course-compatibility.ts";

const definition = (key, year = 1) => ({ key, year });
const course = (id, key, quarters = [1], slot = id, year = 1) => ({ id, key, quarters, slot, year });
const match = (course) => ({ course });
const noLookup = { status: "empty", matches: [], deferredMatches: [], blockedKeys: [] };
const conflictMessage = (course, selected) => selected.some((other) => other.key === course.key)
  ? "同じ科目がすでに選択されています。"
  : selected.some((other) => other.slot === course.slot && course.quarters.some((quarter) => other.quarters.includes(quarter)))
    ? "同じ時限に重なっています。" : null;
function plan(changes = {}) {
  return planRequiredAutoPlacement({
    requiredCourses: [], candidates: [], selectedCourses: [], quarters: [1, 2],
    lookup: noLookup, coveredCourseKeys: [], conflictMessage, ...changes,
  });
}

test("class-table electives never become auto-enrolled required courses", () => {
  const english = course("english", "英語I");
  const politics = course("politics", "政治経済論");
  const calculus = course("calculus", "微分積分学II");
  const candidates = [english, politics, calculus];
  const options = { requiredCourses: [definition("英語I")], candidates,
    lookup: { ...noLookup, status: "matched", matches: candidates.map(match) } };
  const result = plan(options);
  assert.deepEqual(result.added.map((course) => course.id), ["english"]);
  assert.deepEqual(result.selectedCourses.map((course) => course.id), ["english"]);
  const alreadyChosen = plan({ ...options, selectedCourses: [calculus, politics] });
  assert.deepEqual(alreadyChosen.selectedCourses.map((course) => course.id), ["calculus", "politics", "english"]);
  assert.deepEqual(alreadyChosen.replacements, []);
});

test("explicit auto placement replaces English and lab classes together across quarters and semesters", () => {
  const oldEnglish = course("english-old", "英語II", [2], "mon1");
  const oldLab = course("lab-old", "工学基盤実験A", [1], "tue2");
  const newEnglish = course("english-new", "英語II", [2], "tue2");
  const newLab = course("lab-new", "工学基盤実験A", [3], "mon1");
  const elective = course("elective", "微分積分学II", [4]);
  const options = {
    requiredCourses: [definition("英語II"), definition("工学基盤実験A")],
    candidates: [oldEnglish, newEnglish, oldLab, newLab], selectedCourses: [oldEnglish, elective, oldLab],
    lookup: { ...noLookup, status: "matched", matches: [match(newEnglish)], deferredMatches: [match(newLab)] },
  };
  const before = structuredClone(options);
  const result = plan(options);
  assert.equal(result.changed, true);
  assert.deepEqual(result.selectedCourses.map((course) => course.id), ["english-new", "elective", "lab-new"]);
  assert.deepEqual(result.replacements.map((replacement) => [replacement.previous[0].id, replacement.course.id]), [
    ["english-old", "english-new"], ["lab-old", "lab-new"],
  ]);
  assert.equal(result.classCount, 2);
  assert.deepEqual(options, before);
  const repeated = plan({ ...options, selectedCourses: result.selectedCourses });
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.selectedCourses, result.selectedCourses);
});

test("class swaps are checked after removing both old classes, without a transient collision", () => {
  const oldA = course("old-a", "A", [1], "mon1");
  const oldB = course("old-b", "B", [1], "tue1");
  const newA = course("new-a", "A", [1], "tue1");
  const newB = course("new-b", "B", [1], "mon1");
  const result = plan({ requiredCourses: [definition("A"), definition("B")],
    candidates: [oldA, oldB, newA, newB], selectedCourses: [oldA, oldB],
    lookup: { ...noLookup, status: "matched", matches: [match(newA), match(newB)] } });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.selectedCourses, [newA, newB]);
});

test("a conflict in any replacement preserves the entire existing plan atomically", () => {
  const oldA = course("old-a", "A", [1], "mon1");
  const oldB = course("old-b", "B", [1], "tue1");
  const newA = course("new-a", "A", [1], "wed1");
  const newB = course("new-b", "B", [1], "fri1");
  const elective = course("elective", "選択", [1], "fri1");
  const extra = course("extra", "C", [1], "thu1");
  const selectedCourses = [oldA, oldB, elective];
  const result = plan({ requiredCourses: [definition("A"), definition("B"), definition("C")],
    candidates: [oldA, oldB, newA, newB, extra], selectedCourses,
    lookup: { ...noLookup, status: "matched", matches: [match(newA), match(newB)] } });
  assert.equal(result.changed, false);
  assert.equal(result.conflicts[0].course.id, "new-b");
  assert.deepEqual(result.selectedCourses, selectedCourses);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.replacements, []);
});

test("new other-semester classes are deferred and one blocked addition does not stop safe additions", () => {
  const deferred = course("deferred", "A", [4]);
  const blocked = course("blocked", "B", [1], "mon1");
  const safe = course("safe", "C", [1], "tue1");
  const selected = course("selected", "選択", [1], "mon1");
  const result = plan({ requiredCourses: [definition("A"), definition("B"), definition("C")],
    candidates: [deferred, blocked, safe], selectedCourses: [selected],
    lookup: { ...noLookup, status: "matched", deferredMatches: [match(deferred)] } });
  assert.deepEqual(result.selectedCourses, [selected, safe]);
  assert.equal(result.skipped[0].required.key, "B");
  assert.deepEqual(result.conflicts, []);
});

test("unknown student numbers, source conflicts, and stale or ambiguous matches do not select a singleton class", () => {
  const a = course("a", "A");
  const unavailable = course("unavailable", "A");
  const second = course("second", "A");
  for (const lookup of [
    noLookup,
    { ...noLookup, status: "invalid" },
    { ...noLookup, status: "needs-review", blockedKeys: ["A"] },
    { ...noLookup, status: "matched", matches: [match(unavailable)] },
    { ...noLookup, status: "matched", matches: [match(a), match(second)] },
  ]) {
    const result = plan({ requiredCourses: [definition("A")], candidates: [a], coveredCourseKeys: ["A"], lookup });
    assert.deepEqual(result.added, []);
    assert.equal(result.skipped[0].required.key, "A");
  }
});

test("ineligible retake classes are never added or replaced in either direction", () => {
  const spring = course("spring", "微分積分学I", [1]);
  const fall = course("fall", "微分積分学I", [3]);
  const base = { requiredCourses: [definition("微分積分学I")], candidates: [spring, fall],
    isAutoEligible: (course) => !course.quarters.includes(3) };
  assert.deepEqual(plan({ ...base, quarters: [3, 4] }).added, []);
  const toFall = plan({ ...base, selectedCourses: [spring],
    lookup: { ...noLookup, status: "matched", deferredMatches: [match(fall)] } });
  assert.deepEqual(toFall.selectedCourses, [spring]);
  assert.equal(toFall.changed, false);
  const toSpring = plan({ ...base, selectedCourses: [fall],
    lookup: { ...noLookup, status: "matched", matches: [match(spring)] } });
  assert.deepEqual(toSpring.selectedCourses, [fall]);
  assert.equal(toSpring.changed, false);
});

test("other years and unverified manual classes remain selected", () => {
  const lowerYear = course("lower-year", "A", [1], "mon1", 1);
  const target = course("current-year", "A", [1], "tue1", 2);
  const manual = course("manual", "B", [1], "wed1", 2);
  const result = plan({ requiredCourses: [definition("A", 2), definition("B", 2)],
    candidates: [lowerYear, target, manual], selectedCourses: [lowerYear, manual],
    lookup: { ...noLookup, status: "matched", matches: [match(target)], blockedKeys: ["B"] } });
  assert.deepEqual(result.selectedCourses, [lowerYear, manual]);
  assert.equal(result.changed, false);
});

const data = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url)));
const guidance = JSON.parse(readFileSync(new URL("../src/data/department-guidance.json", import.meta.url)));

test("real electrical class tables reassign existing English and experiments when the student number changes", () => {
  const candidates = data.courses.filter((course) => course.year === 1 && isCourseCompatible(course, "電気"));
  const profile = { department: "電気", quarters: [1, 2], year: 1, academicYear: 2026 };
  const before = lookupClasses(guidance, { ...profile, studentNumber: "26B21001" }, candidates);
  const after = lookupClasses(guidance, { ...profile, studentNumber: "26B21150" }, candidates);
  const requiredCourses = data.departments["電気"].required.filter((required) =>
    ["英語I", "英語II", "工学基盤実験A", "工学基盤実験B", "科学基礎実験A", "科学基礎実験B"].includes(required.key));
  const keys = new Set(requiredCourses.map((required) => required.key));
  const selectedCourses = [...before.matches, ...before.deferredMatches]
    .filter((match) => keys.has(match.course.key)).map((match) => match.course);
  const expected = [...after.matches, ...after.deferredMatches]
    .filter((match) => keys.has(match.course.key)).map((match) => match.course);
  assert.equal(selectedCourses.length, 6);
  assert.equal(expected.length, 6);
  const result = plan({ requiredCourses, candidates, selectedCourses, lookup: after,
    coveredCourseKeys: guidance.departments["電気"].coveredCourseKeys,
    // Collision handling is tested independently above; this assertion checks
    // the actual PDF-derived cohort assignments across all four quarters.
    conflictMessage: () => null });
  assert.equal(result.replacements.length, 6);
  assert.deepEqual(result.selectedCourses.map((course) => course.id).sort(), expected.map((course) => course.id).sort());
  assert.ok(result.replacements.some(({ previous, course }) =>
    previous[0].quarters[0] <= 2 && course.quarters[0] >= 3));
});
