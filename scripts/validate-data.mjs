import fs from "node:fs/promises";

const courseData = JSON.parse(await fs.readFile("src/data/course-data.json", "utf8"));
const updateInfo = JSON.parse(await fs.readFile("src/data/update-info.json", "utf8"));
const updateHistory = JSON.parse(await fs.readFile("src/data/update-history.json", "utf8"));
const errors = [];
const ids = new Set();

if (!Number.isInteger(courseData.meta?.academicYear)) errors.push("academicYear が不正です");
if (!courseData.departments || Object.keys(courseData.departments).length < 9) errors.push("学科データが不足しています");
if (!Array.isArray(courseData.courses) || courseData.courses.length < 500) errors.push("科目データが不足しています");

for (const course of courseData.courses || []) {
  if (!course.id || !course.title) errors.push("IDまたは科目名がない科目があります");
  if (ids.has(course.id)) errors.push(`講義コードが重複しています: ${course.id}`);
  ids.add(course.id);
  for (const slot of course.slots || []) {
    if (!"月火水木金土".includes(slot.day) || !Number.isInteger(slot.period)) {
      errors.push(`曜日時限が不正です: ${course.id}`);
    }
  }
}

for (const key of ["appUpdatedAt", "timetableUpdatedAt"]) {
  if (Number.isNaN(new Date(updateInfo[key]).getTime())) errors.push(`${key} が不正です`);
}
try {
  new URL(updateInfo.sourcePageUrl);
} catch {
  errors.push("sourcePageUrl が不正です");
}
if (!Array.isArray(updateHistory) || updateHistory.length === 0) {
  errors.push("更新履歴がありません");
} else {
  for (const [index, entry] of updateHistory.entries()) {
    if (!entry.message?.trim()) errors.push(`更新履歴${index + 1}件目の内容がありません`);
    if (Number.isNaN(new Date(entry.updatedAt).getTime())) {
      errors.push(`更新履歴${index + 1}件目の日時が不正です`);
    }
    if (!["automatic", "manual"].includes(entry.source)) {
      errors.push(`更新履歴${index + 1}件目の種別が不正です`);
    }
  }
}

if (errors.length) {
  console.error(errors.slice(0, 30).join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  academicYear: courseData.meta.academicYear,
  departments: Object.keys(courseData.departments).length,
  courses: courseData.courses.length,
  appVersion: updateInfo.appVersion,
  timetableUpdatedAt: updateInfo.timetableUpdatedAt,
}, null, 2));
