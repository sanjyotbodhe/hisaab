# Hisaab

**Shared expenses for flatmates, trips and friends, with the fewest payments to settle up.**

Live app: **https://YOUR-APP.vercel.app**
Demo video: **YOUR-VIDEO-LINK**
Repository: https://github.com/sanjyotbodhe/hisaab

---

## Problem statement

When a group shares money (four flatmates paying rent and groceries, eight friends on a Goa trip, a hostel wing ordering food) someone always ends up as the unofficial accountant. Expenses live in WhatsApp messages and UPI screenshots, splits aren't always equal ("I didn't have the drinks"), and at the end nobody knows who owes whom. Settling up turns into a mess of many small payments, often going in circles: A pays B, B pays C, C pays A.

## Target users

- Students and young professionals sharing a flat or PG (recurring rent, Wi-Fi, cook, groceries)
- Friend groups on trips or regular outings
- Hostel / club groups that pool money for events

## Solution

Hisaab is a shared ledger for a group. Anyone in the group records what they paid and who it was for, split equally, by exact amounts, by percentages or by shares. Hisaab keeps an exact running balance for every member (in integer paise, so nothing is lost to rounding), and computes a **simplified settle-up plan**: the smallest practical set of payments that makes everyone even. When someone pays back, they record it and balances update immediately. Recurring costs like rent are added automatically every month.

## Key features (core workflows)

1. **Groups and invites.** Create a group, share an invite link, members join with one click. Admin / member roles; admins manage members, reset the invite link and change settings.
2. **Add an expense with any split.** Equal, exact amounts, percentages or shares, with a live preview of each person's share. Validation explains exactly what is wrong ("Percentages add up to 90%"). Double-clicks and retries never create duplicates.
3. **Balances and settle up.** Each member's net balance, a simplified list of who pays whom (or direct debts only, if the admin turns simplification off), and one-click "Record payment" that is pre-filled with the right amount.
4. **History.** Search, filter (category, person, date range) and paginate expenses; edit or delete with permission checks and conflict detection; a full activity log; CSV export.
5. **Recurring expenses.** "Rent ₹30,000 every month on the 1st" is added automatically, including catching up on any occurrences that fell due while no scheduled run happened. Rules pause themselves if a person in them leaves the group.

## Tech stack

| Layer      | Choice                                                        | Why                                                                                              |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Frontend   | React 18, React Router 7, Vite 8                              | Component-based UI with client-side routing; Vite for fast builds                                |
| Backend    | Node.js 22, Express 5                                         | Express 5 forwards async errors to one error handler                                             |
| Database   | MongoDB (Atlas) with Mongoose                                 | Groups embed members; expenses embed their splits; aggregations compute balances in the database |
| Auth       | JWT in an httpOnly, SameSite cookie; bcrypt                   | No token in JavaScript reach (XSS), cookie not sent cross-site (CSRF)                            |
| Validation | Zod 4                                                         | Every request body / query / param is validated and normalised                                   |
| Security   | Helmet (CSP), express-rate-limit, CSRF header check           | Defence in depth                                                                                 |
| Testing    | Node's built-in test runner, Supertest, mongodb-memory-server | Real HTTP + real MongoDB in tests; GitHub Actions runs them on every push                        |
| Hosting    | Vercel (static React app + one serverless function) + Atlas   | API and React app on one origin: no CORS in production; Vercel Cron for the recurring job        |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React app] -->|fetch /api, cookie| API
    UI -. live split preview .-> SH[(shared/split.js<br/>shared/balances.js)]
  end
  subgraph Vercel
    CDN[Static hosting<br/>client/dist] -.serves.-> UI
    API[api/index.js<br/>Express app, serverless] --> MW[auth · CSRF · zod validation · group membership]
    MW --> R[routes: auth, groups, invites,<br/>expenses, settlements, recurring]
    R --> S[services: balances, recurring, activity]
    S -.uses.-> SH
    CRON[Vercel Cron, daily] -->|GET /api/cron/recurring<br/>Bearer CRON_SECRET| API
  end
  S --> DB[(MongoDB Atlas)]
  R --> DB
