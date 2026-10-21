/** API keys: the `tt_` prefix, what counts as a key, and the hashed form. */
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.API_SECRET_SALT ??= "test-salt";
const { generateApiKey, hashApiKey, looksLikeApiKey } = await import("../src/lib/api-keys.ts");

test("new keys start with tt_ and keep a short display prefix", () => {
  const { key, hash, prefix } = generateApiKey();
  assert.ok(key.startsWith("tt_"));
  assert.equal(prefix, key.slice(0, 9));
  assert.equal(hash, hashApiKey(key));
  assert.notEqual(hash, hashApiKey(`${key}x`));
});

test("only tt_ keys of a real length look like keys", () => {
  assert.ok(looksLikeApiKey(generateApiKey().key));
  assert.equal(looksLikeApiKey("tt_short"), false);
  assert.equal(looksLikeApiKey(`xx_${"a".repeat(43)}`), false);
});
