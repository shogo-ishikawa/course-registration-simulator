import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lookupClasses } from "../src/class-guidance.ts";
import { buildCourseClassSelection } from "../src/course-class-selection.ts";
import { isCourseCompatible } from "../src/course-compatibility.ts";
import { planRequiredAutoPlacement } from "../src/required-auto-placement.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/course-data.json", import.meta.url)));
const guidance = JSON.parse(readFileSync(new URL("../src/data/department-guidance.json", import.meta.url)));
const candidates = data.courses.filter((course) => course.year === 1 && isCourseCompatible(course, "電気"));
const profile = { department: "電気", year: 1, academicYear: 2026, quarters: [3, 4] };
const newKeys = ["キャリアデザイン", "生産工学実習A", "生産工学実習B", "電気数学I"];
const electiveKeys = newKeys.slice(1);
const studentNumber = (suffix) => `26B21${String(suffix).padStart(3, "0")}`;
const lookup = (suffix, changes = {}, snapshot = candidates) => lookupClasses(guidance, {
  ...profile, studentNumber: studentNumber(suffix), ...changes,
}, snapshot);
const relevant = (matches) => matches.filter(({ course }) => newKeys.includes(course.key));
const ids = (matches) => relevant(matches).map(({ course }) => course.id).sort();
const cohort = (text) => text.trim().split(/\s+/).map(Number);

// Independent expectations transcribed from the two rendered pages of
// 「① 2026_後期_生産工学実習と電気数学１の履修について.pdf」.
// They are deliberately kept as the original individual numbers rather than
// reconstructed from the implementation's compressed studentRanges.
const practice3Monday = cohort(`
  001 004 006 008 009 010 011 012 013 014 015 017 018 019 020 021 022 023
  024 025 026 027 029 030 031 032 033 035 036 038 039 040 042 043 044 045
  046 047 048 049 051 052 053 054 055 056 064 070 071 077 101 103 104 109
  110 113 114 116 118 122 123 124 125 127 128 135 137 142 150 162 168 174
`);
const practice4Monday = cohort(`
  057 060 061 062 065 067 074 075 078 079 081 082 083 084 085 086 087 088
  089 090 093 095 096 098 100 105 106 107 108 111
`);
const practice4Thursday = cohort(`
  112 117 119 120 121 129 133 134 138 141 143 144 145 146 148 149 152 154
  155 157 159 160 161 163 164 165 169 171 172
`);
const mathematics3 = cohort(`
  057 060 061 062 065 067 074 075 078 079 081 082 083 084 085 086 087 088
  089 090 093 095 096 098 100 105 106 107 108 111 112 117 119 120 121 129
  133 134 138 141 143 144 145 146 148 149 152 154 155 157 159 160 161 163
  164 165 169 171 172
`);
const mathematics4 = cohort(`
  001 002 004 005 006 008 009 010 011 012 013 014 015 016 017 018 019 020
  021 022 023 024 025 026 027 028 029 030 031 032 033 034 035 036 038 039
  040 041 042 043 044 045 046 047 048 049 050 051 052 053 054 055 056 058
  059 064 066 068 069 070 071 072 073 076 077 080 091 092 094 097 099 101
  102 103 104 109 110 113 114 115 116 118 122 123 124 125 126 127 128 130
  131 132 135 136 137 139 140 142 147 150 151 156 162 166 168 170 173 174
  176
`);
const mathMissing = [3, 7, 37, 63, 153, 158, 167, 175];

// Lecture IDs and periods come from matching the PDF's subject, quarter, and
// weekday with the existing timetable. The PDF itself contains no lecture IDs.
const offerings = {
  "1221002": { key: "キャリアデザイン", q: 3, slots: ["月5", "木5"] },
  "1221003": { key: "キャリアデザイン", q: 4, slots: ["月5", "木5"] },
  "1221007": { key: "生産工学実習A", q: 3, slots: ["月1", "月2"] },
  "1221008": { key: "生産工学実習A", q: 4, slots: ["月1", "月2"] },
  "1221009": { key: "生産工学実習A", q: 4, slots: ["木1", "木2"] },
  "1221010": { key: "生産工学実習B", q: 3, slots: ["月3", "月4"] },
  "1221011": { key: "生産工学実習B", q: 4, slots: ["月3", "月4"] },
  "1221012": { key: "生産工学実習B", q: 4, slots: ["木3", "木4"] },
  "1221004": { key: "電気数学I", q: 3, slots: ["月3", "月4"] },
  "1221005": { key: "電気数学I", q: 4, slots: ["月3", "月4"] },
};