```

**Request flow, e.g. "Add expense":**
`React form` → `POST /api/groups/:id/expenses` → `requireAuth` (JWT cookie) → `loadGroupMember` (404 if not a member) → `zod` validation (amount → integer paise, date, ids) → business rules (payer and participants are members, date not in the future) → `computeSplits` (the same function the client used for the preview) → insert with a unique `clientRequestId` (idempotency) → activity log → response → balances recomputed on the next read.

### Folder structure

```
hisaab/
├── api/index.js            # Vercel serverless entry: wraps the Express app
├── vercel.json             # build output, rewrites, cron, security headers
├── shared/                 # pure functions used by BOTH server and client
│   ├── split.js            # money parsing, split engine, rounding
│   └── balances.js         # net balances, pairwise debts, debt simplification
├── server/
│   ├── src/
│   │   ├── app.js          # Express app: security middleware, routes, static client
│   │   ├── server.js       # long-running mode (local): DB, scheduler, graceful shutdown
│   │   ├── models/         # User, Group, Expense, Settlement, Activity, RecurringExpense
│   │   ├── routes/         # HTTP layer: validation + authorization + responses
│   │   ├── services/       # balances (aggregations), recurring job, activity log
│   │   ├── middleware/     # auth, CSRF, validation, group membership, errors
│   │   └── utils/          # errors, calendar dates
│   └── tests/              # unit + API integration tests
└── client/
    └── src/
        ├── pages/          # Auth, Dashboard, Group, Join
        ├── components/     # ExpenseForm, SettleForm, group tabs, UI kit
        └── lib/            # API client, auth context, toasts, formatting
```

### Data model

| Collection          | Key fields                                                                                                                                    | Notes                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `users`             | name, email (unique), passwordHash                                                                                                            | hash never returned                                                              |
| `groups`            | name, members[{user, role, joinedAt}], inviteCode (unique), simplifyDebts                                                                     | members embedded: always read together                                           |
| `expenses`          | group, amount (paise), paidBy, splitType, splits[{user, amount, value}], category, date, deletedAt, clientRequestId, recurring, occurrenceKey | soft delete; unique partial indexes for idempotency and recurring de-duplication |
| `settlements`       | group, from, to, amount, date, deletedAt, clientRequestId                                                                                     | real-world payments                                                              |
| `activities`        | group, actor, type, meta, createdAt                                                                                                           | append-only audit log                                                            |
| `recurringexpenses` | group, amount, paidBy, participants, frequency, anchorDay, nextRunAt, active                                                                  | drives the scheduler                                                             |

### Engineering decisions worth calling out

- **Money is integer paise everywhere.** ₹100 split three ways is 3334 + 3333 + 3333 paise. The leftover paise are assigned with the largest-remainder method, so shares always add up to the exact total and the result is deterministic.
- **One split engine, two places.** `shared/split.js` runs in the browser for the live preview and on the server as the source of truth, so the preview can never disagree with what gets saved.
- **Debt simplification.** Net balances are matched greedily (largest debtor ↔ largest creditor). This always settles everyone exactly and uses at most _n − 1_ payments. Finding the true minimum is NP-hard (it reduces to subset-sum), so greedy is the standard practical choice. The UI shows both views and how many payments simplification saves. A randomised property test checks the guarantees on 200 random groups.
- **Balances are computed, not stored.** Two MongoDB aggregations (`$unwind` splits → `$group` by pair) build the debt graph, so there is no running total that can drift out of sync after edits and deletes.
- **Idempotent writes.** The client generates a UUID per form; a unique partial index on `(group, clientRequestId)` guarantees a double-click, a retry after a timeout, or two concurrent requests create exactly one expense / payment.
- **Optimistic concurrency on edits.** An edit only applies if the expense's version is unchanged since it was opened (`findOneAndUpdate` with `__v` in the filter). Otherwise the API returns `409 EDIT_CONFLICT` with the latest version, and the UI offers to load it, so nobody silently overwrites someone else's change.
- **Atomic invite joins and role changes** with conditional updates (`members.user: {$ne: me}`), so double-clicking Join can't add someone twice.
- **Money can't disappear.** A member can't leave (or be removed) while their balance is non-zero or while they're in an active recurring expense. A group always keeps at least one admin; if the last admin leaves, the longest-standing member is promoted.
- **Recurring job is safe to run anywhere, any number of times.** Each occurrence has a unique `(recurring, occurrenceKey)` index and `nextRunAt` advances with compare-and-set, so concurrent runs never double-charge. Serverless functions can't run timers, so it is triggered three ways: a daily Vercel Cron job (authenticated with `CRON_SECRET`, compared in constant time), right after a rule is created, and whenever a group is opened, so a group never shows balances that are missing an expense already due. Locally, an in-process scheduler runs it every 10 minutes. Monthly rules anchored on the 31st land on the last day of shorter months.
- **Serverless-friendly database access.** The MongoDB connection is opened lazily on the first request and reused by warm function instances; a failed connection is retried on the next request and reported as `503`, never a crash.
- **Calendar dates, not timestamps.** Expense dates are stored as UTC midnight of the chosen date and "today" is evaluated in IST, so an expense never jumps a day between time zones.

### Security

- Passwords hashed with bcrypt (cost 12); login responses are identical for unknown email and wrong password, with a dummy hash to equalise timing.
- JWT in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie; plus a required `X-Requested-With` header on every state-changing request.
- Rate limiting on login/register; strict Content-Security-Policy and security headers (Helmet for the API, `vercel.json` for static files). Fonts are self-hosted, so the app makes no third-party requests.
- Every route checks group membership; non-members get 404 so group ids can't be probed. Edits/deletes are limited to the creator, payer or an admin. Only admins see the invite code.
- All input validated with Zod; search text is regex-escaped; CSV export neutralises spreadsheet formula injection.
- Secrets only in environment variables; `.env` is git-ignored.

### Error handling (examples)

| Situation                        | What happens                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| Split doesn't add up             | `400 INVALID_SPLIT` with the exact difference; the form shows it before submitting |
| Double-click / retried request   | Same expense returned, `duplicate: true`, no second record                         |
| Two people edit the same expense | `409 EDIT_CONFLICT` + latest version; "Load the latest version" button             |
| Leaving with a balance           | `409 UNSETTLED_BALANCE` with the amount                                            |
| Expired session                  | `401`, client returns to login and back to the same page afterwards                |
| Slow cold start / network down   | "Still connecting…" message, network errors with Retry buttons                     |
| Database unreachable             | `503 DB_UNAVAILABLE`; `/api/health` reports `degraded`                             |
| Invalid / reset invite link      | Clear message on the join page                                                     |

## Local setup

**Requirements:** Node.js 22+, and a MongoDB database (a free MongoDB Atlas cluster, or MongoDB running locally).

```bash
git clone https://github.com/sanjyotbodhe/hisaab.git
cd hisaab
npm install                         # installs server and client (npm workspaces)
cp server/.env.example server/.env  # then set MONGODB_URI and JWT_SECRET
```

Run the API and the React dev server in two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173  (proxies /api to the server)
```

