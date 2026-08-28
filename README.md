# Canar — Professional Profile Builder

Canar is a single-page professional profile builder. Authenticated users subscribe to a plan, receive editing credits, and maintain a structured profile they can preview, export as PDF, and share publicly.

This README describes the **current implementation** in this repository. Payment is simulated. JWT is not used.

## 1. Project Overview

Canar solves a simple problem: people need a place to assemble education, work, projects, and skills into one shareable professional profile, without giving every visitor free unlimited editing.

It is intended for:

- students and job seekers building a first professional profile
- both technical and non-technical users (engineering, marketing, sales, HR, and similar)

Users can:

- sign up and sign in
- choose Basic or Premium
- edit a profile with autosave
- upload a photo and a CV
- export a PDF
- share a public profile link
- buy extra credits without changing their plan

Credits exist so profile writes are metered. Subscriptions grant an initial balance. Top-ups add credits only. PDF export and viewing do not consume credits.

## 2. Project Objective

The assignment is to ship a working SPA with:

- session-based authentication
- structured professional information
- autosave editing
- subscription and credit enforcement
- photo/CV uploads
- client-side PDF export
- public profile sharing

The current app is appropriate for that assignment scope. It is not a full production billing or object-storage platform.

## 3. Core Features

### Authentication

- Sign up: `POST /api/register`
- Sign in: `POST /api/login`
- Sign out: `POST /api/logout`
- Current user: `GET /api/user`
- Session cookie: `connect.sid` (httpOnly, `sameSite: 'lax'`)
- Passwords: Node `scrypt` with a per-user salt (`server/auth.ts`)
- Identity: Passport `LocalStrategy` → Express session → `req.user`
- Protected UI: `/subscription` requires login; `/profile` requires login **and** an active subscription (`client/src/lib/protected-route.tsx`)

### Profile Builder

Managed in `client/src/pages/profile-builder-page.tsx` against owner-scoped APIs:

| Section | Fields |
|---|---|
| Personal information | Full name, account email (read-only in UI), bio, photo, CV |
| Education | Degree, university, From, To, Currently studying |
| Projects | Name, description, link, From, To, current project |
| Skills | Name, proficiency |
| Experience | Role, company, From, To, Currently working, description |

### Smart profile fields

Degree, university, skill, role, and company use a searchable combobox (`client/src/components/searchable-combobox.tsx`) over **static suggestion lists** in `client/src/data/profile-suggestions.ts`.

They are **not** backed by master-data database tables or external APIs.

Users can:

- search existing suggestions (technical and non-technical)
- enter a custom value that is not in the list

### Date-based education / experience / projects

Each dated section stores:

- `startDate` (From, month/year)
- `endDate` (To, month/year)
- `isCurrent` (currently studying / working)
- `duration` as a display string derived from those fields (kept for PDF/compat)

This is preferable to a single free-text duration because ongoing roles can be represented, month/year can be validated, and the UI can disable To when Current is checked.

### Autosave

- Profile and section edits debounce for **1 second** (`lodash.debounce` in the profile builder)
- Pending field changes are merged, then sent as `PATCH` (or create/delete for new rows)
- UI shows Saving / Saved / error + retry
- Pending saves flush on component unmount, `visibilitychange` (hidden), and `pagehide`
- Every **successful write** still costs 5 credits on the server

### Subscription

Server constants in `server/routes.ts` (amounts in paise):

| Plan | Price | Initial credits |
|---|---|---|
| Basic | ₹1,999 | 500 |
| Premium | ₹2,999 | 1,000 |
| Top-up | ₹500 | 100 extra credits |

**Payment is simulated.** There is no live Stripe/Razorpay charge in the subscribe, upgrade, or top-up routes. The UI requires an explicit **Simulate Payment** / **Simulate Top-up** step. The API requires `simulatedPayment: true`.

Signup does **not** create a subscription.

Access period: `end_date` is set to **30 days** from activation/upgrade. There is **no automatic renewal**. Active queries treat `end_date IS NULL OR end_date > now()`.

### Credit system

