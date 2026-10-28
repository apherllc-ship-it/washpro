# WashPro – CRM & online booking for power washing / soft washing

A full-stack, installable web app (PWA) for an exterior cleaning business:

- **Customers** measure their property on a satellite map, get an itemized instant quote, confirm it, book a time slot, and track the job live (with before/after photos).
- **Technicians (pros)** see their jobs on a calendar, update status from their phone ("On the way" → "In progress" → "Completed"), add notes and upload photos.
- **Admins** manage bookings on a calendar, assign technicians, edit services and pricing rules, set hours / blocked days / crews, manage users, and use a CRM view of customers (contact info, job history, notes, total spent).

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS, mobile-first, PWA via `vite-plugin-pwa` |
| Backend | Node.js + Express |
| Database | PostgreSQL + Prisma |
| Auth | Email/password (bcrypt), JWT in an httpOnly cookie, roles `CUSTOMER` / `PRO` / `ADMIN`, password reset by email |
| Integrations | Google Maps JS + Places (New) + Geometry, Geocoding, Routes and Solar APIs; Stripe Checkout (deposits); SMTP email; Twilio SMS |

---

## Project layout

```
client/                React PWA
  src/pages/           Home, auth, QuoteBuilder, customer/, pro/, admin/
  src/components/      MeasureMap, AddressSearch, SlotPicker, MonthCalendar, BookingParts…
  src/lib/maps.js      Maps loader, surface types, area/length → billable quantity
  scripts/make-icons.mjs  Regenerates PWA icons
server/
  prisma/schema.prisma Database schema
  prisma/migrations/   SQL migrations (applied with `prisma migrate deploy`)
  prisma/seed.js       Idempotent seed (settings, hours, admin, sample services & pricing)
  src/lib/pricing.js   Pricing engine (server-side, never trusts client prices)
  src/lib/availability.js  Slots, crew capacity, double-booking lock
  src/lib/bookings.js  Status workflow + timeline events
  src/lib/notify.js    Email / SMS / in-app notifications
  src/routes/          auth, me, public, quotes, bookings, jobs (pro + photos), admin
  test/                Unit tests (node:test)
render.yaml            Render Blueprint (web service + Postgres)
```

---

## Local setup

**Requirements:** Node.js 22.9+ and PostgreSQL 14+ (local install, Docker, or a free hosted DB such as Render/Neon/Supabase).

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure environment
cp .env.example server/.env
#    edit server/.env – at minimum DATABASE_URL and JWT_SECRET
#    set SEED_DEMO=true to get demo pro/customer accounts

# 3. Create tables and seed sample services/pricing
npm --prefix server run migrate
npm --prefix server run seed

# 4. Run (two terminals)
npm run dev:server     # API on http://localhost:4000
npm run dev:client     # App on http://localhost:5173 (proxies /api to :4000)
```

Sign in at http://localhost:5173/login:

| Role | Email | Password |
|---|---|---|
| Admin | `ADMIN_EMAIL` (default `admin@washpro.test`) | `ADMIN_PASSWORD` (default `Admin12345`) |
| Pro (with `SEED_DEMO=true`) | `pro@washpro.test`, `pro2@washpro.test` | `Password123` |
| Customer (with `SEED_DEMO=true`) | `customer@washpro.test` | `Password123` |

**Change the admin password immediately on a real deployment.**

Without SMTP configured, emails (including password-reset links) are printed to the server console. Without Google keys, the quote page falls back to typing the address and entering measurements by hand.

Run the tests with `npm test`.

> **Windows + npm 11 note:** npm 11 blocks package install scripts by default. `server/package.json` already allow-lists Prisma under `allowScripts`. If Prisma complains its engines are missing, run `npm --prefix server rebuild prisma @prisma/engines @prisma/client`.

---

## Environment variables

All secrets live in environment variables – see [.env.example](.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes (prod) | 32+ random chars for signing session tokens |
| `APP_URL` | yes (prod) | Public URL, used in email links and Stripe redirects |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first deploy | First admin account (created only if missing) |
| `SEED_DEMO` | no | `true` creates demo pro/customer accounts |
| `BUSINESS_NAME`, `BUSINESS_ADDRESS`, `BUSINESS_LAT/LNG`, `BUSINESS_EMAIL/PHONE` | no | Initial business info (editable later in Admin → Settings) |
| `GOOGLE_MAPS_BROWSER_KEY` | for map tool | Maps JavaScript API + Places API (New). Sent to the browser at runtime |
| `GOOGLE_MAPS_MAP_ID` | no | Optional cloud-styled map ID |
| `GOOGLE_MAPS_SERVER_KEY` | recommended | Geocoding API, Routes API (driving distance for travel fee), Solar API (roof estimate) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | recommended | Transactional email (confirmations, status changes, password reset) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | no | SMS updates for users who opt in |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | no | Booking deposits via Stripe Checkout |

### Google Cloud setup

1. Create a project at https://console.cloud.google.com and enable billing.
2. Enable: **Maps JavaScript API**, **Places API (New)**, **Geocoding API**, **Routes API**, and optionally **Solar API**.
3. Create two API keys:
   - **Browser key** → *Application restriction: Websites* (`https://your-domain/*`, `http://localhost:5173/*`); *API restriction:* Maps JavaScript API, Places API (New).
   - **Server key** → *API restriction:* Geocoding, Routes, Solar.

