import test from "node:test";
import assert from "node:assert/strict";
import { conflictMessage, detectedScheduleIssues } from "../src/schedule-conflicts.ts";

const slot = (period, day = "月") => ({ day, period, label: `${day}${period}` });
const course = (key, changes = {}) => ({
  key, title: key, campus: "実籾", quarters: [3], slots: [slot(3)], ...changes,
});

test("an overlap takes precedence over an earlier campus-transfer candidate regardless of selection order", () => {
  const incoming = course("追加する科目");
  const transfer = course("移動先の科目", { campus: "津田沼", slots: [slot(2)] });
  const overlap = course("同時限の科目");
  for (const selected of [[transfer, overlap], [overlap, transfer]]) {
    assert.equal(conflictMessage(incoming, selected), "月3は「同時限の科目」と重なっています。");
  }
});

test("multi-slot classes are checked in full before reporting adjacency within the same pair", () => {
  for (const slots of [[slot(2), slot(3)], [slot(3), slot(2)]]) {
    const incoming = course("連続コマの科目", { slots });
    const existing = course("既存の科目", { campus: "津田沼" });
    assert.match(conflictMessage(incoming, [existing]), /^月3.*重なっています/);
    assert.deepEqual(detectedScheduleIssues([incoming, existing]), [
      "月3で「連続コマの科目」と「既存の科目」が重複しています。",
    ]);
  }
});

test("a later day in a multi-slot course can supply the overlap before an earlier day's transfer", () => {
  const incoming = course("複数曜日の科目", { slots: [slot(3), slot(5, "木")] });
  const existing = course("既存科目", { campus: "津田沼", slots: [slot(2), slot(5, "木")] });
  assert.equal(conflictMessage(incoming, [existing]), "木5は「既存科目」と重なっています。");
});

test("campus-transfer messages remain informative once there is no overlap", () => {
  const incoming = course("追加科目", { slots: [slot(3, "木")] });
  const existing = course("既存科目", { campus: "津田沼", slots: [slot(2, "木")] });
  assert.equal(conflictMessage(incoming, [existing]),
    "木曜日2・3限で、「既存科目」（津田沼）と「追加科目」（実籾）のキャンパス間移動が生じます。");
  for (const changes of [
    { campus: "実籾" }, { campus: "オンデマンド" }, { campus: "未定" },
    { slots: [slot(1, "木")] }, { slots: [slot(2, "金")] }, { quarters: [4] },
  ]) assert.equal(conflictMessage(incoming, [{ ...existing, ...changes }]), null);
});

test("same-subject rejection and the explicitly confirmed calculus retake exception are preserved", () => {
  const spring = course("微分積分学I", { quarters: [1, 2] });
  const fall = course("微分積分学I", { quarters: [3, 4] });
  assert.equal(conflictMessage(fall, [spring]), "同じ科目がすでに選択されています。");
  assert.equal(conflictMessage(fall, [spring], true), null);
  assert.equal(conflictMessage(spring, [fall], true), null);
  assert.equal(conflictMessage(fall, [{ ...fall, slots: [slot(5)] }], true), "同じ科目がすでに選択されています。");
  assert.equal(conflictMessage(course("他の科目", { quarters: [4] }), [course("他の科目")], true),
    "同じ科目がすでに選択されています。");
});

test("diagnostics list all overlaps before unrelated transfers, and suppress transfer noise for overlapping pairs", () => {
  const selected = [
    course("先の科目", { slots: [slot(1, "火")] }),
    course("隣の科目", { campus: "津田沼", slots: [slot(2, "火")] }),
    course("連続科目", { slots: [slot(2), slot(3)] }),
    course("重複科目", { campus: "津田沼" }),
  ];
  const before = structuredClone(selected);
  const issues = detectedScheduleIssues(selected);
  assert.equal(issues.length, 2);
  assert.equal(issues[0], "月3で「連続科目」と「重複科目」が重複しています。");
  assert.match(issues[1], /^火曜日1・2限.*先の科目.*隣の科目.*キャンパス間移動/);
  assert.deepEqual(selected, before);
});

test("duplicate subjects appear before transfers without repeated slot warnings", () => {
  const duplicate = course("重複した科目");
  const issues = detectedScheduleIssues([
    course("移動前", { slots: [slot(1, "木")] }),
    course("移動後", { campus: "津田沼", slots: [slot(2, "木")] }),
    duplicate, { ...duplicate, campus: "津田沼", slots: [slot(2), slot(3)] },
  ]);
  assert.equal(issues.length, 2);
  assert.equal(issues[0], "「重複した科目」が重複して登録されています。");
  assert.match(issues[1], /キャンパス間移動/);
});

test("quarter boundaries and virtual campuses retain their diagnostic behavior, and repeated slots are deduplicated", () => {
  const first = course("前のクォーター", { slots: [slot(2), slot(3)] });
  const later = course("次のクォーター", { quarters: [4], campus: "津田沼" });
  assert.equal(conflictMessage(first, [later]), null);
  assert.deepEqual(detectedScheduleIssues([first, later]), []);
  assert.deepEqual(detectedScheduleIssues([
    course("会場の科目", { slots: [slot(2)] }), course("配信科目", { campus: "オンデマンド" }),
  ]), []);
  assert.deepEqual(detectedScheduleIssues([
    course("同じ時限A", { slots: [slot(3), slot(3)] }), course("同じ時限B"),
  ]), ["月3で「同じ時限A」と「同じ時限B」が重複しています。"]);
});
