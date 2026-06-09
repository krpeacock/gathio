import { Router, Request, Response } from "express";
import { frontendConfig } from "../lib/config.js";
import { generateMagicLinkToken } from "../util/generator.js";
import MagicLink from "../models/MagicLink.js";
import { getConfigMiddleware } from "../lib/middleware.js";
import i18next from "i18next";

const router = Router();

router.use(getConfigMiddleware);

router.post("/magic-link/event/create", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.render("createEventMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "danger",
        text: i18next.t("routes.magiclink.provideemail"),
      },
    });
    return;
  }
  const allowedEmails = res.locals.config?.general.creator_email_addresses;
  if (!allowedEmails?.length) {
    // No creator email addresses are configured, so skip the magic link check
    return res.redirect("/new");
  }
  if (!allowedEmails.includes(email)) {
    res.render("createEventMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "success",
        text: i18next.t("routes.magiclink.thanks"),
      },
    });
    return;
  }
  const token = generateMagicLinkToken();
  const magicLink = new MagicLink({
    email,
    token,
    expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    permittedActions: ["createEvent"],
  });
  await magicLink.save();

  // Take this opportunity to delete any expired magic links
  await MagicLink.deleteMany({ expiryTime: { $lt: new Date() } });

  req.emailService.sendEmailFromTemplate({
    to: email,
    subject: i18next.t("routes.magiclink.mailsubject"),
    templateName: "createEventMagicLink",
    templateData: {
      token,
    },
  });
  res.render("createEventMagicLink", {
    ...frontendConfig(res),
    message: {
      type: "success",
      text: i18next.t("routes.magiclink.thanks"),
    },
  });
});

router.post("/magic-link/admin", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.render("adminMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "danger",
        text: "Please provide an email address.",
      },
    });
    return;
  }
  const allowedEmails = res.locals.config?.general.admin_email_addresses;
  if (!allowedEmails?.length) {
    res.render("adminMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "danger",
        text: "No admin email addresses are configured on this instance.",
      },
    });
    return;
  }
  if (!allowedEmails.includes(email)) {
    res.render("adminMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "success",
        text: "Thanks! If this email address is an admin, you should receive an email with a magic link.",
      },
    });
    return;
  }
  const token = generateMagicLinkToken();
  const magicLink = new MagicLink({
    email,
    token,
    expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    permittedActions: ["editAnyEvent"],
  });
  await magicLink.save();
  await MagicLink.deleteMany({ expiryTime: { $lt: new Date() } });

  req.emailService.sendEmailFromTemplate({
    to: email,
    subject: "Admin magic link for " + (res.locals.config?.general.site_name || "Gathio"),
    templateName: "adminMagicLink",
    templateData: {
      token,
    },
  });
  res.render("adminMagicLink", {
    ...frontendConfig(res),
    message: {
      type: "success",
      text: "Thanks! If this email address is an admin, you should receive an email with a magic link.",
    },
  });
});

export default router;
