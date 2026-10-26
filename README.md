# Hisaab

**Shared expenses for flatmates, trips and friends, with the fewest payments to settle up.**

Live app: **https://YOUR-APP.onrender.com** (first load can take ~50 s while the free server wakes up)
Demo video: **YOUR-VIDEO-LINK**

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
5. **Recurring expenses.** "Rent ₹30,000 every month on the 1st" is added automatically, including catching up on any occurrences missed while the server was asleep. Rules pause themselves if a person in them leaves the group.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18, React Router, Vite | Component-based UI with client-side routing; Vite for fast builds |
| Backend | Node.js 22, Express 5 | Express 5 forwards async errors to one error handler |
| Database | MongoDB (Atlas) with Mongoose | Groups embed members; expenses embed their splits; aggregations compute balances in the database |
| Auth | JWT in an httpOnly, SameSite cookie; bcrypt | No token in JavaScript reach (XSS), cookie not sent cross-site (CSRF) |
| Validation | Zod | Every request body / query / param is validated and normalised |
| Security | Helmet (CSP), express-rate-limit, CSRF header check | Defence in depth |
| Testing | Node's built-in test runner, Supertest, mongodb-memory-server | Real HTTP + real MongoDB in tests |
| Hosting | Render (one web service) + MongoDB Atlas | API and React app on one origin: no CORS in production |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React app] -->|fetch /api, cookie| API
    UI -. live split preview .-> SH[(shared/split.js<br/>shared/balances.js)]
  end
  subgraph Render web service
    API[Express API] --> MW[auth · CSRF · zod validation · group membership]
    MW --> R[routes: auth, groups, invites,<br/>expenses, settlements, recurring]
    R --> S[services: balances, recurring, activity]
    S -.uses.-> SH
    JOB[Recurring scheduler<br/>on boot + every 10 min] --> S
    API --> STATIC[serves built React app]
  end
  S --> DB[(MongoDB Atlas)]
  R --> DB
```

**Request flow, e.g. "Add expense":**
`React form` → `POST /api/groups/:id/expenses` → `requireAuth` (JWT cookie) → `loadGroupMember` (404 if not a member) → `zod` validation (amount → integer paise, date, ids) → business rules (payer and participants are members, date not in the future) → `computeSplits` (the same function the client used for the preview) → insert with a unique `clientRequestId` (idempotency) → activity log → response → balances recomputed on the next read.

### Folder structure

```
hisaab/
├── shared/                 # pure functions used by BOTH server and client
│   ├── split.js            # money parsing, split engine, rounding
│   └── balances.js         # net balances, pairwise debts, debt simplification
├── server/
│   ├── src/
│   │   ├── app.js          # Express app: security middleware, routes, static client
│   │   ├── server.js       # startup, DB connection, scheduler, graceful shutdown
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

| Collection | Key fields | Notes |
|---|---|---|
| `users` | name, email (unique), passwordHash | hash never returned |
| `groups` | name, members[{user, role, joinedAt}], inviteCode (unique), simplifyDebts | members embedded: always read together |
| `expenses` | group, amount (paise), paidBy, splitType, splits[{user, amount, value}], category, date, deletedAt, clientRequestId, recurring, occurrenceKey | soft delete; unique partial indexes for idempotency and recurring de-duplication |
| `settlements` | group, from, to, amount, date, deletedAt, clientRequestId | real-world payments |
| `activities` | group, actor, type, meta, createdAt | append-only audit log |
| `recurringexpenses` | group, amount, paidBy, participants, frequency, anchorDay, nextRunAt, active | drives the scheduler |

### Engineering decisions worth calling out

- **Money is integer paise everywhere.** ₹100 split three ways is 3334 + 3333 + 3333 paise. The leftover paise are assigned with the largest-remainder method, so shares always add up to the exact total and the result is deterministic.
- **One split engine, two places.** `shared/split.js` runs in the browser for the live preview and on the server as the source of truth, so the preview can never disagree with what gets saved.
- **Debt simplification.** Net balances are matched greedily (largest debtor ↔ largest creditor). This always settles everyone exactly and uses at most *n − 1* payments. Finding the true minimum is NP-hard (it reduces to subset-sum), so greedy is the standard practical choice. The UI shows both views and how many payments simplification saves. A randomised property test checks the guarantees on 200 random groups.
- **Balances are computed, not stored.** Two MongoDB aggregations (`$unwind` splits → `$group` by pair) build the debt graph, so there is no running total that can drift out of sync after edits and deletes.
- **Idempotent writes.** The client generates a UUID per form; a unique partial index on `(group, clientRequestId)` guarantees a double-click, a retry after a timeout, or two concurrent requests create exactly one expense / payment.
- **Optimistic concurrency on edits.** An edit only applies if the expense's version is unchanged since it was opened (`findOneAndUpdate` with `__v` in the filter). Otherwise the API returns `409 EDIT_CONFLICT` with the latest version, and the UI offers to load it, so nobody silently overwrites someone else's change.
- **Atomic invite joins and role changes** with conditional updates (`members.user: {$ne: me}`), so double-clicking Join can't add someone twice.
- **Money can't disappear.** A member can't leave (or be removed) while their balance is non-zero or while they're in an active recurring expense. A group always keeps at least one admin; if the last admin leaves, the longest-standing member is promoted.
- **Recurring job is safe to run anywhere, any number of times.** Each occurrence has a unique `(recurring, occurrenceKey)` index and `nextRunAt` advances with compare-and-set, so concurrent runs or restarts never double-charge. It runs on boot to catch up after the free server sleeps, then every 10 minutes. Monthly rules anchored on the 31st land on the last day of shorter months.
- **Calendar dates, not timestamps.** Expense dates are stored as UTC midnight of the chosen date and "today" is evaluated in IST, so an expense never jumps a day between time zones.

