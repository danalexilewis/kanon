---
schema: eddy-kb/document/v1
doc:
  id: 8a2c4e16-5b70-4d91-9f3a-1c6e8d0b2a47
  title: Sensitivity rubric
  kind: derivative
  status: draft
---

# Sensitivity rubric

Draft for the operator to edit. Levels are 0–3. A higher level means a
smaller circle. This page is guidance for humans and for the optional
model proposer. Placement still follows the four tests in
[ADR 0008](../decisions/0008-circles-of-trust.md).

## 0 — team

Routine work. Status, planning, delivery decisions, and retros without
personal criticism.

## 1 — leadership

Commercially sensitive, not about named people. Finances, pricing,
contracts, fundraising, unannounced strategy, and things clients told us
in confidence.

## 2 — founders

About named people or risk to the company. Performance, the pay or equity
of a named person, conflict, restructuring, legal exposure, and candid
views of colleagues, clients or investors.

## 3 — me

Things said to the operator in confidence. Health or family matters,
details of discipline or exits, and grievances.

## How a level is chosen

A human final level wins. Otherwise take the higher of local signals and
the model proposal. Signals and the model only raise. Only a human
lowers.

Local signals (deterministic; evidence is terms and counts, never
excerpts):

- exactly one reader besides the operator → at least 2
- an external reader → at least 1
- word-list categories in title or body: money 1, legal 2, people 2,
  health 3. A body category needs at least two hits.

## Open questions

Ceilings default to team 0, leadership 1, founders 2, me 3. Confirm or
change them before rollout. Edit this rubric when the wording is wrong.
