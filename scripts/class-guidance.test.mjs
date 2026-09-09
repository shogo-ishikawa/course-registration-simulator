import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lookupClasses } from "../src/class-guidance.ts";

// Synthetic test fixtures only. These are not university class assignments.
const candidate = { id: "test-1", key: "架空科目", year: 1, quarters: [1], instructors: "テスト教員", slots: [{ label: "月1" }] };
const rule = { studentFrom: "26B99001", studentTo: "26B99010", classLabel: "テストA", courseId: "test-1", courseKey: "架空科目", quarters: [1], instructors: "テスト教員", slots: ["月1"] };
const data = { academicYear: 2026, linksCheckedAt: "2026-09-09", departments: { TEST: { targetYear: 1, verifiedAt: "2026-09-09", rules: [rule] } } };
const profile = { department: "TEST", year: 1, academicYear: 2026, studentNumber: "26B99001", quarters: [1, 2] };
const lookup = (changes = {}, courses = [candidate], source = data) => lookupClasses(source, { ...profile, ...changes }, courses);

test("range boundaries and full-width input resolve to the verified course", () => {
  for (const studentNumber of ["26B99001", "26B99010", " ２６ｂ９９００１ "]) {
    assert.equal(lookup({ studentNumber }).matches[0]?.course.id, "test-1");
  }
  for (const studentNumber of ["26B99000", "26B99011", "26B98001", "25B99001"]) {
    assert.equal(lookup({ studentNumber }).matches.length, 0);
  }
});

test("other years, semesters, missing and malformed numbers never select a class", () => {
  for (const changes of [{ year: 2 }, { academicYear: 2027 }, { quarters: [3, 4] }, { studentNumber: "" }, { studentNumber: "001" }]) {
    assert.equal(lookup(changes).matches.length, 0);
  }
});

test("unverified and ambiguous rules never select a class", () => {
  for (const info of [{ ...data.departments.TEST, verifiedAt: null }, { ...data.departments.TEST, rules: [] }]) {
    assert.equal(lookup({}, [candidate], { ...data, departments: { TEST: info } }).status, "unverified");
  }
  const ambiguous = { ...data, departments: { TEST: { ...data.departments.TEST, rules: [rule, { ...rule, classLabel: "テストB" }] } } };
  assert.deepEqual(lookup({}, [candidate], ambiguous).blockedKeys, ["架空科目"]);
  assert.equal(lookup({}, [candidate], ambiguous).matches.length, 0);
});

test("a refreshed workbook cannot silently reinterpret a verified mapping", () => {
  for (const change of [{ id: "new-id" }, { key: "別科目" }, { instructors: "別教員" }, { quarters: [2] }, { slots: [{ label: "火1" }] }, { year: 2 }]) {
    const result = lookup({}, [{ ...candidate, ...change }]);
    assert.equal(result.matches.length, 0);
    assert.equal(result.status, "needs-review");
  }
});

test("assignments in another semester retain the specified quarter", () => {
  const later = { ...candidate, quarters: [3] };
  const source = { ...data, departments: { TEST: { ...data.departments.TEST, rules: [{ ...rule, quarters: [3] }] } } };
  const spring = lookup({}, [later], source);
  assert.equal(spring.matches.length, 0);
  assert.equal(spring.deferredMatches[0].course.id, later.id);
  assert.deepEqual(spring.deferredMatches[0].course.quarters, [3]);
  assert.equal(lookup({ quarters: [3, 4] }, [later], source).matches[0].course.id, later.id);
  const conflicting = { ...source, departments: { TEST: { ...source.departments.TEST, rules: [rule, { ...rule, courseId: 'test-2', quarters: [3] }] } } };
  assert.equal(lookup({}, [candidate, { ...later, id: 'test-2' }], conflicting).matches.length, 0);
  assert.deepEqual(lookup({}, [candidate, { ...later, id: 'test-2' }], conflicting).blockedKeys, [rule.courseKey]);
});

test("compressed roster ranges preserve gaps and covered subjects require a match", () => {
  const { studentFrom, studentTo, ...details } = rule;
  const source = { ...data, departments: { TEST: { ...data.departments.TEST,
    coveredCourseKeys: [rule.courseKey],
    rules: [{ ...details, studentRanges: [{ from: '26B99001', to: '26B99003' }, { from: '26B99005', to: '26B99007' }] }],
  } } };
  for (const studentNumber of ['26B99001', '26B99003', '26B99005', '26B99007']) {
    assert.equal(lookup({ studentNumber }, [candidate], source).matches[0]?.course.id, candidate.id);
  }
  for (const studentNumber of ['26B99004', '26B99008']) {
    const result = lookup({ studentNumber }, [candidate], source);
    assert.equal(result.matches.length, 0);
    assert.deepEqual(result.blockedKeys, [rule.courseKey]);
  }
});

test("all departments use confirmed official links; no unverified mapping is enabled", () => {
  const source = JSON.parse(readFileSync(new URL("../src/data/department-guidance.json", import.meta.url)));
  const courses = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url)));
  assert.deepEqual(Object.keys(source.departments).sort(), Object.keys(courses.departments).sort());
  assert.equal(source.departments.電気.guidanceUrl, "https://sites.google.com/view/mimomi-guidance/home/elec_engr");
  for (const [department, info] of Object.entries(source.departments)) {
    assert.match(info.guidanceUrl, /^https:\/\/sites\.google\.com\/view\/mimomi-guidance\/home\/[a-z_]+$/);
    assert.match(info.classTableUrl, /^https:\/\/nihon-u\.box\.com\/s\/[a-z0-9]+$/);
    if (!info.verifiedAt) {
      assert.equal(info.rules.length, 0);
      assert.equal(lookupClasses(source, { ...profile, department }, courses.courses).status, "unverified");
    }
  }
});
