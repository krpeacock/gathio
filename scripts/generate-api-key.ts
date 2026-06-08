/**
 * Generates a random API key and prints the key + its SHA-256 hash.
 *
 * Usage:
 *   npx tsx scripts/generate-api-key.ts [label]
 *
 * Add the output to config.toml:
 *   [[api_keys]]
 *   label = "my-bot"
 *   hashed_key = "<printed hash>"
 *
 * Pass the printed key as the Bearer token in requests:
 *   Authorization: Bearer <printed key>
 */

import crypto from "node:crypto";

const label = process.argv[2] || "api-key";
const key = crypto.randomBytes(32).toString("hex");
const hash = crypto.createHash("sha256").update(key).digest("hex");

console.log(`\nAPI key generated for: ${label}`);
console.log(`\nKey (keep secret, use as Bearer token):\n  ${key}`);
console.log(`\nAdd to config.toml:\n`);
console.log(`  [[api_keys]]`);
console.log(`  label = "${label}"`);
console.log(`  hashed_key = "${hash}"\n`);
