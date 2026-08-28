# Canar Project — Detailed Technical Summary

This document matches the **current repository**. It is for developers preparing to explain Canar in an interview. It is not a marketing page.

Source of truth: `server/`, `client/src/`, `shared/schema.ts`, `package.json`.

---

## 1. What the application does

Canar is a session-authenticated professional profile builder with a credit-metered editor.

Typical journey:

1. Visit `/` (landing).
2. Sign up or log in at `/auth` (`client/src/pages/auth-minimal.tsx`).
3. The UI sends the user to `/profile`.
4. If there is no active subscription, `ProtectedRoute` redirects to `/subscription`.
5. The user selects Basic or Premium, confirms **Simulate Payment**, and the server inserts an active `subscriptions` row with initial credits.
6. The user is sent to `/profile` and can edit personal info, education, projects, skills, and experience. Successful writes cost 5 credits.
7. Photo and CV can be uploaded. Photo may appear on the public page; CV stays owner-only.
8. Preview is a client-side edit/preview toggle on the same page.
9. PDF is generated in the browser with jsPDF and does not call a credit API.
10. Share uses a server-generated `share_slug` and `/profile/share/:shareSlug`.
11. Buy Credits is a separate simulated top-up (₹500 → 100 credits) and does not change the plan.
12. Logout destroys the session. Login restores profile, plan, and remaining credits from PostgreSQL.

Signup never auto-activates Basic.

---

## 2. Original business requirements

From the assignment use-case (profile builder + subscription + credits):

- Users must authenticate.
- A plan is required before using the profile builder.
- Basic: ₹1,999 / 500 credits; Premium: ₹2,999 / 1,000 credits.
- Each profile edit (including autosave) costs 5 credits.
- Top-up: ₹500 / 100 credits, only with an active subscription.
- PDF export and sharing should not consume credits.
- Photo and CV upload.
- Public shareable profile.

The original write-up mentioned JWT and Razorpay/Stripe. **This repository does not implement JWT.** Sessions are Passport + `connect.sid`. Payment in the running routes is **simulation**, even though Stripe npm packages are listed in `package.json`.

---

## 3. Final implementation status

| Area | Status | Explanation |
|---|---|---|
| Authentication | PASS | Passport LocalStrategy, express-session, connect-pg-simple, `connect.sid`, `req.user` |
| Authorization | PASS | Owner-scoped queries; `req.user.id`; IDOR checks on section `:id` |
| Profile | PASS | PATCH `/api/profile`; account email written by server; share slug generated |
| Education | PASS | CRUD + From/To/Current + 5-credit writes |
| Projects | PASS | Same pattern |
| Skills | PASS | Same pattern; proficiency enum |
| Experience | PASS | Same pattern |
| Subscriptions | PASS | Subscribe + dedicated upgrade; simulated payment flag; 30-day `end_date` |
| Credits | PASS | Server constants; atomic deduct; top-up separate |
| Autosave | PASS | 1s debounce + flush on unmount/hidden/pagehide |
| Uploads | PASS | Auth, MIME, size, MIME-derived extension; CV owner-only; photo public |
| PDF | PASS | Client jsPDF; pagination helper; no credit charge |
| Sharing | PASS | Public page + public API; filtered fields |
| Routing | PASS | See `client/src/App.tsx` |
| Security | PASS | Appropriate for assignment scope; not a full production hardening claim |
| Testing | PASS | `npm run check`, `npm run build`, disposable API regressions (see §10) |
| Deployment | PARTIAL | Env vars documented; local uploads; no real payments |

---

## 4. Bugs / flaws found during development

Sequence is **inferred from current code and development audits**, not from git commit dates. Recent work is largely uncommitted relative to `main`.

### Bug 1 — Public sharing route missing

**Problem:** Share UI built `/profile/share/:slug`, but Wouter had no matching route, so visitors hit 404.

**How we detected it:** `App.tsx` had no share route; `GET /api/profile/share/:shareSlug` existed in `server/routes.ts`.

**Root cause:** Backend share endpoint without a frontend page.

**Impact:** Assignment sharing feature did not work in the browser.

