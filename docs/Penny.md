---
title: Penny
type: agent-spec
system: MetroPrints
status: active
owner: Shah Saint-Cyr
tags: [hermes, metroprints, agent, penny, finance, transaction-control]
cadence: "Weekly finance QA; Saturday revenue/anomaly pass coordinated with Metro"
consolidates:
  - Hermes Finance and Transaction Control Agent (FBI Fee Logger oversight, Fuel Tracker oversight, USPS Logger oversight, Square/Stripe finance checks, finance anomaly monitoring, dedup registry review, expense classification QA)
related:
  - "[[Hermes Agent Architecture]]"
  - "[[Metro]]"
  - "[[Casey]]"
created: 2026-06-28
---

# Penny

## Role

Penny is MetroPrints' finance oversight agent — explicitly not raw transaction logging. Penny governs and audits the finance data Make automations produce; she does not replace those automations. This is a direct rename of the former **Hermes Finance and Transaction Control Agent**, with no change in scope.

## Consolidates (full lineage)

- **Hermes Finance and Transaction Control Agent** — renamed in whole, no scope change
  - FBI Fee Logger (oversight only — logging moved to Make)
  - Fuel Tracker (oversight only — logging moved to Make/Shortcuts)
  - USPS Logger (oversight only — logging moved to Make)
  - Square / Stripe finance checks
  - Finance anomaly monitoring
  - Dedup registry review
  - Expense classification QA

## Important: what did NOT come back as an agent

The old raw-logging agents are retired and stay retired. They are deterministic work and belong in Make/Shortcuts, not in an agent:

| Old Logger | Replacement |
|---|---|
| FBI Fee Logger | Make route |
| Fuel Tracker | Make / Apple Shortcut receipt capture |
| USPS Logger | Make route |
| Square / Stripe Logger | Make route |

All three of the original loggers were also noted as superseded by a single **Unified Expense Email Logger** Make scenario.

## What it does instead

- Audits Make-created finance entries
- Flags missing categories
- Flags duplicate-looking transactions
- Checks whether the Finance Tracker hasn't updated in 7+ days
- Summarizes revenue / expense health
- Flags unusual expenses or revenue drops
- Reviews dedup registry failures

## Cadence & triggers

- Weekly finance QA pass
- Saturday revenue/anomaly pass — coordinated with [[Metro]]'s Saturday revenue check

## Data sources / integrations

- **Reads:** Finance Tracker / transaction databases populated by Make (Square, Stripe, USPS, fuel, FBI fee entries)
- **Reads:** Dedup registry
- **Posts to:** Slack (finance QA summary)

## Coordination with other agents

- **[[Metro]]**: Saturday runs are coordinated — Metro flags revenue anomalies at the operational/pipeline level, Penny audits the underlying transaction data for the same period.
- **[[Casey]]**: a case reaching a billable state (e.g., completed Live Scan) is a signal Penny watches for on the finance side, though the transaction itself is logged by Make, not by Casey or Penny.

## Why this is an agent (not Make)

Penny's job is oversight, anomaly detection, and exception review — judgment calls about what looks wrong or missing — not deterministic receipt parsing or fixed-rule logging. That distinction is also why the three old loggers were not reactivated as agents: "if Pay.gov receipt then log amount" requires no reasoning, so it stays in Make.

## Standing recommendation

Do not reactivate FBI Fee Logger, Fuel Tracker, or USPS Logger as agents. The only acceptable exception is a **temporary** stopgap: if the Unified Expense Email Logger Make scenario isn't fully live yet and logging needs to happen right now, the old loggers can be temporarily re-enabled until that scenario is running end-to-end — but that's a stopgap, not the target state.

## Naming history

Formerly *Hermes Finance and Transaction Control Agent*. Retired as a standalone note; Penny is its direct renamed successor (no scope change).
