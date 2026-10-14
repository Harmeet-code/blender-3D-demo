> Change class: **S** (1-3 tasks) · **M** (grouped sections) · **L** (grouped sections, each task verifiable).
> Never start with tasks until review.md has a `VERDICT:` that is not `CHANGES-REQUESTED`.

## 1. <!-- Task Group Name -->

- [ ] 1.1 <!-- Task description - state verification: what command or check proves it's done? -->
- [ ] 1.2 <!-- Task description -->

## 2. <!-- Task Group Name -->

- [ ] 2.1 <!-- Task description -->
- [ ] 2.2 <!-- Task description -->

## Task Dependency Graph

<!-- Replace the waves below with this change's actual task IDs from the list
     above. Rules: tasks in the same wave have no dependencies between each
     other and may run in parallel (e.g. as subagents); waves run strictly in
     order; every task ID above MUST appear in exactly one wave. -->
<!-- Example shape (replace contents, keep structure):

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.1"] }
  ]
}
```
-->

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "5.1"] },
    { "id": 4, "tasks": ["6.1", "6.2", "7.1", "8.1"] },
    { "id": 5, "tasks": ["8.2", "9.1", "10.1", "11.1"] },
    { "id": 6, "tasks": ["11.2", "11.3", "11.4", "11.5"] },
    { "id": 7, "tasks": ["11.6", "11.7", "11.8", "12.1"] },
    { "id": 8, "tasks": ["12.2", "12.3", "12.4", "12.5"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 10, "tasks": ["14"] },
    { "id": 11, "tasks": ["15.1", "7.2"] }
  ]
}
```
