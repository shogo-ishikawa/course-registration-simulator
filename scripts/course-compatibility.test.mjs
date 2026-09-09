import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCourseCompatible } from "../src/course-compatibility.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url)));
const departments = Object.keys(data.departments);
const courseById = new Map(data.courses.map((course) => [course.id, course]));

test("official joint physics classes remain available to each named department", () => {
  for (const [ids, eligible] of [
    [["1104026", "1104027", "1104028"], ["機械", "創生"]],
    [["1104039"], ["ＭＡ", "環境"]],
  ]) {
    for (const id of ids) {
      const course = courseById.get(id);
      assert.ok(course, `missing course ${id}`);
      for (const department of departments) {
        assert.equal(isCourseCompatible(course, department), eligible.includes(department), `${id} / ${department}`);
      }
    }
  }
});

test("single-department general courses and specialist categories keep their eligibility", () => {
  for (const department of departments) {
    const general = { category: "教養", title: `テスト科目［${department}］`, restriction: "" };
    const specialist = { category: department, title: "テスト専門科目", restriction: "" };
    for (const selected of departments) {
      assert.equal(isCourseCompatible(general, selected), department === selected);
      assert.equal(isCourseCompatible(specialist, selected), department === selected);
    }
  }
  assert.equal(isCourseCompatible({ category: "教養", title: "テスト科目", restriction: "電気電子工学科" }, "電気"), true);
  assert.equal(isCourseCompatible({ category: "教養", title: "テスト科目", restriction: "電気電子工学科" }, "機械"), false);
});

test("common, BE, teaching, and unrestricted general courses stay available", () => {
  for (const department of departments) {
    for (const category of ["共通", "ＢＥ", "教職", "教養"]) {
      assert.equal(isCourseCompatible({ category, title: "テスト共通科目", restriction: "" }, department), true);
    }
    assert.equal(isCourseCompatible({ category: "対象外", title: "テスト科目", restriction: "" }, department), false);
  }
});
