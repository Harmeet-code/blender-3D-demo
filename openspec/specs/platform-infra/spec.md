# platform-infra Specification

## Purpose

Containerized local + production infra: Postgres for venue domain data,
Redis for presence/rate-limit state, Docker images for web + server.

## Requirements

### Requirement: Compose-managed dependencies

The system SHALL provide Postgres and Redis via `docker-compose.yml` with
healthchecks, named volumes, and `.env`-driven credentials/ports, started with
`bun run infra:up`.

#### Scenario: Fresh infra boot

- **WHEN** an engineer runs `infra:up` then `db:migrate` + `db:seed`
- **THEN** Postgres holds the `convention-center-01` event with floors, rooms, portals.

### Requirement: Versioned database migrations

The system SHALL track `src/server/db/migrations/*.sql` in `schema_migrations`
and apply each file exactly once via `bun run db:migrate`.

#### Scenario: Re-running migrate is a no-op

- **WHEN** migrate runs twice against the same database
- **THEN** the second run skips every file and changes nothing.

### Requirement: Dependency-aware health endpoint

The system SHALL expose `GET /api/health` returning per-dependency status
(`up` | `down` | `unconfigured`) without throwing when Postgres/Redis are absent.

#### Scenario: Health without infra

- **WHEN** no `DATABASE_URL`/`REDIS_URL` is configured
- **THEN** health returns 200 with both deps `unconfigured`.
