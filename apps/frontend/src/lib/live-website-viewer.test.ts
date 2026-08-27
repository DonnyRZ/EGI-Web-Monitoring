import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryLiveViewer,
  initialLiveViewerPhase,
  liveViewerStatusMessage,
  markLiveViewerReady,
  markLiveViewerSlow,
  markLiveViewerUnverified,
  shouldRenderLiveViewerFrame,
} from "./live-website-viewer";

test("a valid viewer starts loading and keeps its frame after the slow threshold", () => {
  assert.equal(initialLiveViewerPhase(true), "loading");
  assert.equal(markLiveViewerSlow("loading"), "slow");
  assert.equal(shouldRenderLiveViewerFrame(true), true);
  assert.equal(canRetryLiveViewer("slow"), true);
  assert.match(liveViewerStatusMessage("slow"), /masih dimuat/i);
});

test("slow transition never overwrites a ready or unverified frame", () => {
  assert.equal(markLiveViewerSlow("ready"), "ready");
  assert.equal(markLiveViewerSlow("unverified"), "unverified");
  assert.equal(markLiveViewerReady(true), "ready");
  assert.equal(markLiveViewerUnverified(true), "unverified");
  assert.equal(canRetryLiveViewer("unverified"), true);
  assert.equal(shouldRenderLiveViewerFrame(true), true);
});

test("invalid URL is the only full fallback state", () => {
  assert.equal(initialLiveViewerPhase(false), "invalid");
  assert.equal(shouldRenderLiveViewerFrame(false), false);
  assert.equal(markLiveViewerReady(false), "invalid");
  assert.equal(markLiveViewerUnverified(false), "invalid");
  assert.equal(canRetryLiveViewer("invalid"), false);
  assert.match(liveViewerStatusMessage("invalid"), /URL website belum valid/i);
});
