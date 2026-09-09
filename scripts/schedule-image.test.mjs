import test from "node:test";
import assert from "node:assert/strict";
import { SCHEDULE_IMAGE_PRESETS, drawScheduleImage } from "../src/schedule-image.ts";
import { buildQuarterTimetable } from "../src/schedule-output.ts";

function drawingContext() {
  const drawn = [];
  const rectangles = [];
  const ctx = {
    font: "16px sans-serif", fillStyle: "", strokeStyle: "", lineWidth: 1,
    textAlign: "left", textBaseline: "top",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, closePath() {}, fill() {}, strokeRect() {},
    fillRect(...args) { rectangles.push({ args, color: this.fillStyle }); },
    measureText(text) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      return { width: Array.from(text).reduce((sum, character) => sum + (character.charCodeAt(0) > 255 ? 1 : 0.56) * size, 0) };
    },
    fillText(text, x, y) { drawn.push({ text, x, y, font: this.font, align: this.textAlign, width: this.measureText(text).width }); },
  };
  return { ctx, drawn, rectangles };
}

const course = (changes = {}) => ({
  id: "test-3q", title: "情報リテラシー", term: "第3クォーター", quarters: [3],
  campus: "実籾", room: "52-304", instructors: "石川 将吾", slots: [{ day: "火", period: 1, label: "火1" }], ...changes,
});
const compact = (text) => text.replace(/\s/g, "");

test("wallpaper presets provide two landscape and two portrait pixel sizes", () => {
  assert.deepEqual(SCHEDULE_IMAGE_PRESETS.map(({ id, width, height }) => [id, width, height]), [
    ["pc-fhd", 1920, 1080], ["pc-qhd", 2560, 1440],
    ["phone-16-9", 1080, 1920], ["phone-20-9", 1080, 2400],
  ]);
});

test("all sizes render only the selected quarter with full campus, classroom and instructor fields", () => {
  const model = buildQuarterTimetable([
    course(), course({ id: "q4", title: "4Qだけの科目", quarters: [4] }),
    course({ id: "lab", title: "科学基礎実験Ａ［電気］", room: "53101 53102", instructors: "大熊 康典，鵜木 誠，水谷 雅志", slots: [{ day: "水", period: 1, label: "水1" }, { day: "水", period: 2, label: "水2" }] }),
  ], 3);
  const before = structuredClone(model);
  for (const preset of SCHEDULE_IMAGE_PRESETS) {
    const { ctx, drawn, rectangles } = drawingContext();
    drawScheduleImage(ctx, model, preset.width, preset.height, { academicYear: 2026, departmentName: "電気電子工学科", year: 1 });
    const text = compact(drawn.map((draw) => draw.text).join(""));
    for (const field of ["3Q 時間割", "2026年度", "電気電子工学科", "情報リテラシー", "実籾", "教室：52-304", "担当：石川 将吾", "科学基礎実験Ａ［電気］", "大熊 康典，鵜木 誠，水谷 雅志"]) {
      assert.ok(text.includes(compact(field)), `${preset.id}: ${field}`);
    }
    assert.ok(!text.includes("4Qだけの科目"));
    assert.deepEqual(rectangles[0].args, [0, 0, preset.width, preset.height]);
    assert.ok(rectangles[0].color.startsWith("#"), "background is opaque for JPEG");
    for (const draw of drawn) {
      const left = draw.align === "center" ? draw.x - draw.width / 2 : draw.x;
      assert.ok(left >= 0 && left + draw.width <= preset.width, `horizontal overflow: ${draw.text}`);
      assert.ok(draw.y >= 0 && draw.y < preset.height, `vertical overflow: ${draw.text}`);
    }
  }
  assert.deepEqual(model, before);
});

