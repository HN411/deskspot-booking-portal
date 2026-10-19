# DeskSpot --- Desk & Meeting Room Booking Portal

**Live application:**
https://deskspot-booking-portal-production.up.railway.app\
**Assignment:** Joiner Web Dev Assignment --- DeskSpot

DeskSpot is a web application for employees to find and book office
desks or meeting rooms. Office administrators manage offices and spaces
and oversee bookings.

## 1. Main Features

-   Register and log in.
-   Browse offices, desks, and meeting rooms.
-   Search availability by office, date, time, and space type.
-   Create bookings and view personal bookings.
-   Cancel eligible future bookings.
-   Admin tools for managing offices and spaces.
-   Validate booking time slots, office hours, availability, and room
    capacity.
-   Responsive interface for desktop and mobile screens.

> Verify each feature in the live application before the review and
> update this list if anything is not implemented.

## 2. Technology

-   **Backend:** Node.js and Express
-   **Frontend:** HTML, CSS, and JavaScript
-   **Database:** SQLite (`better-sqlite3`)
-   **Authentication:** Token-based authentication
-   **Deployment:** Railway
-   **Container support:** Docker and Docker Compose

## 3.Demo accounts
These accounts are for local evaluation only.

Role	Email	Password
Admin	admin@deskspot.local	Admin123!
Employee	employee@deskspot.local	Employee123!

## 4. Live Application

Open: **https://deskspot-booking-portal-production.up.railway.app**

The hosting service may take a short time to wake after inactivity. If
the application does not open, check the Railway deployment status and
logs.

## 5. Run Locally

### Requirements

-   Node.js and npm
-   Git (optional, for cloning the repository)

### Setup

1.  Clone the repository and open its folder:

    ``` bash
    git clone <YOUR_GITHUB_REPOSITORY_URL>
    cd <PROJECT_FOLDER>
    ```

2.  Install dependencies:

    ``` bash
    npm install
    ```

3.  Create a local `.env` file if the application requires environment
    variables. Do not commit this file.

    Example values (use the names expected by the application):

    ``` env
    NODE_ENV=development
    PORT=3000
    JWT_SECRET=replace-with-a-long-random-secret
    DB_PATH=./data/deskspot.sqlite
    ```

4.  Start the application:

    ``` bash
    npm start
    ```

5.  Open the local address printed in the terminal. It is commonly
    `http://localhost:3000`.

If the project uses different scripts or environment-variable names,
check `package.json` and the server configuration.

## 6. Run with Docker

If Docker Desktop is installed and running, and the repository contains
`docker-compose.yml`, run:

``` bash
docker compose up --build
```

Open the local address configured by the project. Press `Ctrl+C` to stop
the running process; use `docker compose down` to stop and remove the
containers.

For SQLite, keep the database in a persistent mounted directory. In
Railway, the database path and storage configuration must match the
deployed application. A container's temporary filesystem should not be
treated as permanent database storage.

## 7. Tests and Code Checks

Run the scripts defined in `package.json`. If these scripts are
available, use:

``` bash
npm run lint
npm test
```

Resolve failures before submitting. Do not report tests as passing
unless they have been run successfully.

## 8. Main Booking Rules

The application is designed around the assignment's core rules:

-   A space must not have overlapping active bookings.
-   Bookings use 30-minute slots.
-   Bookings must fall within office local working hours, 08:00--20:00.
-   Employees can book no more than 14 days ahead.
-   Employees may hold at most two active desk bookings per day.
-   Room bookings must not exceed room capacity.
-   Employees can cancel their own eligible future bookings.
-   Administrators can manage office spaces and bookings according to
    their permissions.
-   Each office has its own time zone; times should display in that
    office's local time.

These rules should be enforced on the server, not only by frontend
validation.

## 9. Environment Variables

