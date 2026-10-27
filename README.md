# Hisaab

**One place for a group's shared money and trips: split expenses, plan the trip together, keep bookings, and settle up with the fewest payments (pay by UPI, or online through Razorpay with verified settlement).**

Live app: **https://hisaab-eosin-five.vercel.app**
Demo video: https://drive.google.com/file/d/1twXtK_6SaT8V3onmVryt3C4WeE8fPCup/view?usp=sharing
Repository: https://github.com/sanjyotbodhe/hisaab

---

## Screenshots

| Overview: balance, insights carousel, spending, coming up | Trip plan: itinerary, group votes, map, famous places |
| --------------------------------------------------------- | ----------------------------------------------------- |
| ![Overview](docs/screenshots/dashboard.png)               | ![Trip plan](docs/screenshots/trip-plan.png)          |
| **Balances and settle-up plan**                           | **Pay via UPI (QR on laptops, app link on phones)**   |
| ![Balances](docs/screenshots/balances.png)                | ![UPI](docs/screenshots/upi.png)                      |
| **Bookings vault**                                        | **Expenses with filters, and the group at a glance**  |
| ![Bookings](docs/screenshots/bookings.png)                | ![Expenses](docs/screenshots/expenses.png)            |
| **Paid online through Razorpay (verified)**               | **Edit conflict detected**                            |
| ![Paid online](docs/screenshots/pay-online.png)           | ![Edit conflict](docs/screenshots/edit-conflict.png)  |
| **Mobile**                                                | **Log in**                                            |
| ![Mobile](docs/screenshots/mobile.png)                    | ![Log in](docs/screenshots/sign-up.png)               |

## Problem statement

When a group shares money (four flatmates paying rent and groceries, eight friends on a Goa trip, a hostel wing ordering food) someone always ends up as the unofficial accountant. Expenses live in WhatsApp messages and UPI screenshots, splits aren't always equal ("I didn't have the drinks"), and at the end nobody knows who owes whom. Settling up turns into a mess of many small payments, often going in circles: A pays B, B pays C, C pays A.

Trips make it worse. The plan is scattered across a WhatsApp poll, a Google Doc and someone's Maps list; the flight PNR and hotel confirmation are buried in one person's inbox; nobody knows how much of the budget is gone; and paying someone back means asking for their UPI ID again.

## Target users

- Students and young professionals sharing a flat or PG (recurring rent, Wi-Fi, cook, groceries)
- Friend groups on trips or regular outings
- Hostel / club groups that pool money for events

## Solution

Hisaab is a shared ledger for a group. Anyone in the group records what they paid and who it was for, split equally, by exact amounts, by percentages or by shares. Hisaab keeps an exact running balance for every member (in integer paise, so nothing is lost to rounding), and computes a **simplified settle-up plan**: the smallest practical set of payments that makes everyone even. When someone pays back, they record it and balances update immediately. Recurring costs like rent are added automatically every month.

For trips, the same group gets a shared plan: destination, dates and budget; a day-by-day itinerary; an ideas list everyone votes on; a map of every stop plus famous places nearby; and a bookings vault where any booking becomes a split expense in one click. Paying back is one tap: the settle-up plan opens your UPI app with the exact amount, or takes the payment online through Razorpay, in which case the server verifies it and records it automatically.

## Key features (core workflows)