**Fix:** `client/src/pages/public-profile-page.tsx` and `<Route path="/profile/share/:shareSlug" />` in `App.tsx`.

**Why this fix:** Minimum missing piece; reuse existing Card/Badge styling.

**Alternatives:** Authenticated-only preview. Rejected: the requirement is a public link.

**Interview:** “The API existed but the SPA never routed the URL. We added a public page that calls the unauthenticated share endpoint.”

### Bug 2 — Share slug not generated

**Problem:** `profiles.share_slug` was unique in schema but nothing wrote it, so the share modal stayed empty.

**How we detected it:** Grep showed `shareSlug` only on the schema, GET share, and the modal; no generator.

**Root cause:** Client never sent a slug; server never created one.

**Impact:** Even with a public page, there was no slug to open.

**Fix:** `storage.createOrUpdateProfile` / `ensureShareSlug`; `GET /api/profile` ensures a profile row and slug. Client cannot set `shareSlug` (removed from PATCH body schema).

**Why this fix:** Server authority; stable slug on conflict update (not overwritten).

**Alternatives:** Client UUID. Rejected: spoofable / inconsistent.

**Interview:** “We generate a unique slug on the server when the profile is created, similar to a public handle.”

### Bug 3 — Public share endpoint exposing extra fields

**Problem:** `GET /api/profile/share/:shareSlug` spread the full profile, including `userId` and `cvUrl`.

**How we detected it:** Route returned `{ ...profile, education, ... }`.

**Root cause:** No public DTO.

**Impact:** CV URL and internal user id would leak once sharing worked.

**Fix:** `toPublicSharedProfile()` allowlists public fields.

**Why this fix:** Explicit public contract.

**Alternatives:** Separate public table. Rejected: overkill.

**Interview:** “Public JSON is a filtered DTO, not the database row.”

### Bug 4 — CV publicly readable

**Problem:** `express.static` on `/uploads` served every file without auth.

**How we detected it:** Static mount in `registerRoutes`.

**Root cause:** Convenience vs privacy.

**Impact:** Anyone with the URL could download a CV.

**Fix:** Custom `GET /uploads/:userId/:fileName`. `cv-*` requires authenticated owner. `photo-*` stays public for shared profiles.

**Why this fix:** Photos are meant to render on public pages; CVs are sensitive.

**Alternatives:** Sign all URLs. Rejected: more infrastructure than the assignment needs.

**Interview:** “We split visibility by file kind instead of making everything private or everything public.”

### Bug 5 — Upload extension trusted the client filename

**Problem:** Stored path used the original filename extension, so `evil.html` + `Content-Type: image/jpeg` could be saved as `.html`.

**How we detected it:** `getSafeExtension(originalName)`.

**Root cause:** Filename is attacker-controlled.

**Impact:** Risk of serving unexpected content types.

**Fix:** Map allowed MIME → extension (`.jpg`, `.png`, `.pdf`, etc.).

**Why this fix:** Small, no new libraries.

**Alternatives:** Magic-byte parsers. Considered; not required once files are not executed and CV is private. Remaining production improvement.

**Interview:** “Never trust the upload filename for the stored extension.”

### Bug 6 — Profile email not persisted

**Problem:** UI showed `user.email` as read-only, but PATCH did not write `profiles.email`. PDF and public share read the profile row.

**How we detected it:** Profile builder vs `generateProfilePDF(profile.email)`.

**Root cause:** Two email sources.

**Impact:** PDF/share could omit email.

**Fix:** PATCH/GET set `email` from `req.user.email`; ignore client email for identity.

**Why this fix:** Account email is the source of truth.

**Interview:** “The profile email is copied from the authenticated account, not from a free-text field.”

### Bug 7 — Debug routes exposed

**Problem:** `/debug-auth`, `/simple-test`, and Express HTML test routes were mounted.

**How we detected it:** `App.tsx` and `server/routes.ts`.

**Root cause:** Leftover input-debug work.

**Impact:** Extra registration UI / test pages in the SPA.

**Fix:** Removed from the router. Unused files may still exist on disk but are not routed.

**Interview:** “We unhooked debug pages from production routing rather than relying on people not to visit them.”

### Bug 8 — Profile accessible without a subscription

