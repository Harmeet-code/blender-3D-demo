> Change class: **S** (short review) · **M** (normal checklist) · **L** (full checklist + verification matrix).
> Role: reviewer, not author. Read proposal.md, specs/, design.md before completing anything.

## Completeness

<!-- - [ ] Each spec requirement has at least one scenario
     - [ ] Edge and error cases are named, not just the happy path
     - [ ] Delta operations (ADDED/MODIFIED/REMOVED/RENAMED) are correct against the current main spec -->

## Correctness

<!-- - [ ] Requirements are observably testable: one SHALL/MUST per statement, no implementation details
     - [ ] Scenarios are concrete (WHEN/THEN), not restatements of the requirement
     - [ ] skip_specs: true used only when behavior genuinely does not change -->

## Standards

<!-- - [ ] Feature-sliced layering holds (imports point inward only; server never imports client widgets)
     - [ ] Contracts are zod schemas in entities/, shared by client and server - no duplicated shapes
     - [ ] Every HTTP boundary has request + response DTOs; services validate responses,
       clients parse responses (no `as T` casts on wire data)
     - [ ] Errors use neverthrow Result with typed codes (server AppError/ErrorCode, client ApiError);
       no throws past service/client boundaries, no string-matched error messages, switches are exhaustive
     - [ ] Secrets only via validated env modules; no secrets in code, logs, or committed files
     - [ ] Server logging through shared getLogger (no console.*); no secrets in log fields
     - [ ] Plan runs the real gates: tsc --noEmit, oxlint, oxfmt --check, bun test (no assumed-green) -->

## Risk

<!-- - [ ] Security, performance, data integrity, breaking/migration concerns surfaced
     - [ ] Durable decisions that belong in adrs.md are flagged -->

## Verdict

**VERDICT:** `APPROVED` | `CHANGES-REQUESTED` | `INFO`

<!-- CHANGES-REQUESTED: numbered list of must-fix items to address before tasks/apply.
     INFO: no blocker, but note the concern. -->