1. **Groups and invites.** Create a group, share an invite link, members join with one click. Admin / member roles; admins manage members, reset the invite link and change settings.
2. **Add an expense with any split.** Equal, exact amounts, percentages or shares, with a live preview of each person's share. Validation explains exactly what is wrong ("Percentages add up to 90%"). Double-clicks and retries never create duplicates. Search, filters, CSV export, edit-conflict detection and recurring expenses (rent, Wi-Fi) build on it.
3. **Balances, settle up and pay by UPI.** Each member's net balance, a simplified list of who pays whom, and one-click "Record payment". If the person you owe has saved a UPI ID, **Pay via UPI** opens GPay / PhonePe / Paytm with the exact amount on a phone, or shows a QR code to scan on a laptop. **Pay online** (Razorpay: UPI, cards, netbanking) charges the exact amount owed; once Razorpay's signature is verified on the server the payment is recorded automatically, marked _online_, and can't be deleted.
4. **Plan the trip together.** Destination, dates and budget for the group. A day-by-day itinerary, an ideas list the group **votes** on before scheduling, and a **map** (OpenStreetMap) with numbered pins for the plan and the **famous places near the destination** (from Wikipedia, with photos), each addable in one tap. Every stop has a Google Maps directions link.
5. **Bookings and budget.** Save flight / train / bus / stay / activity confirmations (PNR, times, cost, who paid) where the whole group can see them. **Add as expense** turns a booking into an equal split exactly once. "Find and book" links open Google Flights, Booking.com, IRCTC and redBus pre-filled with the trip's destination and dates. The budget tracker shows spent vs budget and a breakdown by category.

**On top of the five workflows: your money at a glance.** The overview adds up _your share_ across every group (not just what you happened to pay): an insights carousel (this month vs last, top category, biggest expense, next trip or bill, who to settle with), six months of spending with a category breakdown, what's coming up in the next 45 days (trip dates, rent and other recurring bills) and the latest activity from all your groups. Each group shows the same at its own level: total, per person, monthly trend, where the money went and who paid.

## Tech stack

| Layer      | Choice                                                         | Why                                                                                              |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Frontend   | React 18, React Router 7, Vite 8, Leaflet, qrcode              | Component-based UI; Leaflet renders the OpenStreetMap map; UPI QR codes generated in the browser |
| Payments   | Razorpay Orders API + Checkout, webhooks                       | Indian payment methods (UPI, cards, netbanking); HMAC-signed results verified on the server      |
| Backend    | Node.js 22, Express 5                                          | Express 5 forwards async errors to one error handler                                             |
| Database   | MongoDB (Atlas) with Mongoose                                  | Groups embed members; expenses embed their splits; aggregations compute balances in the database |
| Auth       | JWT in an httpOnly, SameSite cookie; bcrypt                    | No token in JavaScript reach (XSS), cookie not sent cross-site (CSRF)                            |
| Validation | Zod 4                                                          | Every request body / query / param is validated and normalised                                   |
| Security   | Helmet (CSP), express-rate-limit, CSRF header check            | Defence in depth                                                                                 |
| Testing    | Node's built-in test runner, Supertest, mongodb-memory-server  | Real HTTP + real MongoDB in tests; GitHub Actions runs them on every push                        |
| Hosting    | Vercel Services (Vite client + Express server) + MongoDB Atlas | One domain for UI and API: no CORS in production; the Express app runs as a serverless function  |
| External   | OpenStreetMap (tiles + Nominatim search), Wikipedia API        | Free, no API keys or billing; called through the server with caching and throttling              |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React app] -->|fetch /api, cookie| API
    UI -. live split preview .-> SH[(server/src/shared<br/>split.js, balances.js)]
  end
  subgraph Vercel project - one domain
    CL[client service<br/>Vite static build] -.serves.-> UI
    API[server service<br/>Express, index.js] --> MW[auth · CSRF · zod validation · group membership]
    MW --> R[routes: auth, groups, invites, expenses, settlements,<br/>recurring, plan, bookings, places, payments, me]
    R --> S[services: balances, overview, recurring catch-up,<br/>activity, places, razorpay]
    S -.uses.-> SH
  end
  S --> DB[(MongoDB Atlas<br/>incl. shared lookup cache)]
  R --> DB
  S -->|search, throttled 1/s| OSM[OpenStreetMap Nominatim]
  S -->|nearby attractions| WIKI[Wikipedia API]
  S -->|create order| RZP[Razorpay API]
  UI -->|checkout| RZP
  RZP -->|signed webhook| API
  UI -->|map tiles| TILES[tile.openstreetmap.org]
