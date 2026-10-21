/** The Studio prompt's @image1 / @video1 / @audio1 tokens. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { countKinds, hasMissingMentions, insertToken, mentionsIn, nextFreeToken, promptSegments, renumberAfterRemoval } from "../src/lib/client/mentions.ts";

test("segments join back to the exact prompt and mark missing references", () => {
  const prompt = "Put @image1 on the shelf next to @Image3, with the beat from @audio1.";
  const segs = promptSegments(prompt, { image: 2, audio: 1 });
  assert.equal(segs.map((s) => s.text).join(""), prompt);
  const refs = segs.filter((s) => s.ref).map((s) => s.ref);
  assert.deepEqual(refs, [
    { kind: "image", n: 1, attached: true },
    { kind: "image", n: 3, attached: false },
    { kind: "audio", n: 1, attached: true },
  ]);
  assert.equal(hasMissingMentions(prompt, { image: 2, audio: 1 }), true);
  assert.equal(hasMissingMentions(prompt, { image: 3, audio: 1 }), false);
});

test("addresses and longer words are not mentions", () => {
  assert.deepEqual(mentionsIn("mail me at team@image1 or @image1x"), []);
  assert.deepEqual(mentionsIn("(@video2), @audio10."), [
    { kind: "video", n: 2 },
    { kind: "audio", n: 10 },
  ]);
  assert.deepEqual(promptSegments("", { image: 1 }), []);
});

test("the next free token skips the ones already used, images first", () => {
  assert.equal(nextFreeToken("", {}), null);
  assert.equal(nextFreeToken("a cat", { image: 2 }), "@image1");
  assert.equal(nextFreeToken("@image1 and @image2", { image: 2, video: 1 }), "@video1");
  assert.equal(nextFreeToken("@image1 @video1", { image: 1, video: 1 }), null);
});

test("inserting a token adds spaces only where needed and puts the caret after it", () => {
  assert.deepEqual(insertToken("", "@image1", null), { next: "@image1 ", cursor: 8 });
  assert.deepEqual(insertToken("a cat", "@image1", null), { next: "a cat @image1 ", cursor: 14 });
  assert.deepEqual(insertToken("a cat on a mat", "@image2", 5), { next: "a cat @image2 on a mat", cursor: 14 });
  assert.deepEqual(insertToken("a cat ", "@image1", 6), { next: "a cat @image1 ", cursor: 14 });
});

test("removing a reference moves the later numbers of that kind down", () => {
  assert.equal(renumberAfterRemoval("@image1 then @image3 and @Image2, @video2", "image", 1), "@image1 then @image2 and @Image1, @video2");
  assert.equal(renumberAfterRemoval("no tokens here", "audio", 1), "no tokens here");
});

test("counting kinds", () => {
  assert.deepEqual(countKinds(["image", "video", "image"]), { image: 2, video: 1 });
});
