import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import { storage, ActiveSubscriptionExistsError } from "./storage";
import { setupAuth } from "./auth";
import type { User as SelectUser } from "@shared/schema";
import {
  insertCreditPurchaseSchema,
  insertEducationSchema,
  insertExperienceSchema,
  insertProfileSchema,
  insertProjectSchema,
  insertSkillSchema,
} from "@shared/schema";
import { z } from "zod";
import path from "path";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.sendStatus(401);
  }
  next();
}

function getAuthenticatedUserId(req: Request) {
  return (req.user as SelectUser).id;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | undefined {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: getValidationMessage(parsed.error) });
    return undefined;
  }
  return parsed.data;
}

function getValidationMessage(error: z.ZodError) {
  return error.errors[0]?.message || "Please check the form and try again.";
}

function parseUuidParam(value: string, res: Response): string | undefined {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid record id" });
    return undefined;
  }
  return parsed.data;
}

const requiredText = (field: string, max: number) =>
  z.string({ required_error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be ${max} characters or fewer`);
const optionalText = (field: string, max: number) =>
  z.string()
    .trim()
    .max(max, `${field} must be ${max} characters or fewer`)
    .optional()
    .nullable();
const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().url("Please enter a valid project URL").max(2048, "Project URL must be 2048 characters or fewer"),
]).optional().nullable();
const optionalEmail = z.union([
  z.literal(""),
  z.string().trim().email("Please enter a valid email address").max(255, "Email must be 255 characters or fewer"),
]).optional().nullable();
const monthDate = (field: string) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
      return new Date(`${value}-01T00:00:00.000Z`);
    }
    return value;
  }, z.date({ invalid_type_error: `${field} must use MM/YYYY format` }).nullable()).optional();

const dateRangeFields = {
  duration: optionalText("Duration", 100),
  startDate: monthDate("From date"),
  endDate: monthDate("To date"),
  isCurrent: z.boolean().optional(),
};

function validateDateRange(currentLabel: string) {
  return (value: { startDate?: Date | null; endDate?: Date | null; isCurrent?: boolean }, ctx: z.RefinementCtx) => {
    if (value.isCurrent && value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: `Clear the To date when ${currentLabel} is selected`,
      });
    }

    if (!value.isCurrent && value.startDate && !value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "To date is required unless this is current",
      });
    }

    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "To date must be after From date",
      });
    }
  };
}

const subscribeSchema = z.object({
  planType: z.enum(["Basic", "Premium"], { errorMap: () => ({ message: "Please choose either the Basic or Premium plan" }) }),
  simulatedPayment: z.literal(true, {
    errorMap: () => ({ message: "Simulated payment confirmation is required" }),
  }),
}).strict();
const upgradeSchema = z.object({
  planType: z.literal("Premium", {
    errorMap: () => ({ message: "Only an upgrade to Premium is supported" }),
  }),
  simulatedPayment: z.literal(true, {
    errorMap: () => ({ message: "Simulated payment confirmation is required" }),
  }),
}).strict();

const subscriptionPlans = {
  Basic: { id: "basic", name: "Basic", price: 199900, credits: 500 },
  Premium: { id: "premium", name: "Premium", price: 299900, credits: 1000 },
} as const;
const TOPUP_CREDITS = 100;
const TOPUP_AMOUNT = 50000;
const SUBSCRIPTION_PERIOD_DAYS = 30;
const topupSchema = z.object({
  simulatedPayment: z.literal(true, {
    errorMap: () => ({ message: "Simulated top-up confirmation is required" }),
  }),
  credits: z.literal(TOPUP_CREDITS, {
    errorMap: () => ({ message: "Unsupported top-up credit amount" }),
  }).optional(),
  amount: z.literal(TOPUP_AMOUNT, {
    errorMap: () => ({ message: "Unsupported top-up payment amount" }),
  }).optional(),
}).strict();
const EDIT_CREDIT_COST = 5;

const profileBodySchema = z.object({
  name: optionalText("Name", 255),
  email: optionalEmail,
  bio: optionalText("Bio", 5000),
  photoUrl: optionalText("Photo URL", 2048),
  cvUrl: optionalText("CV URL", 2048),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Please provide at least one profile field to update",
});

const uploadKindSchema = z.enum(["photo", "cv"]);
const photoMimeToExt: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const cvMimeToExt: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};
const allowedUploads = {
  photo: {
    maxSize: 5 * 1024 * 1024,
    mimeTypes: new Set(Object.keys(photoMimeToExt)),
    extensions: photoMimeToExt,
  },
  cv: {
    maxSize: 2 * 1024 * 1024,
    mimeTypes: new Set(Object.keys(cvMimeToExt)),
    extensions: cvMimeToExt,
  },
} as const;

function toPublicSharedProfile(
  profile: {
    id: string;
    name: string | null;
    email: string | null;
    bio: string | null;
    photoUrl: string | null;
    shareSlug: string | null;
    updatedAt: Date | null;
  },
  sections: {
    education: unknown;
    projects: unknown;
    skills: unknown;
    experiences: unknown;
  },
) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    bio: profile.bio,
    photoUrl: profile.photoUrl,
    shareSlug: profile.shareSlug,
    updatedAt: profile.updatedAt,
    education: sections.education,
    projects: sections.projects,
    skills: sections.skills,
    experiences: sections.experiences,
  };
}

function sendProfileEditResult(res: Response, result: { status: string; value?: unknown }) {
  if (result.status === "insufficient_credits") {
    return res.status(402).json({
      error: "INSUFFICIENT_CREDITS",
      message: `Insufficient credits. You need at least ${EDIT_CREDIT_COST} credits to edit. Please top-up. Top-up adds credits and does not change your subscription plan.`,
    });
  }

  if (result.status === "not_found") {
    return res.sendStatus(404);
  }

  return res.json(result.value);
}

const educationBaseSchema = z.object({
  degree: requiredText("Degree", 255),
  university: requiredText("University", 255),
  ...dateRangeFields,
}).strict();
const educationBodySchema = educationBaseSchema.superRefine(validateDateRange("Currently studying"));
const educationUpdateSchema = educationBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one education field is required",
}).superRefine(validateDateRange("Currently studying"));

const projectBaseSchema = z.object({
  name: requiredText("Project name", 255),
  description: requiredText("Project description", 5000),
  link: optionalUrl,
  ...dateRangeFields,
}).strict();
const projectBodySchema = projectBaseSchema.superRefine(validateDateRange("Currently working on this project"));
const projectUpdateSchema = projectBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one project field is required",
}).superRefine(validateDateRange("Currently working on this project"));

const skillBodySchema = z.object({
  name: requiredText("Skill name", 100),
  proficiency: z.enum(["Beginner", "Intermediate", "Advanced", "Expert"], {
    errorMap: () => ({ message: "Please choose a valid skill proficiency" }),
  }),
}).strict();
const skillUpdateSchema = skillBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one skill field is required",
});

const experienceBaseSchema = z.object({
  role: requiredText("Role", 255),
  company: requiredText("Company", 255),
  description: requiredText("Experience description", 5000),
  ...dateRangeFields,
}).strict();
const experienceBodySchema = experienceBaseSchema.superRefine(validateDateRange("Currently working here"));
const experienceUpdateSchema = experienceBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one experience field is required",
}).superRefine(validateDateRange("Currently working here"));

function getSubscriptionPeriod() {
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

function toCreditsPayload(subscription?: {
  creditsRemaining: number;
  creditsAllocated: number;
  active: boolean | null;
  planType: string;
  startDate: Date | null;
  endDate: Date | null;
} | null) {
  if (!subscription) {
    return {
      creditsRemaining: 0,
      creditsAllocated: 0,
      hasSubscription: false,
      planType: null as string | null,
      status: "Inactive" as const,
      startDate: null as Date | null,
      endDate: null as Date | null,
    };
  }

  return {
    creditsRemaining: subscription.creditsRemaining,
    creditsAllocated: subscription.creditsAllocated,
    hasSubscription: true,
    planType: subscription.planType,
    status: "Active" as const,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const uploadedFileSchema = z.object({
    userId: z.string().uuid(),
    fileName: z.string().regex(/^(photo|cv)-[0-9a-f-]+\.(jpg|jpeg|png|webp|gif|pdf|doc|docx)$/i),
  });

  app.get("/uploads/:userId/:fileName", async (req, res, next) => {
    const parsed = uploadedFileSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.sendStatus(404);
    }

    const { userId, fileName } = parsed.data;
    if (fileName.toLowerCase().startsWith("cv-")) {
      if (!req.isAuthenticated() || getAuthenticatedUserId(req) !== userId) {
        return res.sendStatus(401);
      }
    }

    const filePath = path.resolve(uploadsRoot, userId, fileName);
    if (!filePath.startsWith(uploadsRoot + path.sep)) {
      return res.sendStatus(404);
    }

    res.sendFile(filePath, (error) => {
      if (!error) return;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.sendStatus(404);
        return;
      }
      next(error);
    });
  });

  app.get("/api/subscription/plans", (_req, res) => {
    res.json([
      {
        ...subscriptionPlans.Basic,
        features: ["500 editing credits", "PDF export unlimited", "Public profile sharing", "Photo & CV upload"],
      },
      {
        ...subscriptionPlans.Premium,
        features: ["1,000 editing credits", "PDF export unlimited", "Public profile sharing", "Photo & CV upload", "Priority support"],
      },
    ]);
  });

  app.post("/api/subscription/subscribe", requireAuth, async (req, res) => {
    try {
      const body = parseBody(subscribeSchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const selectedPlan = subscriptionPlans[body.planType];
      const { startDate, endDate } = getSubscriptionPeriod();

      const subscription = await storage.createSubscription({
        userId,
        planType: body.planType,
        creditsAllocated: selectedPlan.credits,
        creditsRemaining: selectedPlan.credits,
        active: true,
        startDate,
        endDate,
      });

      res.json({
        ...subscription,
        simulated: true,
      });
    } catch (error) {
      if (error instanceof ActiveSubscriptionExistsError) {
        return res.status(409).json({
          error: "ACTIVE_SUBSCRIPTION_EXISTS",
          message: "You already have an active subscription. Use upgrade to move from Basic to Premium.",
        });
      }
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Error creating subscription" });
    }
  });

  app.post("/api/subscription/upgrade", requireAuth, async (req, res) => {
    try {
      const body = parseBody(upgradeSchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const premiumPlan = subscriptionPlans.Premium;
      const basicPlan = subscriptionPlans.Basic;
      const { startDate, endDate } = getSubscriptionPeriod();

      const result = await storage.upgradeSubscription(userId, {
        planType: body.planType,
        creditsAllocated: premiumPlan.credits,
        additionalCredits: premiumPlan.credits - basicPlan.credits,
        startDate,
        endDate,
      });

      if (result.status === "no_active") {
        return res.status(403).json({
          error: "NO_ACTIVE_SUBSCRIPTION",
          message: "An active subscription is required before upgrading.",
        });
      }

      if (result.status === "already_target") {
        return res.status(409).json({
          error: "ALREADY_PREMIUM",
          message: "Your Premium plan is already active.",
        });
      }

      if (result.status === "not_basic") {
        return res.status(409).json({
          error: "UPGRADE_NOT_AVAILABLE",
          message: "Only Basic subscribers can upgrade to Premium.",
        });
      }

      res.json({
        ...result.subscription,
        simulated: true,
        additionalCredits: premiumPlan.credits - basicPlan.credits,
      });
    } catch (error) {
      console.error("Error upgrading subscription:", error);
      res.status(500).json({ message: "Error upgrading subscription" });
    }
  });

  app.post("/api/subscription/credits/topup", requireAuth, async (req, res) => {
    try {
      const body = parseBody(topupSchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const subscription = await storage.getUserSubscription(userId);
      if (!subscription || !subscription.active) {
        return res.status(403).json({ message: "Active subscription required for credit top-up" });
      }

      const purchaseData = insertCreditPurchaseSchema.parse({
        userId,
        credits: TOPUP_CREDITS,
        amount: TOPUP_AMOUNT,
      });
      const updatedSubscription = await storage.topUpSubscriptionCredits(
        userId,
        purchaseData.credits,
        purchaseData.amount,
      );
      if (!updatedSubscription) {
        return res.status(403).json({ message: "Active subscription required for credit top-up" });
      }

      res.json({
        message: "Credits added successfully",
        credits: TOPUP_CREDITS,
        amount: TOPUP_AMOUNT,
        creditsRemaining: updatedSubscription.creditsRemaining,
        planType: updatedSubscription.planType,
        simulated: true,
      });
    } catch (error) {
      console.error("Error adding credits:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error adding credits" });
    }
  });

  app.get("/api/credits", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      const subscription = await storage.getUserSubscription(userId);
      res.json(toCreditsPayload(subscription));
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({ message: "Error fetching credits" });
    }
  });

  app.post("/api/uploads/:kind", requireAuth, express.raw({ type: "*/*", limit: "5mb" }), async (req, res, next) => {
    try {
      const kind = uploadKindSchema.safeParse(req.params.kind);
      if (!kind.success) {
        return res.status(400).json({ message: "Unsupported upload type" });
      }

      const config = allowedUploads[kind.data];
      const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() || "";
      if (!config.mimeTypes.has(contentType)) {
        return res.status(400).json({ message: "Unsupported file type" });
      }

      const fileBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (fileBuffer.length === 0) {
        return res.status(400).json({ message: "No file was uploaded" });
      }
      if (fileBuffer.length > config.maxSize) {
        return res.status(413).json({ message: "File is too large" });
      }

      const userId = getAuthenticatedUserId(req);
      const originalName = Array.isArray(req.headers["x-file-name"])
        ? req.headers["x-file-name"][0]
        : req.headers["x-file-name"];
      const extension = (config.extensions as Record<string, string>)[contentType];
      if (!extension) {
        return res.status(400).json({ message: "Unsupported file type" });
      }
      const uploadDir = path.resolve(process.cwd(), "uploads", userId);
      const fileName = `${kind.data}-${randomUUID()}${extension}`;
      const filePath = path.join(uploadDir, fileName);

      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, fileBuffer);

      res.status(201).json({
        url: `/uploads/${userId}/${fileName}`,
        name: originalName || fileName,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      const accountEmail = (req.user as SelectUser).email;
      let profile = await storage.getUserProfile(userId);

      if (!profile) {
        profile = await storage.createOrUpdateProfile({ userId, email: accountEmail });
      } else {
        if (!profile.shareSlug) {
          profile = await storage.ensureShareSlug(userId, profile.name) || profile;
        }
        if (profile.email !== accountEmail) {
          profile = await storage.createOrUpdateProfile({ userId, email: accountEmail });
        }
      }

      const [education, projects, skills, experiences] = await Promise.all([
        storage.getUserEducation(userId),
        storage.getUserProjects(userId),
        storage.getUserSkills(userId),
        storage.getUserExperiences(userId),
      ]);

      res.json({ ...profile, education, projects, skills, experiences });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Error fetching profile" });
    }
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const body = parseBody(profileBodySchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const accountEmail = (req.user as SelectUser).email;
      const { email: _ignoredEmail, ...safeBody } = body;
      const profileData = insertProfileSchema.parse({
        ...safeBody,
        userId,
        email: accountEmail,
      });
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.createOrUpdateProfile(profileData, executor)
      );

      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error updating profile:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  app.get("/api/education", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      res.json(await storage.getUserEducation(userId));
    } catch (error) {
      console.error("Error fetching education:", error);
      res.status(500).json({ message: "Error fetching education" });
    }
  });

  app.post("/api/education", requireAuth, async (req, res) => {
    try {
      const body = parseBody(educationBodySchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const educationData = insertEducationSchema.parse({ ...body, userId });
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.createEducation(educationData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error creating education:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error creating education" });
    }
  });

  app.patch("/api/education/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      const body = parseBody(educationUpdateSchema, req, res);
      if (!id || !body) return;

      const userId = getAuthenticatedUserId(req);
      const educationData = insertEducationSchema.partial().parse(body);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.updateEducation(id, userId, educationData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error updating education:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error updating education" });
    }
  });

  app.delete("/api/education/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      if (!id) return;

      const userId = getAuthenticatedUserId(req);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.deleteEducation(id, userId, executor)
      );
      if (result.status !== "ok") return sendProfileEditResult(res, result);
      res.json({ message: "Education deleted successfully" });
    } catch (error) {
      console.error("Error deleting education:", error);
      res.status(500).json({ message: "Error deleting education" });
    }
  });

  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      res.json(await storage.getUserProjects(userId));
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Error fetching projects" });
    }
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    try {
      const body = parseBody(projectBodySchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const projectData = insertProjectSchema.parse({ ...body, userId });
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.createProject(projectData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error creating project:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error creating project" });
    }
  });

  app.patch("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      const body = parseBody(projectUpdateSchema, req, res);
      if (!id || !body) return;

      const userId = getAuthenticatedUserId(req);
      const projectData = insertProjectSchema.partial().parse(body);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.updateProject(id, userId, projectData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error updating project:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error updating project" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      if (!id) return;

      const userId = getAuthenticatedUserId(req);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.deleteProject(id, userId, executor)
      );
      if (result.status !== "ok") return sendProfileEditResult(res, result);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Error deleting project" });
    }
  });

  app.get("/api/skills", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      res.json(await storage.getUserSkills(userId));
    } catch (error) {
      console.error("Error fetching skills:", error);
      res.status(500).json({ message: "Error fetching skills" });
    }
  });

  app.post("/api/skills", requireAuth, async (req, res) => {
    try {
      const body = parseBody(skillBodySchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const skillData = insertSkillSchema.parse({ ...body, userId });
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.createSkill(skillData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error creating skill:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error creating skill" });
    }
  });

  app.patch("/api/skills/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      const body = parseBody(skillUpdateSchema, req, res);
      if (!id || !body) return;

      const userId = getAuthenticatedUserId(req);
      const skillData = insertSkillSchema.partial().parse(body);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.updateSkill(id, userId, skillData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error updating skill:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error updating skill" });
    }
  });

  app.delete("/api/skills/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      if (!id) return;

      const userId = getAuthenticatedUserId(req);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.deleteSkill(id, userId, executor)
      );
      if (result.status !== "ok") return sendProfileEditResult(res, result);
      res.json({ message: "Skill deleted successfully" });
    } catch (error) {
      console.error("Error deleting skill:", error);
      res.status(500).json({ message: "Error deleting skill" });
    }
  });

  app.get("/api/experiences", requireAuth, async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(req);
      res.json(await storage.getUserExperiences(userId));
    } catch (error) {
      console.error("Error fetching experiences:", error);
      res.status(500).json({ message: "Error fetching experiences" });
    }
  });

  app.post("/api/experiences", requireAuth, async (req, res) => {
    try {
      const body = parseBody(experienceBodySchema, req, res);
      if (!body) return;

      const userId = getAuthenticatedUserId(req);
      const experienceData = insertExperienceSchema.parse({ ...body, userId });
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.createExperience(experienceData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error creating experience:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error creating experience" });
    }
  });

  app.patch("/api/experiences/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      const body = parseBody(experienceUpdateSchema, req, res);
      if (!id || !body) return;

      const userId = getAuthenticatedUserId(req);
      const experienceData = insertExperienceSchema.partial().parse(body);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.updateExperience(id, userId, experienceData, executor)
      );
      return sendProfileEditResult(res, result);
    } catch (error) {
      console.error("Error updating experience:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: getValidationMessage(error) });
      }
      res.status(500).json({ message: "Error updating experience" });
    }
  });

  app.delete("/api/experiences/:id", requireAuth, async (req, res) => {
    try {
      const id = parseUuidParam(req.params.id, res);
      if (!id) return;

      const userId = getAuthenticatedUserId(req);
      const result = await storage.withProfileEditCredit(userId, (executor) =>
        storage.deleteExperience(id, userId, executor)
      );
      if (result.status !== "ok") return sendProfileEditResult(res, result);
      res.json({ message: "Experience deleted successfully" });
    } catch (error) {
      console.error("Error deleting experience:", error);
      res.status(500).json({ message: "Error deleting experience" });
    }
  });

  app.get("/api/profile/share/:shareSlug", async (req, res) => {
    try {
      const { shareSlug } = req.params;
      const profile = await storage.getProfileByShareSlug(shareSlug);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const [education, projects, skills, experiences] = await Promise.all([
        storage.getUserEducation(profile.userId),
        storage.getUserProjects(profile.userId),
        storage.getUserSkills(profile.userId),
        storage.getUserExperiences(profile.userId),
      ]);

      res.json(toPublicSharedProfile(profile, { education, projects, skills, experiences }));
    } catch (error) {
      console.error("Error fetching shared profile:", error);
      res.status(500).json({ message: "Error fetching profile" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
