# API Keys

API keys allow scripts and agents to create events and groups programmatically,
without going through the magic link flow. This is useful for automation, bots,
or integrations like the [MCP server](../../mcp-server).

## Generating a key

Run the helper script from the project root:

```bash
npx tsx scripts/generate-api-key.ts my-label
```

This prints a random key and the TOML snippet to add to your config:

```
API key generated for: my-label

Key (keep secret, use as Bearer token):
  a3f2c1...

Add to config.toml:

  [[api_keys]]
  label = "my-label"
  hashed_key = "e3b0c4..."
```

The **key** is the secret you'll pass in requests. The **hashed_key** is what
gets stored in config — Gathio never stores or logs the raw key.

## Adding the key to config

Paste the printed snippet into `config/config.toml`. You can add as many keys
as you like, each as its own `[[api_keys]]` block:

```toml
[[api_keys]]
label = "scheduling-bot"
hashed_key = "e3b0c44298fc1c149afbf4c8996fb924..."

[[api_keys]]
label = "mcp-server"
hashed_key = "2cf24dba5fb0a30e26e83b2ac5b9e29e..."
```

Restart Gathio after editing the config for the keys to take effect.

## Using a key in requests

Pass the key as a Bearer token in the `Authorization` header:

```bash
curl -X POST https://your-instance/event \
  -H "Authorization: Bearer a3f2c1..." \
  -F "eventName=Weekly Meetup" \
  -F "eventLocation=The Usual Spot" \
  -F "eventStart=2026-09-01T18:00" \
  -F "eventEnd=2026-09-01T20:00" \
  -F "timezone=America/Los_Angeles" \
  -F "eventDescription=See you there."
```

Or with JSON (`Content-Type: application/json`):

```bash
curl -X POST https://your-instance/event \
  -H "Authorization: Bearer a3f2c1..." \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "Weekly Meetup",
    "eventLocation": "The Usual Spot",
    "eventStart": "2026-09-01T18:00",
    "eventEnd": "2026-09-01T20:00",
    "timezone": "America/Los_Angeles",
    "eventDescription": "See you there."
  }'
```

A successful response returns the event ID, edit token, and URL:

```json
{
  "id": "abc123",
  "editToken": "xyz...",
  "url": "/event/abc123?e=xyz..."
}
```

## How auth is resolved

When a request arrives at a creation endpoint, Gathio checks in this order:

1. **API key** — if an `Authorization: Bearer` header is present, it is hashed
   and checked against the `[[api_keys]]` list in config. A match grants access;
   a mismatch returns `401 Unauthorized`.

2. **Magic link** — if no `Authorization` header is present and
   `creator_email_addresses` is configured, a valid `magicLinkToken` + `creatorEmail`
   in the request body is required.

3. **Open access** — if neither `api_keys` nor `creator_email_addresses` are
   configured, creation is unrestricted (default for new installs).

## Security notes

- Store keys in environment variables, not in source code:
  ```toml
  [[api_keys]]
  label = "bot"
  hashed_key = "${GATHIO_BOT_API_KEY_HASH}"
  ```
- Rotate a compromised key by removing its `[[api_keys]]` block from config and
  generating a new one with the script.
- Keys grant full create access. If you need finer-grained permissions, see
  [Scoped API Keys](../../using-gathio/scoped-api-keys) (coming in a future release).
