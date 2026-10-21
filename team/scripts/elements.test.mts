/** Elements: input validation, which pictures are allowed, who may edit, and element_id expansion. */
import assert from "node:assert/strict";
import { test } from "node:test";

const rules = await import("../src/lib/elements-rules.ts");
const { withElementImages, elementIdsOf } = await import("../src/lib/generation-params.ts");
const { models } = await import("../src/config/models.config.ts");

const SB = "https://abc.supabase.co";
const stored = (bucket: string, file: string) => `${SB}/storage/v1/object/public/${bucket}/user-1/${file}`;
const MEDIA_ID = "6f1c2b9e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const VIDEO_ID = "7a2d3c0f-4e5b-4c6d-9e7f-8091a2b3c4d5";
const lookup = new Map([
  [MEDIA_ID, { url: stored("media", "a.png"), type: "image" }],
  [VIDEO_ID, { url: stored("media", "b.mp4"), type: "video" }],
]);

test("create schema: name, kind and 1-12 pictures", () => {
  const ok = rules.elementCreateSchema.safeParse({ name: "  Lead actor ", kind: "character", image_urls: [MEDIA_ID] });
  assert.ok(ok.success);
  assert.equal(ok.data.name, "Lead actor");
  assert.equal(ok.data.cover_index, 0);

  const bad = (v: unknown) => assert.equal(rules.elementCreateSchema.safeParse(v).success, false);
  bad({ name: "", kind: "character", image_urls: [MEDIA_ID] });
  bad({ name: "x".repeat(61), kind: "character", image_urls: [MEDIA_ID] });
  bad({ name: "A", kind: "pet", image_urls: [MEDIA_ID] });
  bad({ name: "A", kind: "style", image_urls: [] });
  bad({ name: "A", kind: "style", image_urls: Array.from({ length: 13 }, (_, i) => stored("media", `${i}.png`)) });
  bad({ name: "A", kind: "style", image_urls: [MEDIA_ID], cover_index: -1 });
});

test("update schema: partial, but not empty", () => {
  assert.ok(rules.elementUpdateSchema.safeParse({ notes: null }).success);
  assert.ok(rules.elementUpdateSchema.safeParse({ cover_index: 2 }).success);
  assert.equal(rules.elementUpdateSchema.safeParse({}).success, false);
  assert.equal(rules.elementUpdateSchema.safeParse({ image_urls: [] }).success, false);
});

test("only image files in this app's storage count as stored", () => {
  assert.ok(rules.isStoredImageUrl(stored("media", "a.png"), SB));
  assert.ok(rules.isStoredImageUrl(stored("generations", "a.webp"), `${SB}/`));
  assert.equal(rules.isStoredImageUrl(stored("media", "a.mp4"), SB), false);
  assert.equal(rules.isStoredImageUrl(stored("private", "a.png"), SB), false);
  assert.equal(rules.isStoredImageUrl("https://other.supabase.co/storage/v1/object/public/media/a.png", SB), false);
  assert.equal(rules.isStoredImageUrl("https://cdn.kie/out.png", SB), false);
  assert.equal(rules.isStoredImageUrl(`${stored("media", "a.png")}?x=1`, SB), false);
  assert.equal(rules.isStoredImageUrl("not a url", SB), false);
});

test("refs resolve media ids and stored URLs in order, without repeats", () => {
  const res = rules.resolveImageRefs([stored("generations", "g.png"), MEDIA_ID, stored("media", "a.png")], SB, lookup);
  assert.deepEqual(res, { ok: true, urls: [stored("generations", "g.png"), stored("media", "a.png")] });
  assert.deepEqual(rules.mediaIdsIn([MEDIA_ID, MEDIA_ID, stored("media", "a.png")]), [MEDIA_ID]);
});

test("refs to unknown media, videos or outside URLs are rejected with a reason each", () => {
  const res = rules.resolveImageRefs(["9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e", VIDEO_ID, "https://example.com/a.png"], SB, lookup);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.errors.length, 3);
    assert.match(res.errors[0], /no Media Library item/);
    assert.match(res.errors[1], /video, not an image/);
    assert.match(res.errors[2], /this app's storage/);
  }
});

test("cover index stays within the pictures", () => {
  assert.equal(rules.clampCover(2, 3), 2);
  assert.equal(rules.clampCover(3, 3), 0);
  assert.equal(rules.clampCover(undefined, 3), 0);
});

test("anyone reads; only the creator or an admin edits", () => {
  const el = { created_by: "u1" };
  assert.ok(rules.canEditElement({ userId: "u1", isAdmin: false }, el));
  assert.ok(rules.canEditElement({ userId: "u2", isAdmin: true }, el));
  assert.equal(rules.canEditElement({ userId: "u2", isAdmin: false }, el), false);
});

test("element_id accepts one id or a list", () => {
  assert.deepEqual(elementIdsOf({ element_id: " a " }), ["a"]);
  assert.deepEqual(elementIdsOf({ element_id: ["a", "b", "a", 3] }), ["a", "b"]);
  assert.deepEqual(elementIdsOf({}), []);
});

test("element pictures go where the model reads reference images", () => {
  const urls = [stored("media", "a.png"), stored("media", "b.png")];
  const imageModel = models.find((m) => m.mediaType === "image" && (m.options.maxImages ?? 0) >= 3 && !m.options.references?.frames)!;
  const r1 = withElementImages(imageModel, { prompt: "x", element_id: "e1", image_urls: [stored("media", "own.png")] }, urls);
  assert.ok(r1.ok);
  if (r1.ok) {
    assert.deepEqual(r1.params.image_urls, [stored("media", "own.png"), ...urls]);
    assert.equal("element_id" in r1.params, false);
  }

  const refVideo = models.find((m) => m.mediaType === "video" && (m.options.references?.images?.max ?? 0) > 0)!;
  const r2 = withElementImages(refVideo, { prompt: "x", element_id: "e1" }, urls);
  assert.ok(r2.ok);
  if (r2.ok) assert.deepEqual(r2.params.reference_image_urls, urls);

  const audio = models.find((m) => m.mediaType === "audio")!;
  assert.equal(withElementImages(audio, { prompt: "x", element_id: "e1" }, urls).ok, false);
});
