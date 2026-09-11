import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getClassTableUrl, getClassTableLinks } from "../src/class-guidance.ts";

const data = JSON.parse(readFileSync(new URL("../src/data/department-guidance.json", import.meta.url)));
const electrical = data.departments.電気;
const supplementaryUrl = "https://nihon-u.box.com/s/2fdl33i55wkl36mi2p356s0p2iamiien";
const subjects = ["生産工学実習A", "生産工学実習B", "電気数学I"];

test("electrical practice A/B and mathematics I open their supplementary official document", () => {
  for (const key of subjects) assert.equal(getClassTableUrl(electrical, key), supplementaryUrl);
  assert.equal(electrical.sources["ee-fall-practice-math-2026-09-09"].url, supplementaryUrl);
  assert.deepEqual(Object.keys(electrical.courseClassTableUrls).sort(), [...subjects].sort());
});

test("career, English and other departments keep their general class table", () => {
  for (const key of ["キャリアデザイン", "英語I", "英語II", "科学基礎実験A"])
    assert.equal(getClassTableUrl(electrical, key), electrical.classTableUrl);
  for (const [department, info] of Object.entries(data.departments)) {
    if (department === "電気") continue;
    for (const key of subjects) assert.equal(getClassTableUrl(info, key), info.classTableUrl);
  }
});

test("mixed course groups retain both documents and consolidate courses sharing a document", () => {
  assert.deepEqual(getClassTableLinks(electrical, ["英語II", ...subjects, "キャリアデザイン", "生産工学実習A"]), [
    { url: electrical.classTableUrl, courseKeys: ["英語II", "キャリアデザイン"] },
    { url: supplementaryUrl, courseKeys: subjects },
  ]);
  assert.deepEqual(getClassTableLinks(electrical, subjects), [
    { url: supplementaryUrl, courseKeys: subjects },
  ]);
});

test("empty course groups provide the general table and missing departments provide no link", () => {
  assert.equal(getClassTableUrl(electrical), electrical.classTableUrl);
  assert.deepEqual(getClassTableLinks(electrical, []), [{ url: electrical.classTableUrl, courseKeys: [] }]);
  assert.equal(getClassTableUrl(undefined, "電気数学I"), undefined);
  assert.deepEqual(getClassTableLinks(undefined, subjects), []);
});
