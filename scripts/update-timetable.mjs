import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const inputPath = process.argv[2];
const courseDataPath = "src/data/course-data.json";
const updateInfoPath = "src/data/update-info.json";

if (!inputPath) {
  console.error("使い方: npm run data:update -- path/to/timetable.xlsx [--source-url URL] [--academic-year 2026]");
  process.exit(2);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("").trim();
    if (value.text !== undefined) return String(value.text).trim();
    if (value.result !== undefined) return text(value.result);
  }
  return String(value).trim();
}

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

function baseTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\[[^\]]+\]$/, "");
}

function termQuarters(term) {
  const mapping = new Map([
    ["1Q", [1]],
    ["2Q", [2]],
    ["3Q", [3]],
    ["4Q", [4]],
    ["前学期", [1, 2]],
    ["後学期", [3, 4]],
    ["通年", [1, 2, 3, 4]],
    ["前学期集中", [1, 2]],
    ["前集中", [1, 2]],
    ["後学期集中", [3, 4]],
    ["後集中", [3, 4]],
    ["集中", [1, 2, 3, 4]],
  ]);
  return mapping.get(normalize(term)) || [];
}

function parseSlot(value) {
  const normalized = String(value || "").normalize("NFKC").trim();
  const match = normalized.match(/^([月火水木金土])([1-9])$/);
  return match
    ? { day: match[1], period: Number(match[2]), label: `${match[1]}${match[2]}` }
    : null;
}

const current = JSON.parse(await fs.readFile(courseDataPath, "utf8"));
const updateInfo = JSON.parse(await fs.readFile(updateInfoPath, "utf8"));
const inputBytes = await fs.readFile(inputPath);
const sourceSha256 = option("--sha256") || crypto.createHash("sha256").update(inputBytes).digest("hex");
const sourceUrl = option("--source-url") || updateInfo.sourcePageUrl;
const academicYearOption = Number(option("--academic-year"));
const academicYear = Number.isInteger(academicYearOption) && academicYearOption >= 2020
  ? academicYearOption
  : current.meta.academicYear;

const creditByKey = new Map();
for (const course of current.courses) {
  const existing = creditByKey.get(course.key) || { byDepartment: {}, defaultCredits: null };
  Object.assign(existing.byDepartment, course.creditsByDepartment || {});
  if (existing.defaultCredits === null && course.defaultCredits !== null) {
    existing.defaultCredits = course.defaultCredits;
  }
  creditByKey.set(course.key, existing);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(inputBytes);
const sheet = workbook.getWorksheet("学部");
if (!sheet) throw new Error("Excelに『学部』シートがありません。");

const headerRow = sheet.getRow(1);
const headers = new Map();
headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
  const key = normalize(text(cell.value));
  if (key) headers.set(key, column);
});

const requiredHeaders = [
  "講義コード",
  "授業名",
  "時間割担当教員",
  "開講期間",
  "設置学年",
  "学科",
  "キャンパス",
  "使用教室",
  "コース・履修制限",
  "曜日時限",
];
for (const header of requiredHeaders) {
  if (!headers.has(normalize(header))) throw new Error(`必要な列『${header}』が見つかりません。`);
}

function valueAt(row, header) {
  return text(row.getCell(headers.get(normalize(header))).value);
}

const grouped = new Map();
for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
  const row = sheet.getRow(rowNumber);
  const code = valueAt(row, "講義コード");
  if (!code) continue;
  const record = {
    code,
    title: valueAt(row, "授業名"),
    instructors: valueAt(row, "時間割担当教員"),
    term: valueAt(row, "開講期間"),
    installedYear: valueAt(row, "設置学年"),
    category: valueAt(row, "学科"),
    campus: valueAt(row, "キャンパス"),
    room: valueAt(row, "使用教室"),
    restriction: valueAt(row, "コース・履修制限"),
    dayPeriod: valueAt(row, "曜日時限"),
  };
  const group = grouped.get(code) || [];
  group.push(record);
  grouped.set(code, group);
}

const courses = [];
for (const [code, rows] of grouped) {
  const first = rows[0];
  const base = baseTitle(first.title);
  const key = normalize(base);
  const slots = [];
  const seenSlots = new Set();
  for (const row of rows) {
    const slot = parseSlot(row.dayPeriod);
    if (slot && !seenSlots.has(slot.label)) {
      slots.push(slot);
      seenSlots.add(slot.label);
    }
  }
  const room = first.room;
  const rawCampus = first.campus || "その他";
  const campus = rawCampus === "その他" && (room.includes("オンライン") || slots.length === 0)
    ? "オンデマンド"
    : rawCampus;
  const yearMatch = first.installedYear.normalize("NFKC").match(/[1-4]/);
  const credit = creditByKey.get(key) || { byDepartment: {}, defaultCredits: null };
  courses.push({
    id: code,
    title: first.title,
    baseTitle: base,
    key,
    instructors: first.instructors,
    term: first.term,
    quarters: termQuarters(first.term),
    year: yearMatch ? Number(yearMatch[0]) : null,
    category: first.category,
    campus,
    room,
    restriction: first.restriction,
    slots,
    creditsByDepartment: credit.byDepartment,
    defaultCredits: credit.defaultCredits,
    syllabusSearchUrl: "https://portal.cit.nihon-u.ac.jp/Campusweb/slbssrch.do",
  });
}

function unicodeCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

courses.sort((a, b) =>
  (a.year ?? 9) - (b.year ?? 9) || unicodeCompare(a.title, b.title) || unicodeCompare(a.id, b.id),
);
const minimumExpected = Math.max(500, Math.floor(current.courses.length * 0.7));
if (courses.length < minimumExpected) {
  throw new Error(`抽出科目数が少なすぎます（${courses.length}件、最低${minimumExpected}件）。Excelの形式変更を確認してください。`);
}

const coverage = {
  totalSections: courses.length,
  sectionsWithCredits: courses.filter((course) => course.defaultCredits !== null).length,
  sectionsWithSlots: courses.filter((course) => course.slots.length > 0).length,
  curriculumNamesMatched: current.meta.coverage.curriculumNamesMatched,
};
const next = {
  meta: {
    ...current.meta,
    academicYear,
    sourceWorkbook: path.basename(inputPath),
    coverage,
  },
  departments: current.departments,
  courses,
};
const nextUpdateInfo = {
  ...updateInfo,
  timetableUpdatedAt: new Date().toISOString(),
  sourceWorkbook: path.basename(inputPath),
  sourcePageUrl: sourceUrl,
  sourceSha256,
};

await fs.writeFile(courseDataPath, `${JSON.stringify(next)}\n`);
await fs.writeFile(updateInfoPath, `${JSON.stringify(nextUpdateInfo, null, 2)}\n`);
console.log(JSON.stringify({ academicYear, sourceSha256, ...coverage }, null, 2));
