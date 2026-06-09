# MCP Server

The `packages/mcp-server` package exposes your gathio instance as a set of
[Model Context Protocol](https://modelcontextprotocol.io/) tools, so AI agents
(Claude, Claude Code, any MCP-compatible client) can create and manage events
programmatically.

## Prerequisites

- A running gathio instance (local or hosted)
- An [API key](../running-gathio/api-keys.md) configured in `config/config.toml`
- Node 22+

## Installation

The package is a standalone Node.js binary. Build it once from the repo root:

```bash
cd packages/mcp-server
pnpm install
pnpm run build
```

This produces `packages/mcp-server/dist/index.js`.

## Configuration

The server is configured entirely through environment variables:

| Variable         | Required | Description                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `GATHIO_URL`     | Yes      | Base URL of your gathio instance, e.g. `https://events.example.com`                    |
| `GATHIO_API_KEY` | Yes\*    | Raw API key (the secret, not the hash). See [API Keys](../running-gathio/api-keys.md). |

\*Required if your instance has `api_keys` or `creator_email_addresses` configured. Safe to omit on a fully open dev instance.

## Connecting to Claude Desktop

Add an entry to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gathio": {
      "command": "node",
      "args": ["/absolute/path/to/gathio/packages/mcp-server/dist/index.js"],
      "env": {
        "GATHIO_URL": "https://events.example.com",
        "GATHIO_API_KEY": "your-raw-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. The tools will appear under the hammer icon.

## Connecting to Claude Code

Add the same block to your Claude Code MCP config (usually `~/.claude/claude_code_config.json`), or run interactively with:

```bash
GATHIO_URL=https://events.example.com \
GATHIO_API_KEY=your-raw-key \
node packages/mcp-server/dist/index.js
```

## Available tools

### `create_event`

Create a one-off event. Returns `{ eventID, editToken, url }`.

Required fields: `eventName`, `eventStart`, `eventEnd`, `timezone`

Optional fields: `eventLocation`, `eventDescription`, `creatorEmail`, `hostName`, `maxAttendees`, `showOnPublicList`, `groupID`, `groupEditToken`

Example prompt:

> "Create an event called 'Board Game Night' at The Usual Spot on Friday June 20th from 7pm to 10pm Pacific."

### `create_group`

Create an event group (a container for related events) without a recurrence rule. Returns `{ groupID, editToken, url }`.

Required: `groupName`

### `create_recurring_series`

Create an event group with a recurrence rule. Gathio generates individual event instances automatically (up to 90 days in advance). Returns `{ groupID, editToken, url }`.

Required: `groupName`, `recurrenceFrequency`, `recurrenceTime`, `recurrenceDurationMinutes`, `recurrenceTimezone`

Frequency options and required additional fields:

| `recurrenceFrequency`  | Additional required fields                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `weekly`               | `recurrenceDayOfWeek` (0=Sun … 6=Sat)                                                               |
| `biweekly`             | `recurrenceDayOfWeek`                                                                               |
| `monthly` day-of-month | `recurrenceMonthlyType: "day-of-month"`, `recurrenceDayOfMonth`                                     |
| `monthly` nth-weekday  | `recurrenceMonthlyType: "nth-weekday"`, `recurrenceDayOfWeek`, `recurrenceNth` (1–4 or -1 for last) |

Example prompt:

> "Set up a recurring 'Weekly Standup' every Tuesday at 9am Pacific for 30 minutes."

### `list_events`

List upcoming events. Optional filters: `groupID`, `includePast`.

### `get_event`

Get full details for a single event by ID.

### `cancel_event`

Delete an event. Requires the `editToken` that was returned when the event was created.

## Security

- The `GATHIO_API_KEY` value is the **raw secret** (not the hash). Keep it out of source control.
- All six tools require a valid API key if your gathio instance has any `[[api_keys]]` configured.
- Edit tokens are not stored by the MCP server — the agent must remember them (or retrieve them via `get_event`) to cancel events later.