function expectedIds(suffix) {
  const practice = practice3Monday.includes(suffix) ? ["1221007", "1221010"]
    : practice4Thursday.includes(suffix) ? ["1221009", "1221012"]
      // Page 1 explicitly sends unlisted students to 4Q Monday. The app's
      // automatic recommendation is bounded to the known 001–176 cohort.
      : ["1221008", "1221011"];
  const math = mathematics3.includes(suffix) ? ["1221004"]
    : mathematics4.includes(suffix) ? ["1221005"] : [];
  return [suffix <= 88 ? "1221002" : "1221003", ...practice, ...math].sort();
}

test("EE fall rosters match every individual PDF entry and the bounded unlisted-student instruction", () => {
  assert.deepEqual([practice3Monday.length, practice4Monday.length, practice4Thursday.length,
    mathematics3.length, mathematics4.length], [72, 30, 29, 59, 109]);
  assert.equal(new Set([...practice3Monday, ...practice4Monday, ...practice4Thursday]).size, 131);
  assert.equal(new Set([...mathematics3, ...mathematics4]).size, 168);
  for (let suffix = 1; suffix <= 176; suffix++) {
    const result = lookup(suffix);
    assert.deepEqual(ids(result.matches), expectedIds(suffix), studentNumber(suffix));
    assert.deepEqual(ids(result.deferredMatches), []);
    for (const { course } of relevant(result.matches)) {
      const expected = offerings[course.id];
      assert.equal(course.key, expected.key);
      assert.deepEqual(course.quarters, [expected.q]);
      assert.deepEqual(course.slots.map(({ label }) => label), expected.slots);
      assert.equal(course.campus, "津田沼");
    }
    assert.equal(result.blockedKeys.includes("電気数学I"), mathMissing.includes(suffix), studentNumber(suffix));
  }
});

test("EE assigned fall classes defer correctly in spring and when viewing the other quarter", () => {
  for (const suffix of [1, 2, 57, 88, 89, 111, 112, 176]) {
    const expected = expectedIds(suffix);
    const spring = lookup(suffix, { quarters: [1, 2] });
    assert.deepEqual(ids(spring.matches), []);
    assert.deepEqual(ids(spring.deferredMatches), expected, studentNumber(suffix));
    for (const q of [3, 4]) {
      const result = lookup(suffix, { quarters: [q] });
      assert.deepEqual(ids(result.matches), expected.filter((id) => offerings[id].q === q));
      assert.deepEqual(ids(result.deferredMatches), expected.filter((id) => offerings[id].q !== q));
    }
  }
});

test("the eight omitted mathematics students and out-of-cohort numbers are never guessed", () => {
  for (const suffix of mathMissing) {
    const result = lookup(suffix);
    assert.ok(result.blockedKeys.includes("電気数学I"));
    assert.equal(result.matches.some(({ course }) => course.key === "電気数学I"), false);
    const clicked = candidates.find((course) => course.id === "1221005");
    const selection = buildCourseClassSelection({ course: clicked, candidates, lookup: result,
      coveredCourseKeys: guidance.departments.電気.coveredCourseKeys });
    assert.equal(selection.recommended, null);
    assert.equal(selection.defaultCourse.id, clicked.id);
    assert.deepEqual(selection.options.map(({ id }) => id), ["1221004", "1221005"]);
  }
  for (const changes of [
    { studentNumber: "26B21000" }, { studentNumber: "26B21177" }, { studentNumber: "26B21999" },
    { studentNumber: "25B21001" }, { studentNumber: "26B11001" }, { studentNumber: "001" },
    { studentNumber: "" }, { year: 2 }, { academicYear: 2027 },
  ]) {
    const result = lookup(1, changes);
    assert.deepEqual(ids(result.matches), [], JSON.stringify(changes));
    assert.deepEqual(ids(result.deferredMatches), [], JSON.stringify(changes));
  }
});

