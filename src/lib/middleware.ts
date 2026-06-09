import { NextFunction, Request, Response } from "express";
import MagicLink from "../models/MagicLink.js";
import { getConfig } from "../lib/config.js";
import { merge as deepMerge } from "ts-deepmerge";
import crypto from "node:crypto";

export const checkMagicLink = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const config = getConfig();
  if (!config.general.creator_email_addresses?.length) {
    // No creator email addresses are configured, so skip the magic link check
    return next();
  }
  if (!req.body.magicLinkToken) {
    return res.status(400).json({
      errors: [
        {
          message: "No magic link token was provided.",
        },
      ],
    });
  }
  if (!req.body.creatorEmail) {
    return res.status(400).json({
      errors: [
        {
          message: "No creator email was provided.",
        },
      ],
    });
  }
  const magicLink = await MagicLink.findOne({
    token: req.body.magicLinkToken,
    email: req.body.creatorEmail,
    expiryTime: { $gt: new Date() },
    permittedActions: "createEvent",
  });
  if (!magicLink || magicLink.email !== req.body.creatorEmail) {
    return res.status(400).json({
      errors: [
        {
          message:
            "Magic link is invalid or has expired. Get a new one <a href='/new'>here</a>.",
        },
      ],
    });
  }
  next();
};

const hashKey = (key: string) =>
  crypto.createHash("sha256").update(key).digest("hex");

/**
 * Checks for a valid API key in the Authorization: Bearer header.
 * Returns true and calls next() if valid; returns false otherwise (does not call next).
 */
const tryApiKey = (
  req: Request,
  res: Response,
  next: NextFunction,
): boolean => {
  const config = getConfig();
  if (!config.api_keys?.length) return false;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  const hashed = hashKey(provided);
  const match = config.api_keys.find((k) => k.hashed_key === hashed);
  if (!match) {
    res.status(401).json({ errors: [{ message: "Invalid API key." }] });
    return true; // we handled it (with a rejection)
  }

  next();
  return true;
};

/**
 * Auth middleware that accepts either a valid API key (Authorization: Bearer)
 * or a valid magic link token in the request body.
 * Falls through to no-auth if neither creator_email_addresses nor api_keys are configured.
 */
export const checkAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const config = getConfig();
  const hasApiKeys = !!config.api_keys?.length;
  const hasMagicLinks = !!config.general.creator_email_addresses?.length;

  if (!hasApiKeys && !hasMagicLinks) return next();

  // API key takes priority if the header is present
  if (req.headers.authorization) {
    tryApiKey(req, res, next);
    return;
  }

  // Admin magic link with editAnyEvent permission bypasses creator auth
  if (req.body.adminMagicLinkToken && req.body.adminEmail) {
    const adminLink = await MagicLink.findOne({
      token: req.body.adminMagicLinkToken,
      email: req.body.adminEmail,
      expiryTime: { $gt: new Date() },
      permittedActions: "editAnyEvent",
    });
    if (adminLink) return next();
  }

  // Fall back to magic link validation
  if (!hasMagicLinks) {
    return res.status(401).json({
      errors: [
        {
          message:
            "Authentication required. Provide an API key via Authorization: Bearer header.",
        },
      ],
    });
  }

  if (!req.body.magicLinkToken) {
    return res
      .status(400)
      .json({ errors: [{ message: "No magic link token was provided." }] });
  }
  if (!req.body.creatorEmail) {
    return res
      .status(400)
      .json({ errors: [{ message: "No creator email was provided." }] });
  }
  const magicLink = await MagicLink.findOne({
    token: req.body.magicLinkToken,
    email: req.body.creatorEmail,
    expiryTime: { $gt: new Date() },
    permittedActions: "createEvent",
  });
  if (!magicLink || magicLink.email !== req.body.creatorEmail) {
    return res.status(400).json({
      errors: [
        {
          message:
            "Magic link is invalid or has expired. Get a new one <a href='/new'>here</a>.",
        },
      ],
    });
  }
  next();
};

// Route-specific middleware which injects the config into the request object
// It can also be used to modify the config based on the request, which
// we use for Cypress testing.
export const getConfigMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const config = getConfig();
  if (process.env.CYPRESS === "true" && req.cookies?.cypressConfigOverride) {
    console.log("Overriding config with Cypress config");
    const override = JSON.parse(req.cookies.cypressConfigOverride);
    res.locals.config = deepMerge(config, override);
    return next();
  }
  res.locals.config = config;
  return next();
};
