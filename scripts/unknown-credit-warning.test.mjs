import test from "node:test";
import assert from "node:assert/strict";
import { newlyUnknownCreditIds } from "../src/unknown-credit-warning.ts";

const state = (courseIds, changes = {}) => ({ context: "電気:1", semester: "fall", courseIds, ...changes });

test("unknown-credit warnings include all courses in a restored plan once, preserving their order", () => {
  assert.deepEqual(newlyUnknownCreditIds(null, state([])), []);
  assert.deepEqual(newlyUnknownCreditIds(null, state(["be-2", "be-1", "be-2"])), ["be-2", "be-1"]);
});

test("acknowledged unknown-credit selections stay quiet after unchanged, reordered, or removal-only updates", () => {
  const previous = state(["be-1", "teacher-1"]);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["be-1", "teacher-1"])), []);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["teacher-1", "be-1", "teacher-1"])), []);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["teacher-1"])), []);
  assert.deepEqual(newlyUnknownCreditIds(previous, state([])), []);
});

test("batch additions and same-count replacements warn only for newly selected unknown-credit courses", () => {
  const previous = state(["be-1", "teacher-1"]);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["be-2", "teacher-1", "be-3", "be-2"])), ["be-2", "be-3"]);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["be-1", "teacher-2"])), ["teacher-2"]);
});

test("switching semester or profile rechecks the currently viewed plan", () => {
  const previous = state(["be-1"]);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["be-1"], { semester: "spring" })), ["be-1"]);
  assert.deepEqual(newlyUnknownCreditIds(previous, state(["be-1"], { context: "機械:2" })), ["be-1"]);
  assert.deepEqual(newlyUnknownCreditIds(previous, state([], { semester: "spring" })), []);
});

test("removing and reselecting an unknown-credit course warns again without mutating snapshots", () => {
  const first = Object.freeze({ ...state(["be-1", "teacher-1"]), courseIds: Object.freeze(["be-1", "teacher-1"]) });
  const removed = Object.freeze({ ...state(["teacher-1"]), courseIds: Object.freeze(["teacher-1"]) });
  const restored = Object.freeze({ ...state(["teacher-1", "be-1", "be-1"]), courseIds: Object.freeze(["teacher-1", "be-1", "be-1"]) });
  assert.deepEqual(newlyUnknownCreditIds(first, removed), []);
  assert.deepEqual(newlyUnknownCreditIds(removed, restored), ["be-1"]);
  assert.deepEqual(first.courseIds, ["be-1", "teacher-1"]);
  assert.deepEqual(removed.courseIds, ["teacher-1"]);
  assert.deepEqual(restored.courseIds, ["teacher-1", "be-1", "be-1"]);
});
