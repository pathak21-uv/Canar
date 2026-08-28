import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // The Express session table is managed by connect-pg-simple, not Drizzle.
  tablesFilter: [
    "users",
    "subscriptions",
    "credit_purchases",
    "profiles",
    "education",
    "projects",
    "skills",
    "experiences",
  ],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