```

**Request flow, e.g. "Add expense":**
`React form` → `POST /api/groups/:id/expenses` → `requireAuth` (JWT cookie) → `loadGroupMember` (404 if not a member) → `zod` validation (amount → integer paise, date, ids) → business rules (payer and participants are members, date not in the future) → `computeSplits` (the same function the client used for the preview) → insert with a unique `clientRequestId` (idempotency) → activity log → response → balances recomputed on the next read.

### Folder structure

```
hisaab/
├── vercel.json             # Vercel Services: client + server services, public routing
├── server/                 # "server" service (Express API)
│   ├── index.js            # Vercel entrypoint: exports the app with a lazy DB connection
│   ├── src/
│   │   ├── shared/         # pure money logic, also imported by the client for live previews
│   │   │   ├── split.js    # money parsing, split engine, rounding
│   │   │   └── balances.js # net balances, pairwise debts, debt simplification
│   │   ├── app.js          # Express app: security middleware, routes, static client (local)
│   │   ├── server.js       # long-running mode (local): DB, scheduler, graceful shutdown
│   │   ├── models/         # User, Group, Expense, Settlement, Activity, RecurringExpense,
│   │   │                   # PlanItem, Booking, Payment, ExternalCache
│   │   ├── routes/         # HTTP layer: validation + authorization + responses
│   │   ├── services/       # balances (aggregations), recurring job, activity log, places (cache + throttle),
│   │   │                   # razorpay (orders, signature checks, exactly-once settlement),
│   │   │                   # overview (cross-group insights for the dashboard)
│   │   ├── middleware/     # auth, CSRF, validation, group membership, errors
│   │   └── utils/          # errors, calendar dates
│   └── tests/              # unit + API integration tests
└── client/                 # "client" service (React + Vite)
    └── src/
        ├── pages/          # Auth, Dashboard, Group, Join
        ├── components/     # ExpenseForm, SettleForm, TripMap, PlaceSearch, UpiPay, RazorpayPay,
        │                   # dashboard panels (insights carousel, charts), group tabs, UI kit
        └── lib/            # API client, auth context, toasts, formatting
