import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  areCalculusRetakePair,
  effectiveCapLimit,
  enrollmentEligibilityIssue,
  isCapRelaxationEligible,
  isFallCalculusRetakeCourse,
  normalizeCapLimits,
} from "../src/enrollment-eligibility.ts";

const courses = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url), "utf8")).courses;
const courseById = (id) => {
  const course = courses.find((item) => item.id === id);
  assert.ok(course, `missing data fixture ${id}`);
  return course;
};

test("first-year CAP is 20 for both semesters, including saved relaxed fall settings", () => {
  assert.equal(isCapRelaxationEligible(1), false);
  for (const limit of [20, 22, 24]) assert.equal(effectiveCapLimit(1, limit), 20);
  const saved = { spring: 22, fall: 24 };
  assert.deepEqual(normalizeCapLimits(1, saved), { spring: 20, fall: 20 });
  assert.deepEqual(saved, { spring: 22, fall: 24 });
});

test("second-year and higher CAP settings remain independent, and invalid input defaults to 20", () => {
  for (const year of [2, 3, 4]) {
    assert.equal(isCapRelaxationEligible(year), true);
    assert.deepEqual(normalizeCapLimits(year, { spring: 22, fall: 24 }), { spring: 22, fall: 24 });
    assert.deepEqual(normalizeCapLimits(year, { spring: 24, fall: 20 }), { spring: 24, fall: 20 });
    for (const value of [undefined, null, "24", 26, -1, NaN]) {
      assert.equal(effectiveCapLimit(year, value), 20);
    }
  }
  for (const year of [0, -1, 1.5, NaN, Infinity]) assert.equal(effectiveCapLimit(year, 24), 20);
  assert.deepEqual(normalizeCapLimits(2), { spring: 20, fall: 20 });
});

test("the two actual fall calculus I classes require a separate positive retake attestation", () => {
  const restricted = courses.filter(isFallCalculusRetakeCourse);
  assert.deepEqual(restricted.map((course) => course.id).sort(), ["1103084", "1103085"]);
  for (const course of restricted) {
    assert.match(enrollmentEligibilityIssue(course, false), /前期に履修して単位を取得できなかった/);
    assert.equal(enrollmentEligibilityIssue(course, true), null);
    // Truthy imported values are not an explicit attestation.
    for (const value of [undefined, "true", "false", 1]) {
      assert.ok(enrollmentEligibilityIssue(course, value));
    }
  }
});

test("spring calculus I, calculus II, and unrelated courses are not incorrectly gated", () => {
  for (const id of ["1103012", "1103015", "1103016", "1103019", "1103103", "1108005"]) {
    const course = courseById(id);
    assert.equal(isFallCalculusRetakeCourse(course), false, id);
    assert.equal(enrollmentEligibilityIssue(course, false), null, id);
  }
  assert.equal(isFallCalculusRetakeCourse({ key: "微分積分学Ⅰ", quarters: [4] }), true);
  assert.equal(isFallCalculusRetakeCourse({ key: "微分積分学Ⅱ", quarters: [4] }), false);
  assert.equal(isFallCalculusRetakeCourse({ key: "微分積分学III", quarters: [4] }), false);
});

test("restored schedules can be checked without treating a spring plan as proof of failure", () => {
  const restored = [courseById("1103012"), courseById("1103084"), courseById("1103019")];
  const before = structuredClone(restored);
  assert.deepEqual(restored.filter((course) => enrollmentEligibilityIssue(course, false)).map((course) => course.id), ["1103084"]);
  assert.deepEqual(restored.filter((course) => enrollmentEligibilityIssue(course, true)), []);
  assert.deepEqual(restored, before);
});

test("only a spring calculus I and fall calculus I form the retake duplicate exception", () => {
  const spring = courseById("1103012");
  const fall = courseById("1103084");
  assert.equal(areCalculusRetakePair(spring, fall), true);
  assert.equal(areCalculusRetakePair(fall, spring), true);
  assert.equal(areCalculusRetakePair(spring, courseById("1103015")), false);
  assert.equal(areCalculusRetakePair(fall, courseById("1103085")), false);
  assert.equal(areCalculusRetakePair(spring, courseById("1103019")), false);
  assert.equal(areCalculusRetakePair(fall, { key: spring.key, quarters: [] }), false);
  assert.equal(areCalculusRetakePair(fall, { key: spring.key, quarters: [1, 2, 3, 4] }), false);
  assert.equal(areCalculusRetakePair(fall, { key: spring.key, quarters: [0] }), false);
});