### Stripe deposits

1. Set `STRIPE_SECRET_KEY` and turn on **Admin → Settings → Require a deposit**.
2. In the Stripe dashboard add a webhook endpoint `https://your-domain/api/stripe/webhook` for the `checkout.session.completed` event and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. When paid, the booking's deposit is marked paid and a *Requested* booking moves to *Confirmed* automatically.

---

## Deploying to Render

1. Push this folder to a GitHub repository.
2. In Render choose **New → Blueprint**, select the repo. Render reads [render.yaml](render.yaml) and creates:
   - a **PostgreSQL** database (`washpro-db`), and
   - a **Node web service** (`washpro`) with `DATABASE_URL` wired in and a generated `JWT_SECRET`.
3. Fill in the prompted values (`APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, Google/SMTP/Twilio/Stripe keys – leave optional ones blank).
4. Deploy. The service runs:
   - **Build:** `npm run build` → installs both apps, builds the PWA, generates the Prisma client.
   - **Start:** `npm start` → `prisma migrate deploy`, idempotent seed, then the server (which also serves the built PWA).
5. Once live, set `APP_URL` to the real URL (or your custom domain), add that domain to the Google browser-key referrers, and sign in as the admin.

*Manual setup instead of the Blueprint:* create a Render Postgres database, then a Web Service with runtime Node, build command `npm run build`, start command `npm start`, health check `/api/health`, and the environment variables above (use the database's *Internal Database URL* for `DATABASE_URL`).

---

## How it works

### Measurement tool
- Address search uses Google's **PlaceAutocompleteElement** (Places API New), falling back to the legacy widget, then to server-side geocoding.
- The property loads on a satellite map. Customers pick a surface (driveway, patio, roof, siding, deck, fence, gutters) and tap corners on the map. Polygons measure **area** and polylines measure **length** using the Geometry library (`computeArea`, `computeLength`).
- Google deprecated the Maps *Drawing Library*, so drawing is built on map clicks + editable `Polygon`/`Polyline` overlays: select a shape to drag its corners, right-click a corner to delete it.
- Siding = house-outline perimeter × wall height (stories × 10 ft). Roof = footprint × pitch factor, or **Auto-measure roof** using the Solar API's whole-roof area.
- Every measurement can be adjusted by hand, and areas can be added without the map.

### Pricing
Per line: `max(quantity × rate × material multiplier, minimum charge) + add-ons`, where add-ons are flat or per sq ft / linear ft. Then a travel fee (`(miles − free radius) × per-mile`, capped) from the business address using Routes API driving distance (straight-line × 1.25 without a server key), plus tax and optional deposit. Job duration = setup minutes + quantity ÷ speed, rounded up to the slot size. The server always recalculates prices from the database.

### Booking & double-booking protection
Slots come from business hours, blocked days, minimum notice and booking horizon. A slot is open while fewer than **crews** active jobs overlap it. Booking runs in a transaction holding a PostgreSQL advisory lock and re-checks capacity, so two customers clicking the same slot at once can't both get it. Technicians can't be assigned to overlapping jobs.

### Tracking
Status flow: **Requested → Confirmed → Scheduled → On the way → In progress → Completed** (or Cancelled). Each change writes a timeline event and notifies the customer by in-app notification, email, and SMS (if they opted in). Customer pages poll for live updates. Customers can reschedule/cancel until the cutoff set in Settings.

### Security
bcrypt password hashing (cost 12) · JWT in an httpOnly, SameSite=Lax, Secure (in production) cookie · role-based route guards on both API and UI · zod validation on every input · rate limits on auth and API · Helmet security headers with a CSP · photos served only to the booking's customer, assigned pro, or admins · password-reset tokens stored hashed and expire after 1 hour.

### PWA
Installable (manifest + icons), works offline for the app shell, auto-updates the service worker. API responses are never cached so job status is always live.

---

## Useful commands

```bash
npm --prefix server run migrate:dev -- --name my_change   # create a new migration after editing schema.prisma
npm --prefix server run seed                              # re-run the idempotent seed
npm --prefix client run icons                             # regenerate PWA icons
npm test                                                  # unit tests
```
