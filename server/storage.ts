import { randomUUID } from "crypto";
import { users, subscriptions, profiles, education, projects, skills, experiences, creditPurchases } from "@shared/schema";
import type { 
  User, InsertUser, 
  Subscription, InsertSubscription,
  Profile, InsertProfile,
  Education, InsertEducation,
  Project, InsertProject,
  Skill, InsertSkill,
  Experience, InsertExperience,
  CreditPurchase, InsertCreditPurchase
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gt, gte, isNull, or, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);
const EDIT_CREDIT_COST = 5;

class InsufficientCreditsStorageError extends Error {
  constructor() {
    super("INSUFFICIENT_CREDITS");
  }
}

export class ActiveSubscriptionExistsError extends Error {
  constructor() {
    super("ACTIVE_SUBSCRIPTION_EXISTS");
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i += 1) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

function makeShareSlug(name?: string | null) {
  const base = (name || "profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "profile";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

export type UpgradeSubscriptionResult =
  | { status: "ok"; subscription: Subscription }
  | { status: "no_active" }
  | { status: "already_target"; subscription: Subscription }
  | { status: "not_basic"; subscription: Subscription };

type ProfileEditResult<T> =
  | { status: "ok"; value: T; creditsRemaining: number }
  | { status: "not_found" }
  | { status: "insufficient_credits" };

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User>;
  
  // Subscription methods
  getUserSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  upgradeSubscription(
    userId: string,
    params: {
      planType: "Premium";
      creditsAllocated: number;
      additionalCredits: number;
      startDate: Date;
      endDate: Date;
    },
  ): Promise<UpgradeSubscriptionResult>;
  updateSubscriptionCredits(userId: string, creditsToDeduct: number): Promise<Subscription | null>;
  topUpSubscriptionCredits(userId: string, credits: number, amount: number): Promise<Subscription | null>;
  withProfileEditCredit<T>(userId: string, operation: (executor: any) => Promise<T | undefined | null | false>): Promise<ProfileEditResult<T>>;
  
  // Profile methods
  getUserProfile(userId: string): Promise<Profile | undefined>;
  createOrUpdateProfile(profile: InsertProfile): Promise<Profile>;
  ensureShareSlug(userId: string, name?: string | null): Promise<Profile | undefined>;
  getProfileByShareSlug(shareSlug: string): Promise<Profile | undefined>;
  
  // Education methods
  getUserEducation(userId: string): Promise<Education[]>;
  getEducation(id: string, userId: string): Promise<Education | undefined>;
  createEducation(education: InsertEducation): Promise<Education>;
  updateEducation(id: string, userId: string, education: Partial<InsertEducation>): Promise<Education | undefined>;
  deleteEducation(id: string, userId: string): Promise<boolean>;
  
  // Project methods
  getUserProjects(userId: string): Promise<Project[]>;
  getProject(id: string, userId: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, userId: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<boolean>;
  
  // Skill methods
  getUserSkills(userId: string): Promise<Skill[]>;
  getSkill(id: string, userId: string): Promise<Skill | undefined>;
  createSkill(skill: InsertSkill): Promise<Skill>;
  updateSkill(id: string, userId: string, skill: Partial<InsertSkill>): Promise<Skill | undefined>;
  deleteSkill(id: string, userId: string): Promise<boolean>;
  
  // Experience methods
  getUserExperiences(userId: string): Promise<Experience[]>;
  getExperience(id: string, userId: string): Promise<Experience | undefined>;
  createExperience(experience: InsertExperience): Promise<Experience>;
  updateExperience(id: string, userId: string, experience: Partial<InsertExperience>): Promise<Experience | undefined>;
  deleteExperience(id: string, userId: string): Promise<boolean>;
  
  // Credit purchase methods
  createCreditPurchase(purchase: InsertCreditPurchase): Promise<CreditPurchase>;
  addCreditsToSubscription(userId: string, credits: number): Promise<void>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  private async lockUserSubscriptions(executor: any, userId: string) {
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
  }

  private async getActiveSubscription(userId: string, executor: any = db): Promise<Subscription | undefined> {
    const [subscription] = await executor
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.active, true),
        or(isNull(subscriptions.endDate), gt(subscriptions.endDate, new Date())),
      ))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription || undefined;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // Try both email and username fields since login uses email as username
    const [userByEmail] = await db.select().from(users).where(eq(users.email, username));
    if (userByEmail) return userByEmail;
    
    const [userByUsername] = await db.select().from(users).where(eq(users.username, username));
    return userByUsername || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        // Add stripe fields to users table if needed
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUserSubscription(userId: string): Promise<Subscription | undefined> {
    return this.getActiveSubscription(userId);
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    try {
      return await db.transaction(async (tx) => {
        await this.lockUserSubscriptions(tx, subscription.userId);
        const existing = await this.getActiveSubscription(subscription.userId, tx);
        if (existing) {
          throw new ActiveSubscriptionExistsError();
        }

        const [newSubscription] = await tx
          .insert(subscriptions)
          .values(subscription)
          .returning();
        return newSubscription;
      });
    } catch (error) {
      if (error instanceof ActiveSubscriptionExistsError) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw new ActiveSubscriptionExistsError();
      }
      throw error;
    }
  }