Set variables in your local `.env` file or in Railway's environment
settings.

  Variable       Purpose
  -------------- -----------------------------------------------------
  `NODE_ENV`     Runtime mode, such as `development` or `production`
  `PORT`         Port used by the web server, if configurable
  `JWT_SECRET`   Secret used to sign authentication tokens
  `DB_PATH`      Location of the SQLite database file

The names and defaults must match the code. Keep secrets out of Git and
never use the example secret in production.

## 10. API Overview

The assignment's expected API includes routes similar to these:

  ---------------------------------------------------------------------------
  Method                  Endpoint                    Purpose
  ----------------------- --------------------------- -----------------------
  `POST`                  `/api/auth/register`        Register an account

  `POST`                  `/api/auth/login`           Log in

  `GET`                   `/api/offices`              List offices

  `GET`                   `/api/offices/:id/spaces`   List spaces in an
                                                      office

  `GET`                   `/api/availability`         Search available spaces

  `POST`                  `/api/bookings`             Create a booking

  `GET`                   `/api/bookings/me`          List the signed-in
                                                      user's bookings

  `DELETE`                `/api/bookings/:id`         Cancel a booking when
                                                      authorized

  `GET`                   `/api/admin/occupancy`      View office occupancy,
                                                      if implemented
  ---------------------------------------------------------------------------

Confirm the actual routes in the source code before using them. This
table reflects the assignment's expected API shape; not every route is
guaranteed to exist in the deployed version.

## 11. Security

-   Store passwords as secure hashes, never as plain text.
-   Check authentication and role permissions on the server for
    protected routes.
-   Prevent users from viewing or cancelling another employee's bookings
    by changing an ID.
-   Validate input on the server and use parameterized database queries.
-   Store production secrets in Railway environment settings, not in
    source control.
-   Do not publish real user passwords or private production credentials
    in this README.

## 12. Assumptions and Trade-offs

-   The application is intended as a small internal booking portal and
    assignment submission.
-   Office hours are interpreted in each office's local time zone.
-   Bookings that meet exactly at an end/start boundary do not overlap.
-   SQLite keeps local setup simple. For a multi-instance production
    system, a managed database such as PostgreSQL would be a better
    choice.
-   Free hosting can sleep after inactivity. SQLite data may not persist
    unless hosting provides persistent storage and the database is
    configured to use it.
-   Use test accounts and seed data for demonstrations, not real
    employee data.

## 13. Architecture Decision Records

The assignment asks for at least two short Architecture Decision Records
(ADRs). If these files exist in the repository, see
[`docs/adr/`](docs/adr/).

Suggested decisions to document: 1. **Application stack:** why
Node.js/Express, a simple frontend, and SQLite were selected. 2.
**Booking conflicts and time handling:** how overlapping bookings are
checked and how office-local time is represented.

Only document decisions that match the actual code.

## 14. What I Would Do Next

-   Use a managed PostgreSQL database for reliable production
    persistence.
-   Add or expand integration tests for successful bookings, conflicts,
    and forbidden access.
-   Add an end-to-end test for the main booking journey.
-   Add an OpenAPI/Swagger API description if it is not already
    available.
-   Add occupancy reporting and notifications where they are not yet
    implemented.
-   Configure CI to run lint and tests on every push and pull request.
-   Record a short demo showing employee booking and administrator
    workflows.
-   Maintain a work board and small pull requests to show the
    development process.

## 15. Final Submission Checklist

-   [ ] The live URL opens.
-   [ ] The Git repository is accessible to the reviewer.
-   [ ] Local setup works using these instructions.
-   [ ] Lint and tests have been run and their results are known.
-   [ ] Admin and employee demo accounts are available and shared
    securely.
-   [ ] At least two ADRs are present under `docs/adr`.
-   [ ] CI has a successful run on the submitted commit.
-   [ ] The demo video or live-demo plan is ready.

------------------------------------------------------------------------

**Live URL:** https://deskspot-booking-portal-production.up.railway.app

*Keep this README aligned with the actual code and deployment. Update
any route, feature, test, or setup detail that differs from the current
project.*
