import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQuarterTimetable, outputScopeLabel, quartersForOutput } from "../src/schedule-output.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url), "utf8"));
const byId = (id) => {
  const course = data.courses.find((item) => item.id === id);
  assert.ok(course, `fixture course ${id} exists`);
  return course;
};
const at = (model, day, period) => model.rows.find((row) => row.period === period)?.cells.find((cell) => cell.day === day)?.courses ?? [];
const weeklyIds = (model) => [...new Set(model.rows.flatMap((row) => row.cells.flatMap((cell) => cell.courses.map((course) => course.id))))];
const ids = (courses) => courses.map((course) => course.id);
// Synthetic edge cases are output fixtures, not university class assignments.
const synthetic = (id, changes = {}) => ({
  id, title: `科目${id}`, term: "３Ｑ", quarters: [3], campus: "実籾", room: "52304",
  instructors: "教員一郎，教員二郎", slots: [{ day: "月", period: 1, label: "月1" }], ...changes,
});

test("quarter output separates real Q3/Q4 career classes and preserves full teaching/location details", () => {
  const q3 = byId("1221002");
  const q4 = byId("1221003");
  const calculus = byId("1103019");
  const third = buildQuarterTimetable([q3, q4, calculus], 3);
  const fourth = buildQuarterTimetable([q3, q4, calculus], 4);
  assert.deepEqual(weeklyIds(third), [q3.id]);
  assert.deepEqual(weeklyIds(fourth).sort(), [q4.id, calculus.id].sort());
  for (const day of ["月", "木"]) {
    assert.equal(at(third, day, 5)[0], q3);
    assert.equal(at(fourth, day, 5)[0], q4);
  }
  const exported = at(fourth, "火", 2)[0];
  for (const field of ["title", "campus", "room", "instructors"]) assert.equal(exported[field], calculus[field]);
  assert.equal(third.title, "3Q 時間割");
});

test("real sixth-period and multi-period lectures remain on every scheduled cell", () => {
  const double = byId("1100010");
  const teaching = byId("11a1002");
  const model = buildQuarterTimetable([double, teaching], 4);
  assert.deepEqual(model.periods, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids(at(model, "水", 5)), [double.id]);
  assert.deepEqual(ids(at(model, "水", 6)), [double.id]);
  assert.deepEqual(ids(at(model, "月", 6)), [teaching.id]);
  assert.deepEqual(model.days, ["月", "火", "水", "木", "金"]);
});

test("semester assignments scope annual/intensive courses while ordinary lectures still require the exact Q", () => {
  const annual = synthetic("annual", { term: "通年", quarters: [1, 2, 3, 4] });
  const intensive = byId("11a2024"); // undetermined intensive offering, explicitly selected for fall
  const regular = synthetic("q4", { term: "４Ｑ", quarters: [4] });
  const assignments = { annual: "spring", [intensive.id]: "fall", q4: "fall" };
  const courses = [annual, intensive, regular];
  const before = JSON.stringify({ courses, assignments });
  for (const quarter of [1, 2]) {
    const model = buildQuarterTimetable(courses, quarter, assignments);
    assert.deepEqual(weeklyIds(model), [annual.id]);
    assert.deepEqual(model.extraCourses, []);
  }
  assert.deepEqual(weeklyIds(buildQuarterTimetable(courses, 3, assignments)), []);
  assert.deepEqual(weeklyIds(buildQuarterTimetable(courses, 4, assignments)), [regular.id]);
  for (const quarter of [3, 4]) assert.deepEqual(buildQuarterTimetable(courses, quarter, assignments).extraCourses, [intensive]);
  assert.equal(JSON.stringify({ courses, assignments }), before);
});

test("intensive lectures never become weekly classes even when they contain time slots", () => {
  const intensive = synthetic("intensive", {
    term: "後学期集中", quarters: [3, 4], slots: [{ day: "土", period: 7, label: "土7" }],
  });
  const noSlots = synthetic("unplaced", { slots: [] });
  const model = buildQuarterTimetable([intensive, noSlots], 3);
  assert.deepEqual(model.extraCourses, [intensive, noSlots]);
  assert.deepEqual(weeklyIds(model), []);
  assert.deepEqual(model.days, ["月", "火", "水", "木", "金"]);
  assert.deepEqual(model.periods, [1, 2, 3, 4, 5]);
  assert.equal(model.extraCourses[0].slots[0].label, "土7");
});

test("Saturday, later periods, conflicts, and repeated slot records are retained without duplicate entries", () => {
  const saturday = synthetic("sat", { slots: [{ day: "土", period: 7, label: "土7" }] });
  const first = synthetic("first", { slots: [
    { day: "月", period: 1, label: "月1" }, { day: "月", period: 1, label: "月1" },
    { day: "木", period: 2, label: "木2" },
  ] });
  const overlapping = synthetic("overlapping");
  const model = buildQuarterTimetable([first, saturday, overlapping, first], 3);
  assert.deepEqual(model.days, ["月", "火", "水", "木", "金", "土"]);
  assert.deepEqual(model.periods, [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(ids(at(model, "月", 1)), [first.id, overlapping.id]);
  assert.deepEqual(ids(at(model, "木", 2)), [first.id]);
  assert.deepEqual(ids(at(model, "土", 7)), [saturday.id]);
});

test("unknown timing and invalid slots remain visible in the extra list instead of disappearing", () => {
  const unknown = synthetic("unknown", { term: "時期未定", quarters: [] });
  const invalid = synthetic("invalid", { slots: [{ day: "日", period: 1, label: "日1" }] });
  const negative = synthetic("negative", { slots: [{ day: "月", period: 0, label: "時限未定" }] });
  const autumn = synthetic("autumn", { term: "後学期", quarters: [], slots: [] });
  assert.deepEqual(buildQuarterTimetable([unknown, invalid, negative, autumn], 3).extraCourses, [unknown, invalid, negative, autumn]);
  assert.deepEqual(buildQuarterTimetable([unknown, autumn], 1).extraCourses, [unknown]);
  const annual = synthetic("annual", { term: "通年", quarters: [] });
  assert.deepEqual(weeklyIds(buildQuarterTimetable([annual], 4, { annual: "fall" })), [annual.id]);
});

test("print scopes produce separate quarter pages and reject unsupported scopes", () => {
  assert.deepEqual(quartersForOutput("spring"), [1, 2]);
  assert.deepEqual(quartersForOutput("fall"), [3, 4]);
  for (let quarter = 1; quarter <= 4; quarter++) {
    assert.deepEqual(quartersForOutput(`q${quarter}`), [quarter]);
    assert.equal(outputScopeLabel(`q${quarter}`), `${quarter}Q`);
  }
  assert.equal(outputScopeLabel("spring"), "前期（1Q・2Q）");
  assert.equal(outputScopeLabel("fall"), "後期（3Q・4Q）");
  const copy = quartersForOutput("spring");
  copy.push(4);
  assert.deepEqual(quartersForOutput("spring"), [1, 2]);
  assert.throws(() => quartersForOutput("year"), /選択/);
  assert.throws(() => buildQuarterTimetable([], 0), /1Q〜4Q/);
  assert.throws(() => buildQuarterTimetable([], 4.5), /1Q〜4Q/);
  const empty = buildQuarterTimetable([], 3);
  assert.equal(empty.rows.length, 5);
  assert.equal(empty.rows[0].cells.length, 5);
});