test("long instructor and room lists are preserved through numbered details instead of ellipses", () => {
  const teachers = "鈴木 康介，安藤 努，沖田 浩平，風間 恵介，久保田 正広，栗谷川 幸代，坂田 憲泰，菅沼 祐介，染宮 聖人，野村 浩司，平林 明子，平山 紀夫，前田 将克，松本 真和，丸茂 喜高，栁澤 一機";
  const rooms = "08103 08112 08113 08213 08214 08215 08216 08217 08218 08219 08220 08221 08222";
  const model = buildQuarterTimetable([course({ title: "生産工学実験", instructors: teachers, room: rooms })], 3);
  for (const preset of SCHEDULE_IMAGE_PRESETS) {
    const { ctx, drawn } = drawingContext();
    drawScheduleImage(ctx, model, preset.width, preset.height);
    const text = compact(drawn.map((draw) => draw.text).join(""));
    assert.ok(text.includes(compact(teachers)), preset.id);
    assert.ok(text.includes(compact(rooms)), preset.id);
    assert.ok(text.includes("教室・担当は詳細［1］"));
    assert.ok(text.includes("授業の詳細"));
  }
});

test("phone wallpapers keep each classroom code intact when wrapping multiple classrooms", () => {
  const rooms = ["31106 39301", "53201 53202", "37-402 52-304"];
  const model = buildQuarterTimetable(rooms.map((room, index) => course({
    id: `room-test-${index}`, room, slots: [{ day: "月", period: index + 1, label: `月${index + 1}` }],
  })), 3);
  for (const { width, height } of SCHEDULE_IMAGE_PRESETS.filter((preset) => preset.height > preset.width)) {
    const { ctx, drawn } = drawingContext();
    drawScheduleImage(ctx, model, width, height);
    assert.ok(!drawn.some(({ text }) => text.includes("授業の詳細")), "ordinary classroom lists fit inside cells");
    for (const code of rooms.flatMap((room) => room.split(" "))) {
      assert.ok(drawn.some(({ text }) => text.includes(code)), `classroom code must remain on one line: ${code}`);
    }
  }
});

test("Saturday, additional periods, missing metadata and intensive classes remain visible", () => {
  const model = buildQuarterTimetable([
    course({ id: "sat6", title: "土曜の演習", campus: "", room: "", instructors: "", slots: [{ day: "土", period: 6, label: "土6" }] }),
    course({ id: "intensive", title: "集中講義テスト", term: "後期集中", campus: "津田沼", room: "37-402", instructors: "担当 教員", slots: [{ day: "金", period: 6, label: "金6" }] }),
  ], 3);
  const { ctx, drawn } = drawingContext();
  drawScheduleImage(ctx, model, 1080, 2400);
  const text = compact(drawn.map((draw) => draw.text).join(""));
  for (const field of ["土", "6", "土曜の演習", "教室：要確認", "担当：要確認", "集中講義テスト", "津田沼", "37-402", "担当 教員", "参考時限：金6", "実施日程は別途確認"]) assert.ok(text.includes(compact(field)), field);
  assert.equal(drawn.filter(({ text }) => text.includes("参考時限：")).length, 1, "reference slots only appear in the separate list");
});

test("unreadable oversized content fails explicitly rather than producing a clipped export", () => {
  const model = buildQuarterTimetable([course({ instructors: "非常に長い担当教員情報".repeat(1000) })], 3);
  const { ctx, rectangles } = drawingContext();
  assert.throws(() => drawScheduleImage(ctx, model, 1920, 1080), /全文を読みやすく配置できません/);
  assert.equal(rectangles.length, 0, "preflight fails before rendering a partial image");
  assert.throws(() => drawScheduleImage(ctx, model, 0, 1080), /画像のサイズ/);
});

