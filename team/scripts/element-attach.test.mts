/** Saved elements in the composer: which models take them, picture order, and @mention numbering after attaching. */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

// The form rules import the settings component for two pure helpers; skip loading React for them.
mock.module("../src/components/studio/settings-fields.tsx", {
  namedExports: { reconcileSettings: (s: Record<string, unknown>) => ({ ...s }), settingsForRequest: () => undefined },
});

const { elementTarget, elementBlockedReason, picturesInOrder, mentionName, matchesSearch } = await import("../src/lib/client/elements.ts");
const { getModel, models } = await import("../src/config/models.config.ts");
const form = await import("../src/components/studio/form.ts");

const model = (id: string) => {
  const m = getModel(id);
  assert.ok(m, `model ${id} exists`);
  return m;
};

test("every model gets a target, and a reason whenever it can't take an element", () => {
  for (const m of models) {
    const t = elementTarget(m);
    if (t.kind === "none") assert.ok(t.reason.length > 10, m.id);
    else assert.ok(t.max >= 1, m.id);
  }
  assert.equal(elementTarget(model("nano-banana-pro")).kind, "images");
  assert.equal(elementTarget(model("seedance-2-fast")).kind, "references");
  assert.equal(elementTarget(model("kling-3-pro")).kind, "named");
  assert.equal(elementTarget(model("topaz-video-upscale")).kind, "none");
});

test("named elements need their minimum number of pictures", () => {
  const t = elementTarget(model("kling-3-pro"));
  assert.equal(t.kind, "named");
  assert.match(elementBlockedReason(t, 1) ?? "", /at least 2/);
  assert.equal(elementBlockedReason(t, 2), null);
  assert.equal(elementBlockedReason({ kind: "references", max: 9 }, 1), null);
});

test("the cover goes first, the rest keep their order", () => {
  assert.deepEqual(picturesInOrder({ image_urls: ["a", "b", "c"], cover_index: 2 }), ["c", "a", "b"]);
  assert.deepEqual(picturesInOrder({ image_urls: ["a", "b"], cover_index: 9 }), ["a", "b"]);
  assert.deepEqual(picturesInOrder({ image_urls: [], cover_index: 0 }), []);
});

test("mention names and search", () => {
  assert.equal(mentionName("Lead presenter #2"), "lead_presenter_2");
  assert.equal(mentionName("  ***  "), "element");
  const el = { name: "Amber bottle", notes: "glass, cork", kind: "product" as const, creator: { display_name: "Editor Two" } };
  assert.ok(matchesSearch(el, "AMBER"));
  assert.ok(matchesSearch(el, "cork"));
  assert.ok(matchesSearch(el, "products".slice(0, 7)));
  assert.ok(matchesSearch(el, "editor two"));
  assert.ok(!matchesSearch(el, "presenter"));
});

test("element pictures attached as references keep @image numbers in step", () => {
  const seedance = model("seedance-2-fast");
  let s = form.reconcile(form.initialState(), seedance);
  s = { ...s, refMode: "references" as const, refImages: [{ url: "https://x/own.png", name: "own" }] };
  for (const url of ["https://x/el-1.png", "https://x/el-2.png"]) {
    const r = form.addFile(s, seedance, "image", { url, name: url });
    assert.ok("next" in r);
    s = r.next;
  }
  assert.deepEqual(form.mentionCounts(s, seedance), { image: 3, video: 0, audio: 0 });
  const items = form.stripItems(s, seedance);
  assert.deepEqual(items.map((i) => i.badge), ["1", "2", "3"]);
  assert.equal(items[2].title, "Image 3 · @image3");
});

test("a frames/references model switches to references for an element, never dropping a frame", () => {
  const seedance = model("seedance-2-fast");
  const base = { ...form.reconcile(form.initialState(), seedance), refMode: "frames" as const };
  const empty = form.readyForReferences(base, seedance);
  assert.ok("next" in empty && empty.next.refMode === "references");
  const withFrame = form.readyForReferences({ ...base, frames: [{ url: "https://x/start.png", name: "start" }] }, seedance);
  assert.ok("error" in withFrame);
  const nano = model("nano-banana-pro");
  const plain = form.readyForReferences(form.reconcile(form.initialState(), nano), nano);
  assert.ok("next" in plain);
});
