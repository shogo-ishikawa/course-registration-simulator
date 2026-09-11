import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { applyCourseCreditOverrides, isIntroductoryForeignLanguage } from "./course-credit-overrides.mjs";

const data = JSON.parse(await fs.readFile(new URL("../src/data/course-data.json", import.meta.url), "utf8"));
const departments = Object.keys(data.departments);

test("all current German, French and Chinese classes resolve to one credit for all nine departments", () => {
  const expected = new Map([["初習外国語(ドイツ語)", 6], ["初習外国語(フランス語)", 4], ["初習外国語(中国語)", 6]]);
  for (const [key, count] of expected) {
    const classes = data.courses.filter((course) => course.key === key);
    assert.equal(classes.length, count, key);
    for (const course of classes) {
      assert.equal(course.defaultCredits, 1, course.id);
      for (const department of departments) assert.equal(course.creditsByDepartment[department] ?? course.defaultCredits, 1, `${course.id} ${department}`);
    }
  }
  assert.equal(data.meta.coverage.sectionsWithCredits, data.courses.filter((course) => course.defaultCredits !== null).length);
});

test("foreign-language corrections override stale credits and cover new offerings without affecting English or other subjects", () => {
  const stale = { byDepartment: { 電気: 2, 機械: 3 }, defaultCredits: 2 };
  for (const title of ["初習外国語", "初習外国語（ドイツ語）", " 初習外国語 （ 中国語 ） ", "初習外国語(韓国語)"]) {
    assert.equal(isIntroductoryForeignLanguage(title), true);
    const actual = applyCourseCreditOverrides(title, stale, departments);
    assert.equal(actual.defaultCredits, 1);
    assert.deepEqual(actual.byDepartment, Object.fromEntries(departments.map((department) => [department, 1])));
  }
  for (const key of ["英語I", "イングリッシュスキルA", "中国語", "外国語教育論", "微分積分学I", "", undefined]) {
    assert.equal(isIntroductoryForeignLanguage(key), false);
    assert.deepEqual(applyCourseCreditOverrides(key, stale, departments), stale);
  }
  assert.equal(stale.defaultCredits, 2);
  assert.equal(stale.byDepartment.電気, 2);
});

test("the actual Excel refresh preserves the correction for existing and newly introduced language courses", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cit-credit-refresh-"));
  try {
    await fs.mkdir(path.join(directory, "src/data"), { recursive: true });
    const seed = {
      meta: { academicYear: 2026, coverage: { curriculumNamesMatched: 1 } },
      departments: data.departments,
      courses: [
        { key: "初習外国語(中国語)", creditsByDepartment: { 電気: 2 }, defaultCredits: 2 },
        { key: "通常科目", creditsByDepartment: { 電気: 3 }, defaultCredits: 2 },
      ],
    };
    await fs.writeFile(path.join(directory, "src/data/course-data.json"), JSON.stringify(seed));
    await fs.writeFile(path.join(directory, "src/data/update-info.json"), JSON.stringify({ sourcePageUrl: "https://example.test/timetable.xlsx" }));
    await fs.writeFile(path.join(directory, "src/data/update-history.json"), "[]");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("学部");
    sheet.addRow(["講義コード", "授業名", "時間割担当教員", "開講期間", "設置学年", "学科", "キャンパス", "使用教室", "コース・履修制限", "曜日時限"]);
    const titles = ["初習外国語（中国語）", "初習外国語（韓国語）", "通常科目", "英語特別講義"];
    // The importer requires at least 500 distinct lectures. Fill the remainder
    // with unrelated subjects to exercise its real production entry point.
    for (let index = 0; index < 500; index++) {
      sheet.addRow([String(9000000 + index), titles[index] ?? `その他${index}`, "担当者", "３Ｑ", "1", "教養", "実籾", "52401", "", "月1"]);
    }
    const workbookPath = path.join(directory, "timetable.xlsx");
    await workbook.xlsx.writeFile(workbookPath);
    execFileSync(process.execPath, [fileURLToPath(new URL("./update-timetable.mjs", import.meta.url)), workbookPath], { cwd: directory, stdio: "pipe" });
    const next = JSON.parse(await fs.readFile(path.join(directory, "src/data/course-data.json"), "utf8"));
    for (const key of ["初習外国語(中国語)", "初習外国語(韓国語)"]) {
      const course = next.courses.find((course) => course.key === key);
      assert.equal(course.defaultCredits, 1);
      assert.deepEqual(course.creditsByDepartment, Object.fromEntries(departments.map((department) => [department, 1])));
    }
    const ordinary = next.courses.find((course) => course.key === "通常科目");
    assert.equal(ordinary.defaultCredits, 2);
    assert.equal(ordinary.creditsByDepartment.電気, 3);
    assert.equal(next.courses.find((course) => course.key === "英語特別講義").defaultCredits, null);
    assert.equal(next.meta.coverage.sectionsWithCredits, 3);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