**Problem:** `/profile` only required login. Users reached the builder with 0 credits; Buy Credits looked like buying a plan.

**How we detected it:** `ProtectedRoute` had `requireSubscription` unused.

**Root cause:** Guard existed, App did not pass it.

**Impact:** UX confusion and assignment mismatch (“must purchase a plan”).

**Fix:** `<ProtectedRoute path="/profile" requireSubscription />`. `/subscription` stays login-only to avoid redirect loops.

**Interview:** “We reused the existing guard instead of inventing a second auth system.”

### Bug 9 — Credit enforcement / atomic writes

**Problem:** Edits must not persist if credits are insufficient; remaining must not go negative.

**How we detected it:** Requirement plus `withProfileEditCredit` transaction (mutate then deduct with `remaining >= 5`).

**Root cause:** Credits and data must share one transaction.

**Impact:** Trust in the credit product.

**Fix:** `storage.withProfileEditCredit`; 402 on failure.

**Why this fix:** Database is the authority.

**Interview:** “If the deduct fails, the whole transaction rolls back, so you never get a saved edit and a missing charge, or a negative balance.”

### Bug 10 — Top-up vs subscription confusion

**Problem:** UI could make “Buy Credits” look like activating Basic.

**How we detected it:** Product audit; top-up already required an active subscription.

**Root cause:** Mixed CTAs; subscribe was a single click without a simulation step.

**Impact:** Users (and reviewers) could mis-attribute Basic activation to top-up.

**Fix:** Explicit Simulate Payment on subscribe/upgrade; Simulate Top-up on credits; copy that top-up does not change plan; hide Buy Credits without a subscription.

**Interview:** “Subscription creates entitlement. Top-up only increments `credits_remaining`.”

### Bug 11 — Could not upgrade Basic → Premium

**Problem:** `POST /api/subscription/subscribe` returned 409 for any active plan.

**How we detected it:** Route + disabled Premium button.

**Root cause:** Duplicate-active guard with no upgrade path.

**Impact:** Assignment mentioned upgrading when credits run out.

**Fix:** `POST /api/subscription/upgrade`; in-place plan change; keep unused credits + 500.

**Why this fix:** One active row; no proration engine.

**Alternative:** Second active subscription. Rejected: unique active index and product rule “at most one active plan.”

**Interview:** “Upgrade is a different endpoint from top-up. We keep leftover credits and add the Premium delta.”

### Bug 12 — Duplicate subscription race

**Problem:** Check-then-insert could create two active rows under concurrency.

**How we detected it:** Application-level `getUserSubscription` then `insert`.

**Root cause:** No DB uniqueness on one active plan per user.

**Impact:** Ambiguous “current plan” / credit row.

**Fix:** Transaction + `pg_advisory_xact_lock`; unique index `subscriptions_one_active_per_user` (`migrations/0002_one_active_subscription.sql`).

**Interview:** “We combined an advisory lock with a partial unique index so the database, not just the if-statement, enforces one active subscription.”

### Bug 13 — Autosave lost on hide/close

**Problem:** Debounce is 1s. Unmount flushed SPA navigations; tab hide/close did not.

**How we detected it:** Code review of debounce vs `beforeunload`.

**Impact:** Last second of typing could vanish on refresh.

**Fix:** Flush the **same** pending maps on `visibilitychange` and `pagehide` (not a second write of already-sent data).

**Why this fix:** Avoid double 5-credit charges. Did not add an offline sync system.

**Interview:** “We flush the pending debounce batch when the page is hidden, without issuing a second PATCH for the same payload.”

### Bug 14 — Delete had no confirmation

**Problem:** Remove immediately deleted a section (and charged 5 credits).

**How we detected it:** Profile builder Remove buttons.

**Impact:** Accidental data loss.

**Fix:** Existing AlertDialog; cancel or confirm.

**Interview:** “Deletes are still the same APIs; we only added a confirm step in the UI.”

### Bug 15 — PDF overflow

**Problem:** `yPosition` page breaks ran only at some section starts, not per line.

**How we detected it:** `client/src/lib/pdf-generator.ts`.

**Impact:** Long bios/descriptions could clip.

