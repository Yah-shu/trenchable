/** The Studio composer's remembered draft (prompt, model, per-family settings, recent attachments). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRAFT_KEY,
  FILE_LIFE_MS,
  emptyDraft,
  familyKey,
  familySettings,
  hasFiles,
  loadDraft,
  parseDraft,
  restoreChoice,
  saveDraft,
  serializeDraft,
  withFamilySettings,
  withFiles,
} from "../src/lib/client/draft.ts";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

test("junk and missing drafts read as empty", () => {
  assert.deepEqual(parseDraft(null), emptyDraft());
  assert.deepEqual(parseDraft("{not json"), emptyDraft());
  assert.deepEqual(parseDraft("[1,2]"), emptyDraft());
});

test("each family keeps its own settings", () => {
  let d = emptyDraft();
  d = withFamilySettings(d, "kling-3", { aspectRatio: "9:16", duration: 10, variants: 2, generateAudio: true });
  d = withFamilySettings(d, "nano-banana-pro", { aspectRatio: "1:1", resolution: "2K" });
  const back = parseDraft(serializeDraft(d));
  assert.deepEqual(familySettings(back, "kling-3"), { aspectRatio: "9:16", duration: 10, variants: 2, generateAudio: true });
  assert.deepEqual(familySettings(back, "nano-banana-pro"), { aspectRatio: "1:1", resolution: "2K" });
  assert.equal(familySettings(back, "suno"), undefined);
});

test("tiers share their family's key", () => {
  assert.equal(familyKey({ id: "kling-3-pro", family: "kling-3" }), "kling-3");
  assert.equal(familyKey({ id: "suno" }), "suno");
});

test("bad values inside a family are dropped, variants clamped", () => {
  const raw = JSON.stringify({ byFamily: { x: { aspectRatio: 3, variants: 9, settings: { voice: "a", bad: { nested: true } } } } });
  assert.deepEqual(familySettings(parseDraft(raw), "x"), { variants: 4, settings: { voice: "a" } });
});

test("attachments are kept for two days, then dropped", () => {
  const now = 1_800_000_000_000;
  const d = withFiles({ ...emptyDraft(), prompt: "hi" }, { images: [{ url: "https://x/a.png", name: "a.png" }] }, now);
  assert.equal(hasFiles(parseDraft(serializeDraft(d), now + 60_000).files), true);
  const old = parseDraft(serializeDraft(d), now + FILE_LIFE_MS + 1);
  assert.equal(old.files, undefined);
  assert.equal(old.prompt, "hi");
});

test("unchanged files keep their timestamp", () => {
  const files = { refImages: [{ url: "https://x/a.png", name: "a" }] };
  const a = withFiles(emptyDraft(), files, 1000);
  const b = withFiles(a, { refImages: [{ url: "https://x/a.png", name: "a" }] }, 5000);
  assert.equal(b.filesAt, 1000);
  assert.equal(withFiles(a, { refImages: [] }, 5000).filesAt, 5000);
});

test("a remembered choice is used only while the model still offers it", () => {
  assert.equal(restoreChoice("9:16", ["16:9", "9:16"], "16:9"), "9:16");
  assert.equal(restoreChoice("4:3", ["16:9", "9:16"], "16:9"), "16:9");
  assert.equal(restoreChoice(undefined, ["5", "10"], undefined), "5");
  assert.equal(restoreChoice("9:16", undefined, "16:9"), undefined);
});

test("load and save go through the storage under the draft key", () => {
  const store = memory();
  saveDraft(store, { ...emptyDraft(), modelId: "suno", prompt: "a song" });
  assert.ok(store.m.has(DRAFT_KEY));
  const back = loadDraft(store);
  assert.equal(back.modelId, "suno");
  assert.equal(back.prompt, "a song");
  assert.deepEqual(loadDraft(null), emptyDraft());
});