test("every added EE course rejects a changed timetable snapshot instead of using its old assignment", () => {
  const samples = { "1221002": 1, "1221003": 89, "1221007": 1, "1221008": 57,
    "1221009": 112, "1221010": 1, "1221011": 57, "1221012": 112, "1221004": 57, "1221005": 1 };
  for (const [id, suffix] of Object.entries(samples)) {
    for (const patch of [
      { instructors: "変更後の担当者" }, { quarters: [2] }, { slots: [{ label: "金5", day: "金", period: 5 }] },
      { campus: "実籾" }, { room: "別教室" }, { year: 2 },
    ]) {
      const changed = candidates.map((course) => course.id === id ? { ...course, ...patch } : course);
      const result = lookup(suffix, {}, changed);
      assert.ok(result.blockedKeys.includes(offerings[id].key), `${id} ${JSON.stringify(patch)}`);
      assert.equal(ids(result.matches).includes(id), false);
      assert.equal(ids(result.deferredMatches).includes(id), false);
    }
    const removed = lookup(suffix, {}, candidates.filter((course) => course.id !== id));
    assert.ok(removed.blockedKeys.includes(offerings[id].key), `${id} removed`);
  }
});

test("EE elective recommendations choose the assigned quarter but retain every manual class option", () => {
  const optionsByKey = {
    "生産工学実習A": ["1221007", "1221008", "1221009"],
    "生産工学実習B": ["1221010", "1221011", "1221012"],
    "電気数学I": ["1221004", "1221005"],
  };
  for (const suffix of [1, 2, 57, 112, 176]) {
    const result = lookup(suffix);
    for (const [key, expectedOptions] of Object.entries(optionsByKey)) {
      for (const clickedId of expectedOptions) {
        const selection = buildCourseClassSelection({
          course: candidates.find(({ id }) => id === clickedId), candidates, lookup: result,
          coveredCourseKeys: guidance.departments.電気.coveredCourseKeys,
        });
        const expected = expectedIds(suffix).find((id) => offerings[id].key === key);
        assert.equal(selection.recommended?.id, expected, `${studentNumber(suffix)} ${key}`);
        assert.equal(selection.defaultCourse.id, expected);
        assert.equal(selection.isClassDivided, true);
        assert.deepEqual(selection.options.map(({ id }) => id), expectedOptions);
      }
    }
  }
});

function autoPlace(suffix, selectedCourses = [], requiredCourses = data.departments.電気.required.filter(({ year }) => year === 1)) {
  return planRequiredAutoPlacement({ requiredCourses, candidates, selectedCourses, quarters: [3, 4],
    lookup: lookup(suffix), coveredCourseKeys: guidance.departments.電気.coveredCourseKeys,
    // Conflict checks have their own integration tests. This checks the actual
    // cohort mappings and required/elective definitions independently of them.
    conflictMessage: () => null,
  });
}

test("automatic required placement adds Career Design without enrolling any of the three new elective keys", () => {
  const requiredKeys = data.departments.電気.required.filter(({ year }) => year === 1).map(({ key }) => key);
  assert.ok(requiredKeys.includes("キャリアデザイン"));
  for (const key of electiveKeys) assert.equal(requiredKeys.includes(key), false);
  for (let suffix = 1; suffix <= 176; suffix++) {
    const result = autoPlace(suffix);
    assert.deepEqual(result.added.filter(({ key }) => newKeys.includes(key)).map(({ id }) => id),
      [suffix <= 88 ? "1221002" : "1221003"], studentNumber(suffix));
    assert.equal(result.selectedCourses.some(({ key }) => electiveKeys.includes(key)), false);
  }
});

test("reapplying required classes after the 088/089 boundary replaces Career Design but preserves manual electives", () => {
  const requiredCareer = data.departments.電気.required.filter(({ key }) => key === "キャリアデザイン");
  const manualElectives = ["1221009", "1221012", "1221005"].map((id) => candidates.find((course) => course.id === id));
  const initial = autoPlace(88, manualElectives, requiredCareer).selectedCourses;
  assert.deepEqual(initial.map(({ id }) => id), [...manualElectives.map(({ id }) => id), "1221002"]);
  const changed = autoPlace(89, initial, requiredCareer);
  assert.deepEqual(changed.replacements.map(({ previous, course }) => [previous.map(({ id }) => id), course.id]),
    [[["1221002"], "1221003"]]);
  assert.deepEqual(changed.selectedCourses.map(({ id }) => id), [...manualElectives.map(({ id }) => id), "1221003"]);
  assert.equal(autoPlace(89, changed.selectedCourses, requiredCareer).changed, false);
  const restored = autoPlace(88, changed.selectedCourses, requiredCareer);
  assert.deepEqual(restored.selectedCourses.map(({ id }) => id), initial.map(({ id }) => id));
});