**Fix:** `ensureSpace` / `writeLines` pagination. Same layout; no photo embed.

**Interview:** “We paginated the existing jsPDF output instead of redesigning the PDF.”

### Bug 16 — `.gitignore` / env template

**Problem:** `uploads/` could be committed; `*.tar.gz.env` was a broken ignore pattern; no `.env.example`.

**How we detected it:** `.gitignore` contents.

**Impact:** Secrets/user files risk; onboarding friction.

**Fix:** Ignore `uploads/` and `.env`; add `.env.example` with placeholder keys only.

**CONSIDERED / NOT CONFIRMED as a current product bug:** magic-byte validation. MIME + extension + non-execution of uploads is the current assignment posture.

---

## 5. Subscription / credit deep dive

**Source of truth:** PostgreSQL `subscriptions.credits_remaining` for the latest active, non-expired row. UI React Query cache is a display copy.

```
New user
  → users row only
  → GET /api/credits → remaining 0, hasSubscription false

POST subscribe Basic + simulatedPayment
  → credits_allocated 500, credits_remaining 500, plan Basic, active true

Three successful writes
  → 495 → 490 → 485

POST topup + simulatedPayment
  → credit_purchases row (100, 50000 paise)
  → remaining 585
  → plan still Basic

POST upgrade + simulatedPayment
  → plan Premium, allocated 1000
  → remaining 585 + 500 = 1085
  → still one active row
```

Top-up never creates Basic. Subscribe never uses the top-up endpoint.

Concurrent edits: each successful transaction deducts 5 with `WHERE credits_remaining >= 5`. A request that cannot deduct rolls back.

---

## 6. Security deep dive

| Boundary | Client controls | Server controls | Prevents |
|---|---|---|---|
| Authentication | Email/password on login/register | Session id after `req.login` | Forged “I’m user X” without cookie |
| Authorization | Cookie only | `req.user.id` | Body `userId` |
| Ownership | Record UUID in URL | `WHERE id = $id AND user_id = req.user.id` | IDOR on education/projects/skills/experiences |
| Credits | Nothing authoritative | Plan constants, deduct 5, top-up 100 | Fake remaining balance |
| Uploads | File bytes + Content-Type | Auth, MIME allowlist, size, path under `uploads/<userId>` | Arbitrary extension; unauthenticated CV read |
| Public sharing | Slug in URL | Filtered DTO; 404 if missing | CV/userId/password leak |

The server must not trust `{ userId }` or `{ credits: 9999 }`. Subscribe/top-up schemas are strict; extra keys fail validation.

---

## 7. Profile field design

Searchable fields are **frontend suggestion lists**, not SQL master tables. That covers React/Python/SQL/AWS and Marketing/Sales/Communication/Leadership, plus custom strings.

From/To/Current is stored as timestamps + `is_current`, with a derived `duration` label for PDF. Tradeoff: slightly more UI than a single string, but consistent validation and “Present” handling.

---

## 8. Autosave design

Pending maps merge keys for 1 second, then PATCH. Autosave **is** an edit, so it consumes 5 credits when the server commit succeeds. GET/PDF/share do not write profile data (PDF is local), so they do not consume credits.

Flushing on hide/unmount sends the **outstanding batch once**.

---

## 9. File upload design

Photos: public GET so `<img src="/uploads/...">` works on `/profile/share/:slug`.

CVs: authenticated owner GET; omitted from public JSON.

Storage: `uploads/<uuid>/photo-<uuid>.<ext>` or `cv-...`. Production should move this to object storage.

---

## 10. Test / verification history

Verified in this project’s development (not a formal CI suite in `package.json`):

- `npm run check` (tsc)
- `npm run build` (Vite + esbuild)
- Disposable-user API journeys: signup, no-plan 402/403, Basic 500, edits 495, top-up keeping Basic, upgrade remaining+500, public share filtering, CV 401 for guests, MIME extension `.jpg`, logout/login persistence, concurrent subscribe 200+409
- Browser use of share slug observed on the running dev server (**NOT VERIFIED** as a full visual mobile QA pass)

Do not claim Stripe charges, JWT, or multer-based uploads. They are not how the live paths work.