```

### Data model

| Collection          | Key fields                                                                                                                                    | Notes                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `users`             | name, email (unique), passwordHash, upiId                                                                                                     | hash never returned; UPI ID only shown to fellow group members                   |
| `groups`            | name, members[{user, role, joinedAt}], inviteCode (unique), simplifyDebts, trip{destination, startDate, endDate, budget}                      | members and trip embedded: always read together                                  |
| `expenses`          | group, amount (paise), paidBy, splitType, splits[{user, amount, value}], category, date, deletedAt, clientRequestId, recurring, occurrenceKey | soft delete; unique partial indexes for idempotency and recurring de-duplication |
| `settlements`       | group, from, to, amount, date, deletedAt, clientRequestId, method (manual / razorpay), providerRef                                            | real-world payments; verified online ones can't be deleted                       |
| `payments`          | group, from, to, amount, orderId (unique), paymentId (unique), status (created / paid), paidVia, settlement                                   | one Razorpay order; status flips once, by compare-and-set                        |
| `activities`        | group, actor, type, meta, createdAt                                                                                                           | append-only audit log                                                            |
| `recurringexpenses` | group, amount, paidBy, participants, frequency, anchorDay, nextRunAt, active                                                                  | drives the scheduler                                                             |
| `planitems`         | group, title, kind, day (null = idea), time, place{name, lat, lng, thumbnail, url}, notes, votes[user]                                        | votes updated atomically                                                         |
| `bookings`          | group, type, title, provider, reference, start/end date+time, location, cost (paise), paidBy, expense                                         | `expense` set by a conditional claim, so one booking → at most one expense       |
| `externalcaches`    | key (unique), value, expiresAt                                                                                                                | TTL index expires entries; shared by all serverless instances                    |

### Engineering decisions worth calling out

- **Money is integer paise everywhere.** ₹100 split three ways is 3334 + 3333 + 3333 paise. The leftover paise are assigned with the largest-remainder method, so shares always add up to the exact total and the result is deterministic.
- **One split engine, two places.** `server/src/shared/split.js` runs in the browser for the live preview and on the server as the source of truth, so the preview can never disagree with what gets saved.
- **Debt simplification.** Net balances are matched greedily (largest debtor ↔ largest creditor). This always settles everyone exactly and uses at most _n − 1_ payments. Finding the true minimum is NP-hard (it reduces to subset-sum), so greedy is the standard practical choice. The UI shows both views and how many payments simplification saves. A randomised property test checks the guarantees on 200 random groups.
- **Balances are computed, not stored.** Two MongoDB aggregations (`$unwind` splits → `$group` by pair) build the debt graph, so there is no running total that can drift out of sync after edits and deletes.
- **Insights are computed the same way.** `GET /api/me/overview` runs aggregations over the user's own splits (their share, not what they paid) across all their groups: six months by calendar month with empty months filled in, this month by category, the biggest expense, active recurring rules and trips in the next 45 days, and the latest activity. Due recurring expenses are caught up first, so "this month" is never stale, and the dashboard reloads it whenever balances change.
- **Idempotent writes.** The client generates a UUID per form; a unique partial index on `(group, clientRequestId)` guarantees a double-click, a retry after a timeout, or two concurrent requests create exactly one expense / payment.
- **Optimistic concurrency on edits.** An edit only applies if the expense's version is unchanged since it was opened (`findOneAndUpdate` with `__v` in the filter). Otherwise the API returns `409 EDIT_CONFLICT` with the latest version, and the UI offers to load it, so nobody silently overwrites someone else's change.
- **Atomic invite joins and role changes** with conditional updates (`members.user: {$ne: me}`), so double-clicking Join can't add someone twice.
- **Money can't disappear.** A member can't leave (or be removed) while their balance is non-zero or while they're in an active recurring expense. A group always keeps at least one admin; if the last admin leaves, the longest-standing member is promoted.
- **Recurring expenses without depending on a timer.** Each occurrence has a unique `(recurring, occurrenceKey)` index and `nextRunAt` advances with compare-and-set, so the job can run concurrently or repeatedly and never double-charges. Serverless functions can't run background timers, so due occurrences are caught up whenever they matter: right after a rule is created, and whenever the group list or a group is opened (before any balance is computed). An external scheduler can also call the secured `/api/cron/recurring` endpoint, and locally an in-process scheduler runs every 10 minutes. Monthly rules anchored on the 31st land on the last day of shorter months.
- **Serverless-friendly database access.** The MongoDB connection is opened lazily on the first request and reused by warm function instances; a failed connection is retried on the next request and reported as `503`, never a crash.
- **Hash-based client routes** (`/#/groups/…`). Deep links, invite links and page refreshes work on any static host with no server-side fallback rule.
- **Votes can't be lost or doubled.** Voting is a single `$addToSet` / `$pull` on the item, so simultaneous votes from the whole group all count and repeat clicks don't inflate the total (tested with concurrent requests).
- **A booking becomes an expense exactly once.** The booking is claimed with a conditional update (`expense: null → newId`) before the expense is written; double-clicks get `409 ALREADY_EXPENSED`, a failed write releases the claim, and if that expense is later deleted the booking can be added again.
- **Responsible use of free third-party services.** Place search and attractions go through the server, never straight from the browser: results are cached in MongoDB (shared across serverless instances, TTL-expired) with an in-memory layer in front, calls to Nominatim are serialised to at most one per second, every request identifies the app with a User-Agent and times out after 7 s, users are rate-limited, and provider failures come back as a clear `502` instead of a crash.
- **Pay via UPI uses the standard `upi://pay` deep link** (payee, name, exact amount, note). Nothing is charged by Hisaab; after paying, the user records the payment so balances stay the source of truth.
- **Online payments are recorded exactly once, and only when proven.** The server creates the Razorpay order: it decides the amount (capped at what the payer actually owes) and remembers who pays whom, so the browser can't change either. A payment counts only after the server checks Razorpay's HMAC-SHA256 signature (`order_id|payment_id` with the key secret; the raw request body with the webhook secret for webhooks, compared in constant time). The checkout callback and the webhook can both arrive, in any order and more than once: the `payments` row flips `created → paid` with a compare-and-set, and the settlement uses `razorpay:<payment id>` as its idempotency key, so exactly one settlement is created. If the browser closes before the callback, the webhook still records it. The key secret never leaves the server, and provider error text is never passed on to the client.
- **No fake booking.** Real booking needs partner APIs with payments; instead the app links out to booking sites with the trip's destination and dates pre-filled, and keeps the resulting confirmations.
- **Calendar dates, not timestamps.** Expense dates are stored as UTC midnight of the chosen date and "today" is evaluated in IST, so an expense never jumps a day between time zones.