test("hiding supplementary information keeps header and complete weekly cells while expanding the grid in every preset", () => {
  const model = buildQuarterTimetable([
    course(),
    course({ id: "intensive", title: "集中講義テスト", term: "後期集中", instructors: "集中 担当", room: "37-402", slots: [] }),
  ], 3);
  const original = structuredClone(model);
  for (const preset of SCHEDULE_IMAGE_PRESETS) {
    const options = { academicYear: 2026, departmentName: "電気電子工学科", year: 1 };
    const full = drawingContext();
    const minimal = drawingContext();
    drawScheduleImage(full.ctx, model, preset.width, preset.height, options);
    drawScheduleImage(minimal.ctx, model, preset.width, preset.height, { ...options, showSupplementaryInfo: false });
    const text = compact(minimal.drawn.map((draw) => draw.text).join(""));
    for (const field of ["MY TIMETABLE", "3Q 時間割", "2026年度", "電気電子工学科", "情報リテラシー", "実籾", "教室：52-304", "担当：石川 将吾"]) {
      assert.ok(text.includes(compact(field)), `${preset.id}: ${field}`);
    }
    for (const field of ["集中講義", "集中担当", "37-402", "詳細", "参考時限", "ポータル", "履修計画用", "［1］"]) {
      assert.ok(!text.includes(field), `${preset.id}: excludes ${field}`);
    }
    const gridBottom = ({ rectangles }) => Math.max(...rectangles.filter(({ color }) => color === "#ffffff").map(({ args: [, y, , height] }) => y + height));
    const margin = preset.height > preset.width ? 34 * preset.width / 1080 : 48 * preset.width / 1920;
    assert.ok(gridBottom(minimal) > gridBottom(full), `${preset.id}: table reclaims supplementary space`);
    assert.ok(Math.abs(gridBottom(minimal) - (preset.height - margin)) < 0.001, `${preset.id}: only a normal bottom margin remains`);
    assert.ok(minimal.drawn.every(({ y }) => y < gridBottom(minimal)), `${preset.id}: no text is drawn below the table`);
  }
  assert.deepEqual(model, original, "hiding output information does not alter the timetable");
});

test("supplementary information defaults to visible and hiding it does not validate excluded intensive metadata", () => {
  const model = buildQuarterTimetable([course(), course({ id: "extra", title: "集中講義テスト", term: "後期集中", slots: [] })], 3);
  const defaultOutput = drawingContext();
  const explicitOutput = drawingContext();
  drawScheduleImage(defaultOutput.ctx, model, 1920, 1080);
  drawScheduleImage(explicitOutput.ctx, model, 1920, 1080, { showSupplementaryInfo: true });
  assert.deepEqual(defaultOutput.drawn, explicitOutput.drawn);
  assert.deepEqual(defaultOutput.rectangles, explicitOutput.rectangles);
  assert.ok(defaultOutput.drawn.some(({ text }) => text.includes("集中講義テスト")));
  assert.ok(defaultOutput.drawn.some(({ text }) => text.includes("ポータル")));

  const hugeExtra = buildQuarterTimetable([course(), course({ id: "huge-extra", term: "後期集中", slots: [], instructors: "非常に長い担当教員情報".repeat(1000) })], 3);
  const minimal = drawingContext();
  assert.doesNotThrow(() => drawScheduleImage(minimal.ctx, hugeExtra, 1920, 1080, { showSupplementaryInfo: false }));
  assert.ok(!minimal.drawn.some(({ text }) => text.includes("非常に長い")));
});

test("hidden details never create dangling references or truncate overflowing weekly metadata", () => {
  const model = buildQuarterTimetable([course({ instructors: "鈴木 康介，安藤 努，沖田 浩平，風間 恵介，久保田 正広，栗谷川 幸代，坂田 憲泰，菅沼 祐介，染宮 聖人，野村 浩司，平林 明子，平山 紀夫，前田 将克，松本 真和，丸茂 喜高，栁澤 一機", room: "08103 08112 08113 08213 08214 08215 08216 08217 08218 08219 08220 08221 08222" })], 3);
  for (const preset of SCHEDULE_IMAGE_PRESETS) {
    const { ctx, drawn, rectangles } = drawingContext();
    assert.throws(() => drawScheduleImage(ctx, model, preset.width, preset.height, { showSupplementaryInfo: false }), /「時間割の下の情報を表示する」を有効に/);
    assert.equal(drawn.length, 0, `${preset.id}: no partial text or references`);
    assert.equal(rectangles.length, 0, `${preset.id}: fail before partial image rendering`);
  }
});
