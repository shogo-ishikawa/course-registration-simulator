import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFRawStream, PageSizes } from "pdf-lib";
import { createSchedulePdf, SCHEDULE_PDF_PAGE } from "../src/schedule-pdf.ts";
import { buildQuarterTimetable } from "../src/schedule-output.ts";

// A complete one-pixel PNG keeps document-structure tests independent of a DOM.
// Native-canvas rendering and Japanese visual fidelity are checked separately.
const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKfoAAAAASUVORK5CYII=",
  "base64",
));

const course = (quarter, title) => ({
  id: `course-q${quarter}`, title, term: `第${quarter}クォーター`, quarters: [quarter],
  campus: "実籾", room: "52-304", instructors: "石川 将吾",
  slots: [{ day: "火", period: 1, label: "火1" }],
});

test("one quarter produces a readable one-page A4 landscape PDF with a PNG image", async () => {
  const model = buildQuarterTimetable([course(3, "情報リテラシー")], 3);
  const before = structuredClone(model);
  const bytes = await createSchedulePdf([model], async (received) => {
    assert.strictEqual(received, model);
    return png;
  }, { title: "2026年度 3Q 時間割" });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "2026年度 3Q 時間割");
  assert.equal(pdf.getCreator(), "Course Registration Simulator");
  assert.match(pdf.getSubject(), /正式な履修登録はポータル/);
  const page = pdf.getPage(0);
  assert.deepEqual(page.getSize(), { width: PageSizes.A4[1], height: PageSizes.A4[0] });
  const objects = page.node.Resources().lookup(PDFName.of("XObject"));
  assert.equal(objects.keys().length, 1);
  const embedded = objects.lookup(objects.keys()[0]);
  assert.ok(embedded instanceof PDFRawStream);
  assert.equal(embedded.dict.lookup(PDFName.of("Subtype")).toString(), "/Image");
  assert.equal(embedded.dict.lookup(PDFName.of("Width")).asNumber(), 1);
  assert.equal(embedded.dict.lookup(PDFName.of("Height")).asNumber(), 1);
  assert.ok(embedded.getContents().length > 0, "image pixel stream is embedded");
  assert.deepEqual(model, before);
  assert.equal(SCHEDULE_PDF_PAGE.imageWidth, 2970);
  assert.equal(SCHEDULE_PDF_PAGE.imageHeight, 2100);
});

test("semester PDF renders each quarter independently and preserves supplied page order", async () => {
  const courses = [course(3, "3Qの科目"), course(4, "4Qの科目")];
  const models = [4, 3].map((quarter) => buildQuarterTimetable(courses, quarter));
  const received = [];
  let activeRenderers = 0;
  const bytes = await createSchedulePdf(models, async (model) => {
    activeRenderers += 1;
    assert.equal(activeRenderers, 1, "page canvases are rendered sequentially");
    await Promise.resolve();
    const included = model.rows.flatMap((row) => row.cells.flatMap((cell) => cell.courses));
    assert.ok(included.every((entry) => entry.quarters.includes(model.quarter)));
    assert.equal(included[0].title, `${model.quarter}Qの科目`);
    received.push(model.quarter);
    activeRenderers -= 1;
    return png;
  });
  assert.deepEqual(received, [4, 3]);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
});

test("blank selected quarter remains a valid timetable page, but no scope is rejected", async () => {
  const bytes = await createSchedulePdf([buildQuarterTimetable([], 2)], async () => png);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  let called = false;
  await assert.rejects(createSchedulePdf([], async () => {
    called = true;
    return png;
  }), /PDFに出力する学期・クウォーター/);
  assert.equal(called, false);
});

test("rendering or image failures reject the full PDF instead of yielding a partial file", async () => {
  const models = [3, 4].map((quarter) => buildQuarterTimetable([], quarter));
  const failure = new Error("全文を読みやすく配置できません");
  let calls = 0;
  await assert.rejects(createSchedulePdf(models, async () => {
    calls += 1;
    if (calls === 2) throw failure;
    return png;
  }), (error) => error === failure);
  assert.equal(calls, 2);
  await assert.rejects(createSchedulePdf(models, async () => new Uint8Array([1, 2, 3])));
});
