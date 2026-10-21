/** The Studio feed's row layout, its remembered prefs and the cost tag. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { getModel } from "../src/config/models.config";
import { estimateCost } from "../src/lib/generation-params";
import { costTag, formatCredits, formatDollars, modelPriceTag } from "../src/lib/client/cost.ts";
import { activeFilterCount, parseFeedPrefs, SIZE_MAX } from "../src/lib/client/feed-prefs.ts";
import { fixedRows, parseAspect, placeRows, rowsFor } from "../src/lib/client/justified.ts";

test("justified rows fill the width exactly", () => {
  const rows = rowsFor([1, 1, 0.75, 16 / 9, 1, 1, 1, 1], 1000, 250, 8);
  assert.ok(rows.length >= 2);
  const { boxes } = placeRows(rows, 8);
  for (const row of rows.slice(0, -1)) {
    const last = boxes.find((b) => b.index === row[row.length - 1].index)!;
    assert.ok(Math.abs(last.x + last.width - 1000) <= 1, `row ends at ${last.x + last.width}`);
  }
  assert.deepEqual(rowsFor([], 1000, 250), []);
});

test("phones get two tiles a row", () => {
  const rows = fixedRows([1, 1, 1, 0.5, 1], 390, 2, 8);
  assert.deepEqual(rows.map((r) => r.length), [2, 2, 1]);
});

test("aspect strings", () => {
  assert.equal(parseAspect("16:9"), 16 / 9);
  assert.equal(parseAspect("9x16"), 9 / 16);
  assert.equal(parseAspect("auto"), null);
});

test("feed prefs survive junk and count filters", () => {
  const p = parseFeedPrefs(JSON.stringify({ filters: { model: "suno", media_type: "gif", from: "2026-01-01", to: "x", sort: "cost" }, size: 9999 }));
  assert.deepEqual(p.filters, { model: "suno", media_type: "", user_id: "", from: "2026-01-01", to: "", sort: "cost" });
  assert.equal(p.size, SIZE_MAX);
  assert.equal(activeFilterCount(p.filters), 2);
  assert.equal(parseFeedPrefs("nope").filters.sort, "newest");
});

test("Kie models show credits and dollars; direct providers dollars only", () => {
  const kie = getModel("nano-banana-pro")!;
  const tag = costTag(kie, estimateCost(kie, { resolution: kie.options.defaultResolution }, 1));
  assert.match(tag.label ?? "", /^≈ [\d.,]+ cr · \$[\d.]+$/);
  const tts = getModel("elevenlabs-v3")!;
  const speech = costTag(tts, estimateCost(tts, { prompt: "Hello there, this is a test." }, 1));
  assert.match(speech.label ?? "", /^≈ \$[\d.]+$/);
  assert.equal(costTag(tts, estimateCost(tts, { prompt: "" }, 1)).label, null);
  assert.match(modelPriceTag(kie).main, /cr/);
  assert.doesNotMatch(modelPriceTag(tts).main, /cr/);
});

test("number formats", () => {
  assert.equal(formatCredits(140.2), "140");
  assert.equal(formatCredits(6.84), "6.8");
  assert.equal(formatDollars(0.7), "$0.70");
  assert.equal(formatDollars(0.034), "$0.034");
  assert.equal(formatDollars(12.4), "$12.40");
});