- Each successful profile/section create, update, or delete costs **5 credits**
- Enforcement is a database transaction: mutate, then deduct if `credits_remaining >= 5`; otherwise roll back (`storage.withProfileEditCredit`)
- Insufficient credits → HTTP **402** `INSUFFICIENT_CREDITS`; data is not saved; balance cannot go negative
- PDF export, GET requests, auth, and reading credits do **not** deduct
- Top-up adds 100 credits to the **existing** active subscription and writes `credit_purchases`
- Top-up **does not** activate or change Basic/Premium
- Client-supplied prices/credits are not authoritative

### Uploads

- `POST /api/uploads/photo` and `POST /api/uploads/cv` (authenticated, raw body)
- Photo: JPEG/PNG/WebP/GIF, max 5 MB
- CV: PDF/DOC/DOCX, max 2 MB
- Stored filename extension is taken from the **allowed MIME type**, not the original filename
- Files live under `uploads/<userId>/` on the local filesystem
- Photos may be fetched without login (needed for public profiles)
- CV files require the **owner’s session** (`GET /uploads/:userId/:fileName`)

**Deployment:** local disk is assignment-appropriate. Production should use durable object storage and a persistent volume; files on one app instance are not shared across hosts.

### PDF export

- Client-side `jspdf` (`client/src/lib/pdf-generator.ts`)
- Includes name, email, bio, education, experience, projects, skills
- Long text paginates line-by-line
- Profile photo is **not** embedded
- **Does not consume credits** (no credit API is called)

### Public profile sharing

- Server generates a unique `share_slug` when a profile row is created/ensured
- Public URL: `/profile/share/:shareSlug`
- Public API: `GET /api/profile/share/:shareSlug` (no login)
- Public payload includes name, email, bio, photo, sections
- Public payload **omits** `userId`, `cvUrl`, password, and session data
- Invalid slug → 404

## 4. Technology Stack

Versions from `package.json`:

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18.3.1, TypeScript 5.6.3 | SPA UI |
| Routing | Wouter 3.3.5 | Client routes |
| Data fetching | TanStack React Query 5.60.5 | Cache for `/api/*` |
| Styling | Tailwind CSS 3.4.17 + Radix UI primitives | Existing component system (`client/src/components/ui`) |
| Backend | Node.js, Express 4.21.2 | REST API |
| Auth | Passport 0.7.0 + passport-local 1.0.0 | Email/username + password |
| Sessions | express-session 1.18.1 + connect-pg-simple 10.0.0 | `connect.sid` in PostgreSQL |
| Validation | Zod 3.24.2 | Request bodies |
| ORM | Drizzle ORM 0.39.1 | Schema and queries |
| Database | PostgreSQL via `@neondatabase/serverless` 0.10.4 | Hosted Postgres (Neon in this environment) |
| PDF | jsPDF 3.0.1 | Client-side export |
| Autosave | lodash.debounce 4.0.8 | Debounced PATCH |
| Uploads | `express.raw` (not multer) | Authenticated file POST |
| Tooling | Vite 5.4.19, tsx, esbuild | Dev server and production build |

**Present in `package.json` but not used by the current subscribe/upload paths:** `stripe`, `@stripe/stripe-js`, Uppy, `@google-cloud/storage`. Do not describe those as live features.

## 5. Architecture

```
Browser (React + Wouter + React Query)
  → fetch(..., { credentials: "include" })
    → Express
      → session + Passport (cookie connect.sid)
      → requireAuth / public share route
      → server/routes.ts
      → server/storage.ts
      → Drizzle
      → PostgreSQL
```

Authorization uses **`req.user.id`** from the deserialized session. Profile, education, project, skill, experience, subscription, and credit routes do not take a client-supplied user id as the owner.

## 6. Authentication Flow

1. `POST /api/register` validates email/password, hashes with scrypt, inserts `users`, then `req.login`
2. Browser stores `connect.sid`; connect-pg-simple persists the session row
3. Later requests send the cookie; Passport `deserializeUser` loads `req.user`
4. `POST /api/logout` calls `req.logout`, destroys the session, clears the cookie
5. After login/signup the UI navigates to `/profile`; if there is no active plan, `ProtectedRoute` redirects to `/subscription`

JWT was not introduced. The assignment and this codebase already use Passport + sessions. Adding JWT would be a second auth architecture without a requirement to migrate.

## 7. Subscription and Credit Flow

Signup does **not** activate Basic.