### Security

- Passwords hashed with bcrypt (cost 12); login responses are identical for unknown email and wrong password, with a dummy hash to equalise timing.
- JWT in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie; plus a required `X-Requested-With` header on every state-changing request.
- Rate limiting on login/register; Helmet with a strict Content-Security-Policy.
- Every route checks group membership; non-members get 404 so group ids can't be probed. Edits/deletes are limited to the creator, payer or an admin. Only admins see the invite code.
- All input validated with Zod; search text is regex-escaped; CSV export neutralises spreadsheet formula injection.
- Secrets only in environment variables; `.env` is git-ignored.

### Error handling (examples)

| Situation | What happens |
|---|---|
| Split doesn't add up | `400 INVALID_SPLIT` with the exact difference; the form shows it before submitting |
| Double-click / retried request | Same expense returned, `duplicate: true`, no second record |
| Two people edit the same expense | `409 EDIT_CONFLICT` + latest version; "Load the latest version" button |
| Leaving with a balance | `409 UNSETTLED_BALANCE` with the amount |
| Expired session | `401`, client returns to login and back to the same page afterwards |
| Server asleep / network down | "Waking up the server…" message, network errors with Retry buttons |
| Database unreachable | `503 DB_UNAVAILABLE`; `/api/health` reports `degraded` |
| Invalid / reset invite link | Clear message on the join page |

## Local setup

**Requirements:** Node.js 22+, and a MongoDB database (a free MongoDB Atlas cluster, or MongoDB running locally).

```bash
git clone https://github.com/YOUR-USERNAME/hisaab.git
cd hisaab
npm run install:all                 # installs server and client dependencies
cp server/.env.example server/.env  # then edit MONGODB_URI and JWT_SECRET
```

Run the API and the React dev server in two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173  (proxies /api to the server)
```

Open http://localhost:5173.

**Production-style run** (one server serving the built app):

```bash
npm run build
NODE_ENV=production npm start       # http://localhost:4000
```

**Tests** (start a throwaway in-memory MongoDB automatically):

```bash
npm test
```

## Environment variables

Set in `server/.env` locally, or in the hosting dashboard. Never commit real values.

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/hisaab` |
| `JWT_SECRET` | yes | Long random string used to sign sessions (32+ characters in production) |
| `NODE_ENV` | no | `development` (default) or `production` (secure cookies, no CORS) |
| `PORT` | no | Port to listen on (default `4000`; Render sets it automatically) |
| `CLIENT_ORIGIN` | no | Dev-only CORS origin (default `http://localhost:5173`) |
| `RECURRING_INTERVAL_MINUTES` | no | How often the recurring job runs (default `10`) |
| `APP_TZ_OFFSET_MINUTES` | no | Time zone used for "today" (default `330`, IST) |
| `TEST_MONGODB_URI` | no | Use a real MongoDB for tests instead of the in-memory one |

## Deployment

The app is deployed as **one Render web service** (API + built React app) with **MongoDB Atlas**.

1. **MongoDB Atlas:** create a free M0 cluster → Database Access: add a user → Network Access: allow `0.0.0.0/0` (Render's IPs are dynamic) → copy the connection string and add the database name (`/hisaab`).
2. **Render:** New → Blueprint → select this repository. `render.yaml` sets build/start commands, the health check and generates `JWT_SECRET`. Paste `MONGODB_URI` when prompted.
3. Open the service URL. Health check: `/api/health`.

Build: `npm run build` (installs both apps, builds the client into `client/dist`). Start: `npm start` (Express serves the API and `client/dist`).

Live URL: **https://YOUR-APP.onrender.com**

## Limitations and next steps

- Single currency (INR).
- No email notifications; activity feed is in-app only.
- Debt simplification is greedy (≤ n − 1 payments), not the NP-hard true minimum.
- Payments are recorded, not processed (no UPI integration).

## Use of AI

AI (Claude) was used as a pair programmer for scaffolding, code generation, tests and documentation. Design decisions, review and testing of the workflows were done during development; see the commit history.
