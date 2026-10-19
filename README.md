# DeskSpot — Desk & Meeting Room Booking Portal

DeskSpot is a small full-stack workspace booking application for hybrid teams. Employees can find and reserve desks or meeting rooms, while administrators manage offices, spaces, and daily occupancy.

> **Assignment status:** The local application, source code, tests, Docker configuration, CI workflow, and documentation are included. The live URL, hosted environment, final CI run, work-board link, pull-request history, and demo recording must be completed by the person submitting the assignment. Do not claim these are complete until you have verified them.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Demo accounts](#demo-accounts)
- [Run with Docker Compose](#run-with-docker-compose)
- [Tests and code checks](#tests-and-code-checks)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Deploy to Railway](#deploy-to-railway)
- [Security notes](#security-notes)
- [Assumptions and trade-offs](#assumptions-and-trade-offs)
- [Architecture](#architecture)
- [Architecture decision records](#architecture-decision-records)
- [Assignment delivery checklist](#assignment-delivery-checklist)
- [What I would improve next](#what-i-would-improve-next)

## Features

### Authentication and roles

- Employee registration and login.
- Password hashing with bcrypt.
- JWT authentication with an eight-hour expiry.
- Generic invalid-login responses and rate limiting on login.
- Authorization checks on protected server routes. Public registration creates an employee account; users cannot choose their own admin role.

### Offices, spaces, and booking

- Admin-only create, update, and deactivate operations for offices and spaces.
- Office fields include name, city, and IANA time zone.
- Space fields include name, type (desk or room), capacity, and active status.
- Availability search by office, date, time range, and space type.
- Server-side validation for booking rules:
  - Bookings align to 30-minute slots.
  - Office-local booking times must fall within 08:00–20:00.
  - Bookings can be made no more than 14 days ahead.
  - An employee may have at most two active desk bookings per local day.
  - Room attendee count cannot exceed room capacity.
  - An active space cannot have overlapping bookings.
- Times are stored as UTC timestamps and displayed using the office's local time zone.
- Employees can view their bookings and cancel their own future bookings.
- Admins can view daily office occupancy and cancel any booking with a required reason. The cancellation reason is visible in the booking history.
- A lightweight seven-day usage indicator is included.

### Interface and delivery

- Responsive interface with a left-side navigation area and mobile navigation.
- Labeled forms, validation feedback, loading/empty states, and status messages.
- Health-check endpoint, Dockerfile, Docker Compose configuration, GitHub Actions CI workflow, seed data, unit tests, and API integration tests.
- OpenAPI JSON document at `/api/openapi.json`.

## Technology stack

- **Frontend:** HTML, CSS, and browser JavaScript.
- **Backend:** Node.js 20+ and Express.
- **Database:** SQLite using `better-sqlite3`.
- **Authentication:** bcryptjs and JSON Web Tokens.
- **Security and quality:** Helmet, login rate limiting, Node.js test runner, and Supertest.
- **Deployment packaging:** Docker and Docker Compose.
- **CI:** GitHub Actions.

This stack is intentionally small so a junior developer can explain the request flow, validation rules, database access, and authorization without needing a large framework.

## Requirements

- Node.js 20 or newer and npm for local development.
- Git for source control.
- Optional: Docker Desktop or Docker Engine for container-based development.
- A GitHub account and a hosting account for cloud deployment.

## Run locally

1. Clone the repository or extract the project ZIP.
2. Open a terminal in the directory containing `package.json`.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and set a unique `JWT_SECRET`. For local development, `DB_PATH=./data/deskspot.sqlite` is suitable.
5. Start the server:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000).

The application creates its SQLite database and inserts seed data when the database has not yet been initialized. The default database file is `data/deskspot.sqlite`.

For development with automatic restart, use:

```bash
npm run dev
```

To reset local demo data, stop the server and delete `data/deskspot.sqlite`. The application will initialize the database and seed data again on its next start. **Only do this when you are happy to delete local bookings and other changes.**

## Demo accounts

These accounts are for local evaluation only.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@deskspot.local` | `Admin123!` |
| Employee | `employee@deskspot.local` | `Employee123!` |
| Employee | `sam@deskspot.local` | `Employee123!` |

Change or disable demo accounts before exposing the application publicly. Do not use these passwords for real users. The live environment should use a strong, unique secret and appropriate production credentials.

## Run with Docker Compose

Docker Desktop or Docker Engine must be running first.

1. Create a `.env` file from `.env.example` and replace the example secret.
2. In the project root, run:

   ```bash
   docker compose up --build
   ```

3. Open [http://localhost:3000](http://localhost:3000).
4. Stop the app with `Ctrl+C`, or run `docker compose down` in another terminal.

Compose stores the database in the named `deskspot-data` volume. To remove that volume and its data, run `docker compose down -v` only when you intentionally want to reset the database.

If Docker Desktop cannot start, run DeskSpot locally with Node.js using the previous section; Docker commands will not work until the Docker engine is running.

## Tests and code checks

Run the linter/syntax checks and automated tests before pushing changes:

```bash
npm run lint
npm test
```

To run only the booking-rule unit tests:

```bash
npm run test:rules
```

The included tests cover core booking rules and API scenarios, including authentication/authorization, booking conflicts, ownership, and admin cancellation with a saved reason. The GitHub Actions workflow runs installation, checks, tests, and a Docker build on pushes and pull requests to `main`.

A successful local test run does not replace checking the Actions result in GitHub. Open the repository's **Actions** tab and confirm that the workflow for the final commit passes.

## Environment variables

| Variable | Purpose | Example / default |
|---|---|---|
| `PORT` | HTTP port supplied by the local environment or hosting platform | `3000` locally |
| `JWT_SECRET` | Secret used to sign authentication tokens | Set a unique random value; never commit it |
| `DB_PATH` | SQLite database file path | `./data/deskspot.sqlite` locally; `/app/data/deskspot.sqlite` in the provided container setup |
| `NODE_ENV` | Runtime environment | `development` locally, `production` when hosted |
| `APP_ORIGIN` | Optional CORS allowlist for API clients | `http://localhost:3000` locally; configure for your actual deployed origin if needed |

The hosting platform's injected `PORT` should be respected. The SQLite database path must point to persistent storage in a hosted environment if data needs to survive restarts and redeployments.

## API overview

Protected routes use the header `Authorization: Bearer <token>`. Error responses use a consistent JSON shape such as `{ "error": "...", "details": [] }` where applicable.

| Method | Endpoint | Access |
|---|---|---|
| `POST` | `/api/auth/register` | Public; creates an employee account |
| `POST` | `/api/auth/login` | Public; rate limited |
| `GET` | `/api/auth/me` | Authenticated |
| `GET` | `/api/offices` | Authenticated |
| `POST`, `PUT`, `DELETE` | `/api/offices` and `/api/offices/:id` | Admin |
| `GET` | `/api/offices/:id/spaces` | Authenticated |
| `GET` | `/api/spaces` | Authenticated |
| `POST`, `PUT`, `DELETE` | `/api/spaces` and `/api/spaces/:id` | Admin |
| `GET` | `/api/availability?officeId=&date=&from=&to=&type=` | Authenticated |
| `POST` | `/api/bookings` | Authenticated employee |
| `GET` | `/api/bookings/me` | Authenticated |
| `DELETE` | `/api/bookings/:id` | Booking owner or admin; admin cancellation requires a reason |
| `GET` | `/api/admin/occupancy?officeId=&date=` | Admin |
| `GET` | `/api/admin/stats` | Admin |
| `GET` | `/api/health` | Public health check |
| `GET` | `/api/openapi.json` | Public OpenAPI document |

Expected HTTP status codes include `400` for invalid input, `401` for unauthenticated requests, `403` for forbidden actions, `404` for missing resources, and `409` for booking conflicts.

## Deploy to Railway

This section is a deployment guide; a public URL is **not** created by this README. Complete the steps in your own hosting account and then add the actual URL below.

1. Push the project to a GitHub repository. Make sure `.env` and local database files are not committed.
2. Sign in at [Railway](https://railway.com/) and create a project from your GitHub repository.
3. Select the repository and deploy the service using the included `Dockerfile` at the repository root.
4. Add a persistent volume to the service mounted at `/app/data`.
5. Configure the service variables:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | A new, long, random secret generated for production |
   | `DB_PATH` | `/app/data/deskspot.sqlite` |

6. Allow the platform to provide its `PORT` value. Do not hard-code a conflicting port in the hosting dashboard.
7. Deploy/redeploy the service and inspect the build and runtime logs.
8. Generate a public domain in the service's networking settings.
9. Open the public domain and test login, availability search, booking, overlapping-booking rejection, admin cancellation, and the `/api/health` endpoint.
10. Restart or redeploy the service and confirm that existing data remains available.

**SQLite deployment note:** the database must be written inside the mounted persistent volume. Confirm that `DB_PATH` is honored by the running application and that the directory is writable by the container user. Do not use an ephemeral container filesystem for the production database. SQLite is appropriate for this small single-instance assignment; for multi-instance production deployment, migrate to PostgreSQL and add a database-level concurrency guard for overlapping bookings.

### Deployment details to fill in before submission

- **Live application URL:** `ADD_YOUR_REAL_DEPLOYED_URL_HERE`
- **Health check URL:** `ADD_YOUR_REAL_URL_HERE/api/health`
- **GitHub repository:** `ADD_YOUR_REPOSITORY_URL_HERE`
- **CI run:** `ADD_THE_FINAL_GREEN_ACTIONS_RUN_URL_HERE`
- **Work board:** `ADD_YOUR_BOARD_URL_HERE`
- **Demo recording:** `ADD_YOUR_DEMO_LINK_HERE`

Replace each placeholder with a real, working link before submitting. If an item is not complete, state that honestly rather than inventing a URL.

## Security notes

- Never commit `.env`, production secrets, real user credentials, or the SQLite database.
- Use a unique production `JWT_SECRET`; changing it invalidates existing tokens.
- Replace or disable demo accounts before public use.
- Keep dependencies updated and review GitHub security alerts.
- Configure CORS only for the intended frontend origin if a separate frontend origin is used.
- Use HTTPS for public deployments.
- Back up persistent database data before upgrades or resets.
- This is an assignment-sized application, not a security-reviewed production system.

## Assumptions and trade-offs

- A booking is one continuous interval on one local calendar date. Overnight bookings are not supported because the office closes at 20:00.
- A desk is for one person. Rooms accept attendee counts from one through the configured capacity.
- Public registration always creates an employee account. Admin access is not self-assigned during registration.
- The application stores UTC timestamps and also retains office-local date/time values for local display and day-based rules.
- Booking writes use a synchronous SQLite transaction so requests handled by a single application process serialize the overlap check and insert. This is not a multi-instance database-level guarantee.
- The seven-day usage indicator is a lightweight booking-count estimate, not a true seat-hour occupancy percentage.
- Email notifications, recurring bookings, live availability updates, and end-to-end browser tests are not implemented in this version. Treat them as future work, not completed functionality.

## Architecture

```text
Browser (HTML / CSS / JavaScript)
              |
              | same-origin HTTP / JSON
              v
        Express REST API
        |       |       |
        |       |       +-- Authentication and role checks
        |       +---------- Booking rules and time-zone handling
        +------------------ SQLite data access
                              |
                              v
                      data/deskspot.sqlite
```

Key files:

- `server.js` — Express application, REST endpoints, authentication/authorization, database setup, seed data, and error handling.
- `booking-rules.js` — isolated booking validation and time-zone utilities.
- `public/index.html` — frontend page structure.
- `public/styles.css` — responsive styling and navigation layout.
- `public/app.js` — browser-side state and API interactions.
- `tests/rules.test.js` — booking-rule unit tests.
- `tests/api.test.js` — API integration tests.
- `Dockerfile` and `docker-compose.yml` — container build and local orchestration.
- `.github/workflows/ci.yml` — automated checks on GitHub.
- `docs/adr/` — architecture decision records.
- `docs/WORK_BOARD.md` — starter checklist for tracking assignment tasks.

## Architecture decision records

- [ADR 0001 — Stack selection](docs/adr/0001-stack.md)
- [ADR 0002 — Booking conflict prevention](docs/adr/0002-booking-conflicts.md)

## Assignment delivery checklist

- [x] Responsive frontend with left navigation, labeled forms, and feedback states.
- [x] Registration, login, hashed passwords, expiring tokens, and server-side role checks.
- [x] Office and space management for admins.
- [x] Availability search and server-side booking validation.
- [x] Employee booking history and future-booking cancellation.
- [x] Admin daily occupancy and cancellation with a reason.
- [x] Relational SQLite data model, indexes, and seed data.
- [x] Booking-rule unit tests and API integration test suite included.
- [x] Dockerfile, Docker Compose, and GitHub Actions workflow included.
- [x] README and two architecture decision records included.
- [ ] Run the final CI pipeline and confirm it passes.
- [ ] Deploy and verify a public live URL.
- [ ] Add real repository, board, CI, and demo links above.
- [ ] Record a 3–5 minute demo or arrange a live review.

## What I would improve next

1. Move to PostgreSQL and enforce non-overlapping bookings at database level for safe multi-instance operation.
2. Add request/response schema validation and a browsable Swagger UI for the OpenAPI document.
3. Add Playwright end-to-end tests for employee booking and admin cancellation.
4. Add real email delivery or a notification outbox, audit logging, and token revocation.
5. Calculate occupancy from available and occupied 30-minute intervals and paginate larger admin lists.
6. Add recurring bookings and real-time availability only after the core booking flow is stable.

## License

No license has been specified. Add a license file if you intend to publish or redistribute this project under explicit terms.
