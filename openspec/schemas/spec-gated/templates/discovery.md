> Change class: **S** one-line skip · **M/L** full storm for event-driven changes.
> Event storming is discovery, not design: capture what happens before deciding how.
> S changes, or changes with no async flows, replace everything below with one line:
> `No new async behavior in this change.`

## Scope question

<!-- The single business question this storm answers. S: omit. -->

## Actors

<!-- People and systems that issue commands: visitor, organizer, exhibitor, ops,
     scheduler/timer, external provider. -->

- `<actor>`: <what they trigger>

## Commands

<!-- Imperative actions actors take. One per line with key payload. -->

- `<command>` (<payload>): issued by <actor>

## Domain events

<!-- Past-tense facts the system publishes. Name + payload + producer.
     These become AsyncAPI messages in contracts/asyncapi.yaml. -->

- `<event>` <payload> — produced by <producer>

## Policies

<!-- Automatic reactions: WHEN <event> THEN <command/reaction>, including
     timers and expiry (e.g., hold expiry, telemetry flush, presence timeout). -->

- WHEN <event> THEN <reaction>

## Read models

<!-- Projections listeners build: snapshots, signage feeds, analytics counters,
     public views. Note staleness tolerance per model. -->

- `<read model>`: built from <events>, stale-tolerant up to <duration>

## Hotspots and risks

<!-- Contested meanings, ordering/duplication hazards, identity questions
     (what is the stable ID across renames and republishes?). -->

- <hotspot>: <why it matters>

## Channel map

<!-- Event → AsyncAPI channel/operation. Fill after contracts/asyncapi.yaml exists. -->

- `<event>` → `<channel>` (`<operation>`)
