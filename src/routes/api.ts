import { Router, type Request, type Response } from "express";
import Event from "../models/Event.js";
import EventGroup from "../models/EventGroup.js";
import { checkAuth } from "../lib/middleware.js";
import { generateRecurringEvents } from "../lib/recurrence.js";

const router = Router();

// GET /api/event/:eventID — return a single event as JSON
router.get(
  "/api/event/:eventID",
  checkAuth,
  async (req: Request, res: Response): Promise<void> => {
    const event = await Event.findOne({ id: req.params.eventID }).lean();
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    // Omit sensitive fields
    const { editToken, editPassword, viewPassword, privateKey, ...safe } =
      event as Record<string, unknown>;
    void editToken;
    void editPassword;
    void viewPassword;
    void privateKey;
    res.json(safe);
  },
);

// GET /api/events — return a list of events as JSON
// Query params:
//   group=<groupID>   — filter to a specific event group
//   includePast=1     — include events whose end time is in the past
router.get(
  "/api/events",
  checkAuth,
  async (req: Request, res: Response): Promise<void> => {
    const includePast = req.query.includePast === "1";
    const filter: Record<string, unknown> = {};

    if (req.query.group) {
      const group = await EventGroup.findOne({
        id: req.query.group as string,
      }).lean();
      if (!group) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      filter.eventGroup = (group as Record<string, unknown>)._id;
    }

    if (!includePast) {
      filter.end = { $gte: new Date() };
    }

    const events = await Event.find(filter).sort({ start: 1 }).lean();

    const sanitized = events.map((ev) => {
      const { editToken, editPassword, viewPassword, privateKey, ...safe } =
        ev as Record<string, unknown>;
      void editToken;
      void editPassword;
      void viewPassword;
      void privateKey;
      return safe;
    });

    res.json(sanitized);
  },
);

// POST /api/recurrence/generate — manually trigger recurring event generation
router.post(
  "/api/recurrence/generate",
  checkAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await generateRecurringEvents();
      const count = await Event.countDocuments({ start: { $gte: new Date() } });
      res.json({ success: true, upcomingEvents: count });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

export default router;