  async upgradeSubscription(
    userId: string,
    params: {
      planType: "Premium";
      creditsAllocated: number;
      additionalCredits: number;
      startDate: Date;
      endDate: Date;
    },
  ): Promise<UpgradeSubscriptionResult> {
    return await db.transaction(async (tx) => {
      await this.lockUserSubscriptions(tx, userId);
      const current = await this.getActiveSubscription(userId, tx);
      if (!current) {
        return { status: "no_active" };
      }
      if (current.planType === params.planType) {
        return { status: "already_target", subscription: current };
      }
      if (current.planType !== "Basic") {
        return { status: "not_basic", subscription: current };
      }

      const [updated] = await tx
        .update(subscriptions)
        .set({
          planType: params.planType,
          creditsAllocated: params.creditsAllocated,
          creditsRemaining: sql`${subscriptions.creditsRemaining} + ${params.additionalCredits}`,
          startDate: params.startDate,
          endDate: params.endDate,
          active: true,
        })
        .where(and(
          eq(subscriptions.id, current.id),
          eq(subscriptions.userId, userId),
          eq(subscriptions.active, true),
        ))
        .returning();

      if (!updated) {
        return { status: "no_active" };
      }
      return { status: "ok", subscription: updated };
    });
  }

  async updateSubscriptionCredits(userId: string, creditsToDeduct: number): Promise<Subscription | null> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription || subscription.creditsRemaining < creditsToDeduct) {
      return null;
    }

    const [updated] = await db
      .update(subscriptions)
      .set({ 
        creditsRemaining: sql`${subscriptions.creditsRemaining} - ${creditsToDeduct}`
      })
      .where(and(
        eq(subscriptions.id, subscription.id),
        eq(subscriptions.userId, userId),
        eq(subscriptions.active, true),
        gte(subscriptions.creditsRemaining, creditsToDeduct),
      ))
      .returning();
    return updated || null;
  }

  private async deductEditCredit(executor: any, userId: string): Promise<Subscription | null> {
    const subscription = await this.getActiveSubscription(userId, executor);
    if (!subscription) return null;

    const [updated] = await executor
      .update(subscriptions)
      .set({
        creditsRemaining: sql`${subscriptions.creditsRemaining} - ${EDIT_CREDIT_COST}`,
      })
      .where(and(
        eq(subscriptions.id, subscription.id),
        eq(subscriptions.userId, userId),
        eq(subscriptions.active, true),
        or(isNull(subscriptions.endDate), gt(subscriptions.endDate, new Date())),
        gte(subscriptions.creditsRemaining, EDIT_CREDIT_COST),
      ))
      .returning();
    return updated || null;
  }

  async withProfileEditCredit<T>(
    userId: string,
    operation: (executor: any) => Promise<T | undefined | null | false>,
  ): Promise<ProfileEditResult<T>> {
    try {
      return await db.transaction(async (tx) => {
        const value = await operation(tx);
        if (!value) {
          return { status: "not_found" as const };
        }

        const chargedSubscription = await this.deductEditCredit(tx, userId);
        if (!chargedSubscription) {
          throw new InsufficientCreditsStorageError();
        }

        return {
          status: "ok" as const,
          value,
          creditsRemaining: chargedSubscription.creditsRemaining,
        };
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsStorageError) {
        return { status: "insufficient_credits" };
      }
      throw error;
    }
  }

  async topUpSubscriptionCredits(userId: string, credits: number, amount: number): Promise<Subscription | null> {
    return await db.transaction(async (tx) => {
      const subscription = await this.getActiveSubscription(userId, tx);
      if (!subscription) return null;

      await tx.insert(creditPurchases).values({ userId, credits, amount });

      const [updated] = await tx
        .update(subscriptions)
        .set({
          creditsRemaining: sql`${subscriptions.creditsRemaining} + ${credits}`,
        })
        .where(and(
          eq(subscriptions.id, subscription.id),
          eq(subscriptions.userId, userId),
          eq(subscriptions.active, true),
          or(isNull(subscriptions.endDate), gt(subscriptions.endDate, new Date())),
        ))
        .returning();
      return updated || null;
    });
  }

  async getUserProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile || undefined;
  }

  async createOrUpdateProfile(profile: InsertProfile, executor: any = db): Promise<Profile> {
    const existing = await this.getUserProfile(profile.userId);
    const shareSlug = existing?.shareSlug || profile.shareSlug || makeShareSlug(profile.name);
    const values = omitUndefined({ ...profile, shareSlug }) as InsertProfile;
    const { userId: _userId, shareSlug: _shareSlug, ...updatable } = values;

    const [upserted] = await executor
      .insert(profiles)
      .values(values)
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          ...omitUndefined(updatable as Record<string, unknown>),
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async ensureShareSlug(userId: string, name?: string | null): Promise<Profile | undefined> {
    const existing = await this.getUserProfile(userId);
    if (!existing) return undefined;
    if (existing.shareSlug) return existing;

    const [updated] = await db
      .update(profiles)
      .set({ shareSlug: makeShareSlug(name || existing.name), updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated || existing;
  }

  async getProfileByShareSlug(shareSlug: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.shareSlug, shareSlug));
    return profile || undefined;
  }

  async getUserEducation(userId: string): Promise<Education[]> {
    return await db.select().from(education).where(eq(education.userId, userId));
  }

  async getEducation(id: string, userId: string): Promise<Education | undefined> {
    const [edu] = await db
      .select()
      .from(education)
      .where(and(eq(education.id, id), eq(education.userId, userId)));
    return edu || undefined;
  }

  async createEducation(edu: InsertEducation, executor: any = db): Promise<Education> {
    const [created] = await executor.insert(education).values(edu).returning();
    return created;
  }

  async updateEducation(id: string, userId: string, edu: Partial<InsertEducation>, executor: any = db): Promise<Education | undefined> {
    const [updated] = await executor
      .update(education)
      .set(edu)
      .where(and(eq(education.id, id), eq(education.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteEducation(id: string, userId: string, executor: any = db): Promise<boolean> {
    const [deleted] = await executor
      .delete(education)
      .where(and(eq(education.id, id), eq(education.userId, userId)))
      .returning({ id: education.id });
    return !!deleted;
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.userId, userId));
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    return project || undefined;
  }

  async createProject(project: InsertProject, executor: any = db): Promise<Project> {
    const [created] = await executor.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: string, userId: string, project: Partial<InsertProject>, executor: any = db): Promise<Project | undefined> {
    const [updated] = await executor
      .update(projects)
      .set(project)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteProject(id: string, userId: string, executor: any = db): Promise<boolean> {
    const [deleted] = await executor
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning({ id: projects.id });
    return !!deleted;
  }

  async getUserSkills(userId: string): Promise<Skill[]> {
    return await db.select().from(skills).where(eq(skills.userId, userId));
  }

  async getSkill(id: string, userId: string): Promise<Skill | undefined> {
    const [skill] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)));
    return skill || undefined;
  }

  async createSkill(skill: InsertSkill, executor: any = db): Promise<Skill> {
    const [created] = await executor.insert(skills).values(skill).returning();
    return created;
  }

  async updateSkill(id: string, userId: string, skill: Partial<InsertSkill>, executor: any = db): Promise<Skill | undefined> {
    const [updated] = await executor
      .update(skills)
      .set(skill)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteSkill(id: string, userId: string, executor: any = db): Promise<boolean> {
    const [deleted] = await executor
      .delete(skills)
      .where(and(eq(skills.id, id), eq(skills.userId, userId)))
      .returning({ id: skills.id });
    return !!deleted;
  }

  async getUserExperiences(userId: string): Promise<Experience[]> {
    return await db.select().from(experiences).where(eq(experiences.userId, userId));
  }

  async getExperience(id: string, userId: string): Promise<Experience | undefined> {
    const [experience] = await db
      .select()
      .from(experiences)
      .where(and(eq(experiences.id, id), eq(experiences.userId, userId)));
    return experience || undefined;
  }

  async createExperience(experience: InsertExperience, executor: any = db): Promise<Experience> {
    const [created] = await executor.insert(experiences).values(experience).returning();
    return created;
  }

  async updateExperience(id: string, userId: string, experience: Partial<InsertExperience>, executor: any = db): Promise<Experience | undefined> {
    const [updated] = await executor
      .update(experiences)
      .set(experience)
      .where(and(eq(experiences.id, id), eq(experiences.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteExperience(id: string, userId: string, executor: any = db): Promise<boolean> {
    const [deleted] = await executor
      .delete(experiences)
      .where(and(eq(experiences.id, id), eq(experiences.userId, userId)))
      .returning({ id: experiences.id });
    return !!deleted;
  }

  async createCreditPurchase(purchase: InsertCreditPurchase): Promise<CreditPurchase> {
    const [created] = await db.insert(creditPurchases).values(purchase).returning();
    return created;
  }

  async addCreditsToSubscription(userId: string, credits: number): Promise<void> {
    const subscription = await this.getActiveSubscription(userId);
    if (subscription) {
      await db
        .update(subscriptions)
        .set({ 
          creditsRemaining: sql`${subscriptions.creditsRemaining} + ${credits}`
        })
        .where(and(eq(subscriptions.id, subscription.id), eq(subscriptions.userId, userId)));
    }
  }
}

export const storage = new DatabaseStorage();
