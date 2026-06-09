#!/usr/bin/env node
/**
 * Gathio MCP Server
 *
 * Exposes a gathio instance as agent tools so Claude (and other MCP clients)
 * can create and manage events programmatically.
 *
 * Configuration (environment variables):
 *   GATHIO_URL      Base URL of your gathio instance (e.g. https://gath.io)
 *   GATHIO_API_KEY  API key generated with: npx tsx scripts/generate-api-key.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Configuration ─────────────────────────────────────────────────────────────

const GATHIO_URL = (process.env.GATHIO_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const GATHIO_API_KEY = process.env.GATHIO_API_KEY ?? "";

if (!GATHIO_API_KEY) {
  process.stderr.write(
    "[gathio-mcp] WARNING: GATHIO_API_KEY is not set. " +
      "Requests will fail unless your instance allows open access.\n",
  );
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type JsonBody = Record<string, unknown>;

async function gathioPost(
  path: string,
  body: JsonBody,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${GATHIO_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(GATHIO_API_KEY ? { Authorization: `Bearer ${GATHIO_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  return { ok: res.ok || res.status === 302, status: res.status, data };
}

async function gathioGet(
  path: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${GATHIO_URL}${path}`, {
    method: "GET",
    headers: {
      ...(GATHIO_API_KEY ? { Authorization: `Bearer ${GATHIO_API_KEY}` } : {}),
    },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  return { ok: res.ok, status: res.status, data };
}

function errorText(data: unknown): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string") return d.error;
    if (Array.isArray(d.errors)) {
      return d.errors
        .map((e: unknown) => (typeof e === "object" && e !== null ? (e as Record<string, unknown>).message : String(e)))
        .join("; ");
    }
  }
  return String(data);
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "gathio",
  version: "0.1.0",
});

// ── Tool: create_event ────────────────────────────────────────────────────────

server.tool(
  "create_event",
  "Create a one-off event on the configured gathio instance. Returns the event ID, edit token, and URL.",
  {
    eventName: z.string().describe("Event title"),
    eventLocation: z.string().optional().describe("Physical or virtual location"),
    eventStart: z.string().describe("Start date/time in ISO 8601 or 'YYYY-MM-DDTHH:mm' format"),
    eventEnd: z.string().describe("End date/time in ISO 8601 or 'YYYY-MM-DDTHH:mm' format"),
    timezone: z.string().describe("IANA timezone, e.g. 'America/Los_Angeles'"),
    eventDescription: z.string().optional().describe("Event description (Markdown supported)"),
    creatorEmail: z.string().optional().describe("Organiser email address for magic-link editing"),
    hostName: z.string().optional().describe("Display name of the event host"),
    maxAttendees: z.number().int().positive().optional().describe("Capacity limit (omit for unlimited)"),
    showOnPublicList: z.boolean().optional().describe("List on the public events page"),
    groupID: z.string().optional().describe("Attach to an existing group by ID"),
    groupEditToken: z.string().optional().describe("Edit token of the group (required when groupID is given)"),
  },
  async (args) => {
    const body: JsonBody = {
      eventName: args.eventName,
      eventStart: args.eventStart,
      eventEnd: args.eventEnd,
      timezone: args.timezone,
    };
    if (args.eventLocation) body.eventLocation = args.eventLocation;
    if (args.eventDescription) body.eventDescription = args.eventDescription;
    if (args.creatorEmail) body.creatorEmail = args.creatorEmail;
    if (args.hostName) body.hostName = args.hostName;
    if (args.maxAttendees) body.maxAttendees = String(args.maxAttendees);
    if (args.showOnPublicList) body.showOnPublicList = "1";
    if (args.groupID) {
      body.eventGroupBoolean = "true";
      body.eventGroupID = args.groupID;
      if (args.groupEditToken) body.eventGroupEditToken = args.groupEditToken;
    }

    const { ok, status, data } = await gathioPost("/event", body);
    if (!ok) {
      return {
        content: [{ type: "text", text: `Error ${status}: ${errorText(data)}` }],
        isError: true,
      };
    }
    const d = data as { eventID: string; editToken: string; url: string };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            eventID: d.eventID,
            editToken: d.editToken,
            url: `${GATHIO_URL}${d.url}`,
          }),
        },
      ],
    };
  },
);

// ── Tool: create_group ────────────────────────────────────────────────────────

server.tool(
  "create_group",
  "Create an event group (series container) without recurrence. Returns the group ID, edit token, and URL.",
  {
    groupName: z.string().describe("Group / series name"),
    groupDescription: z.string().describe("Description (Markdown supported)"),
    creatorEmail: z.string().optional().describe("Organiser email"),
    hostName: z.string().optional().describe("Host display name"),
    showOnPublicList: z.boolean().optional().describe("Show on the public events page"),
  },
  async (args) => {
    const body: JsonBody = { eventGroupName: args.groupName, eventGroupDescription: args.groupDescription };
    if (args.creatorEmail) body.creatorEmail = args.creatorEmail;
    if (args.hostName) body.hostName = args.hostName;
    if (args.showOnPublicList) body.showOnPublicList = "1";

    const { ok, status, data } = await gathioPost("/group", body);
    if (!ok) {
      return {
        content: [{ type: "text", text: `Error ${status}: ${errorText(data)}` }],
        isError: true,
      };
    }
    const d = data as { id: string; editToken: string; url: string };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            groupID: d.id,
            editToken: d.editToken,
            url: `${GATHIO_URL}${d.url}`,
          }),
        },
      ],
    };
  },
);

// ── Tool: create_recurring_series ─────────────────────────────────────────────

server.tool(
  "create_recurring_series",
  "Create a recurring event. The provided date/time is the first occurrence; gathio automatically generates future instances 90 days in advance. Returns the event ID, edit token, and URL.",
  {
    eventName: z.string().describe("Event title"),
    eventLocation: z.string().describe("Physical or virtual location"),
    eventStart: z.string().describe("First occurrence start in 'YYYY-MM-DDTHH:mm' format"),
    eventEnd: z.string().describe("First occurrence end in 'YYYY-MM-DDTHH:mm' format"),
    timezone: z.string().describe("IANA timezone, e.g. 'America/Los_Angeles'"),
    eventDescription: z.string().describe("Description (Markdown supported)"),
    creatorEmail: z.string().optional().describe("Organiser email"),
    hostName: z.string().optional().describe("Host display name"),
    showOnPublicList: z.boolean().optional().describe("Show on the public events page"),
    // Recurrence fields
    recurrenceFrequency: z
      .enum(["weekly", "biweekly", "monthly"])
      .describe("How often the event repeats"),
    recurrenceDayOfWeek: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe("Day of week (0=Sun … 6=Sat). Required for weekly/biweekly and monthly nth-weekday."),
    recurrenceMonthlyType: z
      .enum(["day-of-month", "nth-weekday"])
      .optional()
      .describe("For monthly frequency: repeat on the same date each month, or on the Nth weekday."),
    recurrenceDayOfMonth: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe("Day of month (1–31). Required for monthly day-of-month."),
    recurrenceNth: z
      .union([z.literal(-1), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
      .optional()
      .describe("Which occurrence of the weekday in the month: 1=first, 2=second, 3=third, 4=fourth, -1=last. Required for monthly nth-weekday."),
    recurrenceTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .describe("Recurring start time in HH:MM format (should match the time in eventStart)"),
    recurrenceDurationMinutes: z
      .number()
      .int()
      .min(1)
      .describe("Event duration in minutes"),
    recurrenceTimezone: z.string().describe("IANA timezone for the recurrence (should match timezone)"),
  },
  async (args) => {
    const body: JsonBody = {
      eventName: args.eventName,
      eventLocation: args.eventLocation,
      eventStart: args.eventStart,
      eventEnd: args.eventEnd,
      timezone: args.timezone,
      eventDescription: args.eventDescription,
      recurrenceEnabled: "true",
      recurrenceFrequency: args.recurrenceFrequency,
      recurrenceTime: args.recurrenceTime,
      recurrenceDurationMinutes: String(args.recurrenceDurationMinutes),
      recurrenceTimezone: args.recurrenceTimezone,
    };
    if (args.creatorEmail) body.creatorEmail = args.creatorEmail;
    if (args.hostName) body.hostName = args.hostName;
    if (args.showOnPublicList) body.publicCheckbox = "true";
    if (args.recurrenceDayOfWeek !== undefined)
      body.recurrenceDayOfWeek = String(args.recurrenceDayOfWeek);
    if (args.recurrenceMonthlyType)
      body.recurrenceMonthlyType = args.recurrenceMonthlyType;
    if (args.recurrenceDayOfMonth !== undefined)
      body.recurrenceDayOfMonth = String(args.recurrenceDayOfMonth);
    if (args.recurrenceNth !== undefined)
      body.recurrenceNth = String(args.recurrenceNth);
    if (args.recurrenceMonthlyType === "nth-weekday" && args.recurrenceDayOfWeek !== undefined)
      body.recurrenceNthDayOfWeek = String(args.recurrenceDayOfWeek);

    const { ok, status, data } = await gathioPost("/event", body);
    if (!ok) {
      return {
        content: [{ type: "text", text: `Error ${status}: ${errorText(data)}` }],
        isError: true,
      };
    }
    const d = data as { eventID: string; editToken: string; url: string };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            eventID: d.eventID,
            editToken: d.editToken,
            url: `${GATHIO_URL}${d.url}`,
            note: "This is the first occurrence. Future instances will be generated automatically within 90 days.",
          }),
        },
      ],
    };
  },
);

// ── Tool: list_events ─────────────────────────────────────────────────────────

server.tool(
  "list_events",
  "List upcoming events on this gathio instance. Optionally filter by group ID.",
  {
    groupID: z
      .string()
      .optional()
      .describe("Return only events belonging to this group ID"),
    includePast: z
      .boolean()
      .optional()
      .describe("Include events that have already ended (default: false)"),
  },
  async (args) => {
    const qs = new URLSearchParams();
    if (args.groupID) qs.set("group", args.groupID);
    if (args.includePast) qs.set("includePast", "1");
    const path = `/api/events${qs.size ? `?${qs}` : ""}`;

    const { ok, status, data } = await gathioGet(path);
    if (!ok) {
      return {
        content: [{ type: "text", text: `Error ${status}: ${errorText(data)}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
    };
  },
);

// ── Tool: get_event ───────────────────────────────────────────────────────────

server.tool(
  "get_event",
  "Get details for a specific event by its ID.",
  {
    eventID: z.string().describe("The event ID (short alphanumeric slug)"),
  },
  async (args) => {
    const { ok, status, data } = await gathioGet(
      `/api/event/${args.eventID}`,
    );
    if (!ok) {
      return {
        content: [{ type: "text", text: `Error ${status}: ${errorText(data)}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
    };
  },
);

// ── Tool: cancel_event ────────────────────────────────────────────────────────

server.tool(
  "cancel_event",
  "Cancel (delete) an event. Requires the event's edit token.",
  {
    eventID: z.string().describe("The event ID to cancel"),
    editToken: z
      .string()
      .describe(
        "Edit token for the event — returned when the event was created, or visible in the event URL as the 'e' query parameter",
      ),
  },
  async (args) => {
    const { ok, status, data } = await gathioPost(
      `/deleteevent/${args.eventID}/${args.editToken}`,
      {},
    );
    if (!ok) {
      return {
        content: [{ type: "text", text: `Error ${status}: ${errorText(data)}` }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, eventID: args.eventID }),
        },
      ],
    };
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
