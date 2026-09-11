import test from "node:test";
import assert from "node:assert/strict";
import { shouldWarnCap } from "../src/cap-warning.ts";

const state = (credits, changes = {}) => ({ context: "電気:1", semester: "fall", credits, limit: 20, ...changes });

test("CAP warns on crossing the limit and on restoring an already excessive plan", () => {
  assert.equal(shouldWarnCap(null, state(20)), false);
  assert.equal(shouldWarnCap(state(19), state(20)), false);
  assert.equal(shouldWarnCap(state(20), state(21)), true);
  assert.equal(shouldWarnCap(null, state(22)), true);
  assert.equal(shouldWarnCap(state(22), state(24)), true);
});

test("CAP acknowledgements are not interrupted again while reducing courses or raising an eligible limit", () => {
  assert.equal(shouldWarnCap(state(24), state(24)), false);
  assert.equal(shouldWarnCap(state(24), state(22)), false);
  assert.equal(shouldWarnCap(state(22), state(20)), false);
  assert.equal(shouldWarnCap(state(24), state(24, { limit: 22 })), false);
  assert.equal(shouldWarnCap(state(20), state(22)), true);
});

test("CAP warns when lowering the limit or viewing another semester or profile with excess credits", () => {
  assert.equal(shouldWarnCap(state(24, { limit: 24 }), state(24, { limit: 22 })), true);
  assert.equal(shouldWarnCap(state(24, { limit: 22 }), state(24)), true);
  assert.equal(shouldWarnCap(state(22), state(22, { semester: "spring" })), true);
  assert.equal(shouldWarnCap(state(22), state(22, { context: "機械:2" })), true);
  assert.equal(shouldWarnCap(state(22), state(20, { semester: "spring" })), false);
});