```
Signup / login
  → no subscription, 0 credits
  → /profile redirects to /subscription
  → Select Basic or Premium
  → Review + Simulate Payment
  → POST /api/subscription/subscribe { planType, simulatedPayment: true }
  → active row + 500 or 1000 credits + 30-day end_date
  → /profile
  → each successful write: remaining -= 5
  → Buy Credits / Simulate Top-up
  → POST /api/subscription/credits/topup { simulatedPayment: true }
  → +100 credits, plan unchanged
```

**Premium from scratch:** same subscribe path with `planType: "Premium"` → 1,000 credits.

**Basic → Premium:** dedicated `POST /api/subscription/upgrade`. In-place update of the single active row. Unused remaining credits are kept, plus **500** extra (Premium allocation minus Basic allocation). This is not a top-up.

| Action | Endpoint | Creates plan? | Credits |
|---|---|---|---|
| Subscribe | `POST /api/subscription/subscribe` | Yes, if none active | 500 or 1000 |
| Upgrade | `POST /api/subscription/upgrade` | No second row | remaining + 500 |
| Top-up | `POST /api/subscription/credits/topup` | No | +100 |

## 8. Database Design

Defined in `shared/schema.ts` except `session`, which connect-pg-simple owns. Drizzle `tablesFilter` in `drizzle.config.ts` **excludes** `session` so kit commands do not treat it as app schema.

| Table | Purpose | Important fields |
|---|---|---|
| `users` | Accounts | `id`, `email` unique, `password`, `username` |
| `profiles` | One profile per user | `user_id` unique, name, email, bio, `photo_url`, `cv_url`, `share_slug` unique |
| `education` | Education rows | `user_id`, degree, university, duration, start/end, `is_current` |
| `projects` | Project rows | `user_id`, name, description, link, dates |
| `skills` | Skill rows | `user_id`, name, proficiency |
| `experiences` | Experience rows | `user_id`, role, company, description, dates |
| `subscriptions` | Plan + credit balance | `plan_type`, `credits_allocated`, `credits_remaining`, `active`, `start_date`, `end_date` |
| `credit_purchases` | Top-up ledger | `credits`, `amount` (paise), `purchase_date` |
| `session` | Express sessions | Managed by connect-pg-simple, not Drizzle models |

Relationships: section tables and subscriptions/purchases/profiles reference `users.id` with `onDelete: cascade`.

Constraint: unique partial index `subscriptions_one_active_per_user` on `user_id` **where `active = true`**.

## 9. Security Model

**Current assignment implementation**

- scrypt password hashing; password omitted from `/api/user`
- Session cookie httpOnly; `secure` in production; `SESSION_SECRET` required in production
- Owner checks: updates/deletes use `id` **and** `userId` from `req.user`
- Plan prices and credit amounts are server constants
- Top-up and subscribe bodies are `.strict()` Zod schemas
- CV files are owner-only; public share omits `cvUrl` and `userId`
- Upload MIME allowlists; stored extension from MIME
- Debug UI routes are not mounted in `App.tsx`

**Production hardening (not claimed as done)**

- Real payment provider
- Durable object storage for uploads
- Optional magic-byte file inspection
- CSRF review for the exact production domain setup
- Unused Stripe/Uppy dependencies should not be treated as live integrations

## 10. Important Design Decisions

| Decision | Why this approach | Alternative | Why not used |
|---|---|---|---|
| Passport + Express session | Already in the stack; server-side `req.user` | JWT | Unnecessary second auth system; not required |
| Server-side credits | Client cannot be trusted | Client balance | Trivial bypass |
| `req.user.id` | Session is the identity | `userId` in body | IDOR |
| Searchable comboboxes + static lists | Tech and non-tech UX; custom values | Huge master-data tables / APIs | Out of assignment scope |
| From / To / Current | Structured, supports ongoing roles | Single duration string | Harder to validate and display |
| Simulated payment | No provider in the assignment | Live Stripe | Packages exist but routes do not charge |
| Client-side PDF | No PDF service required | Server PDF | Extra infrastructure |
| Local `uploads/` | Simple for the assignment | S3 | Not required here |

## Scripts

```bash
npm run dev    # development (loads .env)
npm run check  # tsc
npm run build  # Vite client + esbuild server
npm start      # NODE_ENV=production node dist/index.js
```

Environment (see `.env.example`): `DATABASE_URL`, `SESSION_SECRET`, `PORT` (default 5000). Do not commit `.env`.
