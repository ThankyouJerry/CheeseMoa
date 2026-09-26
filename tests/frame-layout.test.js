import test from "node:test";
import assert from "node:assert/strict";
import { fitFrame } from "../src/shared/frame-layout.js";

test("whole embedded page fits small, wide and fullscreen tiles", () => {
  for (const [width, height] of [[640, 350], [1000, 300], [300, 600], [1920, 1080]]) {
    const fit = fitFrame(width, height);
    assert.ok(fit.width >= 1280);
    assert.ok(fit.height >= 720);
    assert.ok(Math.abs(fit.width * fit.scale - width) < 0.001);
    assert.ok(Math.abs(fit.height * fit.scale - height) < 0.001);
  }
});

test("hidden or zero size tiles are skipped", () => {
  assert.equal(fitFrame(0, 100), null);
  assert.equal(fitFrame(100, 0), null);
});