Open http://localhost:5173.

**Production-style run** (one Node server serving the built app):

```bash
npm run build
npm start            # set NODE_ENV=production in server/.env for secure cookies
```

**Tests** (a throwaway in-memory MongoDB is downloaded and started automatically):

```bash
npm test             # 34 unit + API integration tests
npm run format:check # Prettier
```

GitHub Actions runs the tests, the formatting check and the production build on every push (`.github/workflows/ci.yml`).

## Environment variables

Set in `server/.env` locally, or in Vercel → Project → Settings → Environment Variables. Never commit real values; `server/.env.example` lists them with placeholders.

| Variable                     | Required       | Description                                                                          |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `MONGODB_URI`                | yes            | MongoDB connection string, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/hisaab` |
| `JWT_SECRET`                 | yes            | Long random string used to sign sessions (32+ characters in production)              |
| `CRON_SECRET`                | yes, on Vercel | Random string; Vercel Cron sends it as `Authorization: Bearer …`                     |
| `NODE_ENV`                   | no             | `development` (default) or `production`. Always production on Vercel                 |
| `PORT`                       | no             | Port for the local server (default `4000`)                                           |
| `CLIENT_ORIGIN`              | no             | Dev-only CORS origin (default `http://localhost:5173`)                               |
| `RECURRING_INTERVAL_MINUTES` | no             | Local scheduler interval (default `10`)                                              |
| `APP_TZ_OFFSET_MINUTES`      | no             | Time zone used for "today" (default `330`, IST)                                      |
| `TEST_MONGODB_URI`           | no             | Use a real MongoDB for tests instead of the in-memory one                            |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deployment

Deployed on **Vercel** with **MongoDB Atlas**. `vercel.json` builds the React app to `client/dist` (served as static files), routes `/api/*` to one serverless function (`api/index.js`, the Express app), falls back to `index.html` for client-side routes, adds security headers, and schedules the daily recurring-expense job.

1. **MongoDB Atlas:** create a free M0 cluster → Database Access: add a database user → Network Access: allow `0.0.0.0/0` (Vercel functions have no fixed IPs) → Connect → Drivers: copy the connection string, insert the password and add the database name: `...mongodb.net/hisaab?retryWrites=true&w=majority`.
2. **Vercel:** Add New → Project → import `sanjyotbodhe/hisaab`. Leave the framework preset as "Other" (settings come from `vercel.json`). Add the environment variables `MONGODB_URI`, `JWT_SECRET` and `CRON_SECRET`, then Deploy.
3. Check `https://YOUR-APP.vercel.app/api/health` returns `{"status":"ok","db":"up"}`.

Live URL: **https://YOUR-APP.vercel.app**

## Limitations and next steps

- Single currency (INR).
- No email notifications; activity feed is in-app only.
- Debt simplification is greedy (≤ n − 1 payments), not the NP-hard true minimum.
- Payments are recorded, not processed (no UPI integration).
- The rate limiter is in-memory, so on serverless each warm instance counts separately.

## Use of AI

AI (Claude) was used extensively, for code generation, tests and documentation, as allowed by the project guidelines. Commits made with AI assistance carry a `Co-Authored-By` trailer.
