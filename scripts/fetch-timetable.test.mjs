import assert from "node:assert/strict";
import test from "node:test";

import { candidateUrls, looksLikeXlsx } from "./fetch-timetable.mjs";

test("Box共有リンクでは静的ダウンロードURLを最初に試す", () => {
  assert.deepEqual(candidateUrls("https://nihon-u.box.com/s/abc123"), [
    "https://nihon-u.box.com/shared/static/abc123.xlsx",
    "https://nihon-u.box.com/s/abc123?download=1",
    "https://nihon-u.box.com/s/abc123",
  ]);
});

test("通常のURLでは従来どおりdownloadパラメーターを使用する", () => {
  assert.deepEqual(candidateUrls("https://example.com/timetable"), [
    "https://example.com/timetable?download=1",
    "https://example.com/timetable",
  ]);
});

test("ZIPシグネチャーを持つデータだけをXLSX候補とする", () => {
  assert.equal(looksLikeXlsx(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00])), true);
  assert.equal(looksLikeXlsx(new TextEncoder().encode("<html>")), false);
});
