# ADR 0002: Serialize booking writes and check interval overlap

- **Status:** Accepted for single-instance pilot
- **Context:** A space must never have two active bookings whose intervals overlap. Checking only in the browser is unsafe because two users can submit simultaneously.
- **Decision:** Validate requests on the server, begin a synchronous SQLite transaction, query active bookings using `existing.start_utc < requested.end_utc AND existing.end_utc > requested.start_utc`, then insert before the transaction completes. A conflict returns HTTP 409. Touching edges are allowed because the overlap comparison is strict.
- **Consequences:** Requests are serialized within the single Node.js process and SQLite transaction. This is sufficient for the local pilot but is not a complete cross-instance concurrency strategy. Before horizontal scaling, migrate to PostgreSQL and enforce non-overlap at database level (e.g. a range exclusion constraint) or use explicit locking/serializable transactions.