### Security

- Passwords hashed with bcrypt (cost 12); login responses are identical for unknown email and wrong password, with a dummy hash to equalise timing.
- JWT in an `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie; plus a required `X-Requested-With` header on every state-changing request.
- Rate limiting on login/register; strict Content-Security-Policy: Helmet sets it (plus other security headers) on every API response, and the production build of the React page carries the same policy in a `<meta>` tag. Fonts are self-hosted; the only third-party content the page loads is OpenStreetMap map tiles, Wikimedia thumbnails and Razorpay Checkout (script and frame), all allow-listed in the CSP.
- Razorpay results are trusted only after server-side signature verification; the webhook endpoint rejects unsigned or tampered bodies with `400` and is disabled (`404`) unless a webhook secret is configured.
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
| Online payment cancelled / fails | Nothing recorded; toast explains, balance unchanged                                |
| Tampered payment signature       | `400 BAD_SIGNATURE`, nothing recorded                                              |
| Paying more than you owe         | `400 AMOUNT_TOO_LARGE` before an order is created                                  |
| Razorpay unreachable             | `502 PAYMENT_PROVIDER_DOWN`; UPI and manual recording still work                   |

## Local setup

**Requirements:** Node.js 22+, and a MongoDB database (a free MongoDB Atlas cluster, or MongoDB running locally).

```bash
git clone https://github.com/sanjyotbodhe/hisaab.git
cd hisaab
npm run install:all                 # installs root tooling, server and client
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
npm test             # 53 unit + API integration tests
npm run format:check # Prettier
```

GitHub Actions runs the tests, the formatting check and the production build on every push (`.github/workflows/ci.yml`).

## Environment variables

Set in `server/.env` locally, or in Vercel → Project → Settings → Environment Variables. Never commit real values; `server/.env.example` lists them with placeholders.

| Variable                     | Required | Description                                                                          |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `MONGODB_URI`                | yes      | MongoDB connection string, e.g. `mongodb+srv://user:pass@cluster.mongodb.net/hisaab` |
| `JWT_SECRET`                 | yes      | Long random string used to sign sessions (32+ characters in production)              |
| `CRON_SECRET`                | no       | Enables `/api/cron/recurring` for an external scheduler (`Authorization: Bearer …`)  |
| `RAZORPAY_KEY_ID`            | no       | Razorpay key id (`rzp_test_…` for test mode). With the secret, enables Pay online    |
| `RAZORPAY_KEY_SECRET`        | no       | Razorpay key secret. Server-only; used to create orders and verify signatures        |
| `RAZORPAY_WEBHOOK_SECRET`    | no       | Secret of the Razorpay webhook; enables `/api/payments/webhook`                      |
| `NODE_ENV`                   | no       | `development` (default) or `production`. Always production on Vercel                 |
| `PORT`                       | no       | Port for the local server (default `4000`)                                           |
| `CLIENT_ORIGIN`              | no       | Dev-only CORS origin (default `http://localhost:5173`)                               |
| `RECURRING_INTERVAL_MINUTES` | no       | Local scheduler interval (default `10`)                                              |
| `APP_TZ_OFFSET_MINUTES`      | no       | Time zone used for "today" (default `330`, IST)                                      |
| `TEST_MONGODB_URI`           | no       | Use a real MongoDB for tests instead of the in-memory one                            |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deployment

