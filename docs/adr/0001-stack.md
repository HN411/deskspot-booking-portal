# ADR 0001: Use Node.js, Express, SQLite and a plain JavaScript frontend

- **Status:** Accepted
- **Context:** DeskSpot is a small internal booking pilot with a 3–5 day timebox. The project should be straightforward for a junior developer to run, explain and modify.
- **Decision:** Use Express for the REST API, SQLite for relational persistence, bcrypt for password hashing, JWT for expiring bearer tokens, and a small HTML/CSS/JavaScript single-page frontend. Docker Compose and GitHub Actions provide repeatable local startup and CI.
- **Consequences:** The stack has few moving parts and can run on a laptop without a separate database service. SQLite is appropriate for a single-instance pilot, but multi-instance deployments should move to PostgreSQL and use a database-level conflict constraint. A plain frontend avoids a separate build pipeline, at the cost of less component-level structure than React/Vue.