Deployed on **Vercel** using **Vercel Services** with **MongoDB Atlas**. `vercel.json` defines two services in one project, on one domain:

| Service  | Root      | Framework | Public path     | Notes                                                                           |
| -------- | --------- | --------- | --------------- | ------------------------------------------------------------------------------- |
| `server` | `server/` | Express   | `/api/*`        | Entrypoint `server/index.js` (auto-detected); receives the full `/api/...` path |
| `client` | `client/` | Vite      | everything else | Static build of the React app                                                   |

The browser calls the API on the same origin (`/api/...`), so there is no CORS and no service-to-service traffic (no bindings needed).

1. **MongoDB Atlas:** create a free M0 cluster → Database Access: add a database user → Network Access: allow `0.0.0.0/0` (Vercel functions have no fixed IPs) → Connect → Drivers: copy the connection string, insert the password and add the database name: `...mongodb.net/hisaab?retryWrites=true&w=majority`.
2. **Vercel:** Add New → Project → import `sanjyotbodhe/hisaab`. Vercel reads the services from `vercel.json`. Add the environment variables `MONGODB_URI` and `JWT_SECRET` (optionally `CRON_SECRET` and the Razorpay variables), then Deploy.
3. Check `https://hisaab-eosin-five.vercel.app/api/health` returns `{"status":"ok","db":"up"}`.
4. **Razorpay (optional):** in the Razorpay Dashboard (Test mode) → Account & Settings → API Keys, generate a key and add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Vercel. For the webhook: Account & Settings → Webhooks → Add: URL `https://hisaab-eosin-five.vercel.app/api/payments/webhook`, events `payment.captured` and `order.paid`, a secret of your choice, which also goes into `RAZORPAY_WEBHOOK_SECRET`. Redeploy after changing variables. In test mode, use Razorpay's test UPI ID `success@razorpay` or test cards; no real money moves.

Live URL: **https://hisaab-eosin-five.vercel.app**

## Limitations and next steps

- Single currency (INR).
- No email notifications; activity feed is in-app only.
- Debt simplification is greedy (≤ n − 1 payments), not the NP-hard true minimum.
- Pay via UPI (deep link / QR) can't be verified, so the payer records it; **Pay online** through Razorpay is verified and recorded automatically.
- Razorpay pays into one merchant account (the app owner's). Sending the money straight to the friend's bank needs Razorpay Route (linked accounts with KYC), so the demo runs in test mode.
- Refunds of online payments aren't handled in the app.
- Flights and hotels are booked on the providers' sites; Hisaab stores the confirmations rather than booking itself (that needs partner APIs and payments).
- Place search and attractions use free public services (OpenStreetMap, Wikipedia) that ask for light usage; heavy traffic would need a paid geocoding plan.
- Plan items are last-write-wins when two people edit the same item at once (expenses use conflict detection).
- The rate limiter is in-memory, so on serverless each warm instance counts separately.

## Credits

Built from scratch for this project; not based on an existing app or template. It uses open-source libraries (React, Express, Mongoose, Zod, Leaflet and others listed in the `package.json` files) and free data services: map tiles and place search © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, and nearby places and photos from [Wikipedia](https://www.wikipedia.org/) / Wikimedia Commons (attributed in the app).

## Use of AI

AI (Claude) was used as an engineering tool for code generation, testing, debugging and documentation, as the project guidelines allow. Every feature was tested end to end (53 automated tests plus browser walkthroughs) before it was committed.
