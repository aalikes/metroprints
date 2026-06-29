---
title: Hermes Agent Architecture
type: agent-architecture
system: MetroPrints
status: active
owner: Shah Saint-Cyr
tags: [hermes, metroprints, agent-architecture, automation]
created: 2026-06-28
related:
  - "[[Metro]]"
  - "[[Casey]]"
  - "[[Penny]]"
  - "[[Cal]]"
---

# Hermes Agent Architecture

Target state for MetroPrints automation: **4 named Hermes agents** — Metro, Casey, Penny, Cal — plus Make automations and Notion databases as the source of truth. This note is the hub; each agent has its own page linked below.

## Design principle

Hermes agents are reserved for judgment-heavy work: summarization, anomaly detection, classification, routing, escalation, and synthesis. Deterministic work (raw logging, fixed if/then routing, receipt capture) is pushed to Make, cron, Apple Shortcuts, or native Notion automations instead of living inside an agent. Re-litigating this line is the most common way agent sprawl creeps back in — if a "new" agent idea is really an if/then rule, it belongs in Make, not in Hermes.

## From 5 roles to 4 named agents

The original Hermes model defined 5 functional roles, each its own agent. That model has been restructured into 4 persona-named agents: two roles merged into single owners, one role carried over with a new name and unchanged scope, and one entirely new role was added for scheduling.

| Original role | New owner |
|---|---|
| Ops Intelligence | [[Metro]] |
| Knowledge, Content & Sync | [[Metro]] (merged in) |
| Intake & Case Router | [[Casey]] |
| Task Triage & Escalation | [[Casey]] (merged in) |
| Finance & Transaction Control | [[Penny]] (renamed, scope unchanged) |
| *(new)* Scheduling | [[Cal]] (net-new agent, no predecessor) |

## The 4 agents

| # | Agent | Primary Job | Cadence |
|---|-------|-------------|---------|
| 1 | [[Metro]] | Ops snapshots, anomalies, revenue alerts, strategic briefings, SOPs/knowledge, content drafting | Mon/Wed/Fri/Sat 06:00 ET; Saturday revenue check; bi-weekly Monday briefing; weekly knowledge/content review |
| 2 | [[Casey]] | New cases, client intake, FBI/Live Scan routing, dedupe, daily queue triage, overdue escalation | Event-driven (email, calendar, form, @mention) + manual; daily 07:00 ET sweep |
| 3 | [[Penny]] | Finance QA, anomaly review, dedupe checks, Make oversight | Weekly QA; Saturday revenue/anomaly pass (coordinated with Metro) |
| 4 | [[Cal]] | Mobile Live Scan appointment scheduling, technician routing, reminders | Event-driven (new request from Casey) + daily AM schedule review + reminder sends |

## Interns

MetroPrints uses interns for hands-on, supervised support across all 4 agent domains. Interns are the human execution layer; agents retain the judgment calls (routing, escalation tier, anomaly flags, categorization) and final review stays with Shah.

| Agent domain | Intern responsibilities |
|---|---|
| [[Metro]] | Drafting blog/FAQ content from Metro's approved talking points; basic Notion data hygiene (tagging, formatting) under existing SOPs; assisting with knowledge-base updates |
| [[Casey]] | Data entry support for new client/case records; routine client follow-up communications; document collection — non-judgment intake tasks only, not dedupe or routing decisions |
| [[Penny]] | Organizing and labeling receipts/expense documentation before it's logged via Make; flagging anything unclear for Penny's review rather than making the categorization call |
| [[Cal]] | Confirming appointments by phone/text per Cal's schedule; calendar data entry; relaying client reschedule requests for Cal to process |

**Guardrails**

- Interns do not perform the Live Scan/fingerprinting capture itself or any FDLE-regulated compliance step — that stays with authorized staff under MetroPrints' FDLE Live Scan authorization.
- Interns execute tasks an agent has already classified or assigned; they don't make the judgment calls that justify keeping that work in an agent rather than a script.
- Shah reviews intern work product before it's treated as final, the same as any other human-in-the-loop step.

*This breakdown is a first-pass proposal, not a confirmed job description — check it against what interns are actually doing day to day and adjust.*

## Consolidation map (full lineage back to original agents/automations)

| Old / Current Agent or Automation | Final Owner | Keep as Agent? |
|---|---|---|
| MP Intelligence Agent | [[Metro]] | Yes |
| Operations Snapshot Agent | [[Metro]] | No — merged |
| Revenue Alert Agent | [[Metro]] | No — merged |
| Strategic Briefing Agent | [[Metro]] | No — merged |
| MetroPrints Knowledge Sync | [[Metro]] | Yes — merged into Metro |
| Blog / FAQ content agent | [[Metro]] | Yes, as a sub-mode of Metro |
| Notion → Obsidian MP sync governance | [[Metro]] | Yes, for governance; script does raw sync |
| Marco | [[Casey]] | Yes, renamed/consolidated |
| MP Order Email → MP Cases | [[Casey]] + Make | Mostly Make; Casey handles exceptions |
| Task Triage Agent | [[Casey]] | Yes — merged into Casey |
| Overdue Escalation Agent | [[Casey]] | No — merged |
| Human Task Commander | [[Casey]] | No — merged |
| Weekly Execution Dispatcher | [[Casey]] | No — merged |
| Daily FBI Exceptions Sweep | [[Casey]] | No — merged |
| FBI Fee Logger | [[Penny]] | No — Make handles raw logging |
| Fuel Tracker | [[Penny]] | No — Make/Shortcuts |
| USPS Logger | [[Penny]] | No — Make |
| Square / Stripe Logger | [[Penny]] | No — Make |
| *(none — net new)* | [[Cal]] | Yes — new agent, no predecessor |

## Naming history

The original 5-role model used generic names: *Hermes Ops Intelligence Agent*, *Hermes Intake and Case Router*, *Hermes Task Triage and Escalation Agent*, *Hermes Finance and Transaction Control Agent*, *Hermes Knowledge Content and Sync Agent*. All 5 of those notes are retired in favor of the persona-named notes above. "Hermes" remains the name of the overall architecture/framework; Metro, Casey, Penny, and Cal are the named agents operating within it.

## Cross-agent coordination

- **Casey → Cal**: every case that needs a mobile Live Scan appointment gets handed from Casey to Cal for scheduling; Cal reports completed/missed appointments back to Casey for the case record.
- **Metro ↔ Penny**: Saturday runs are coordinated — Metro flags revenue anomalies at the ops level, Penny audits the underlying transaction data for the same period.
- **Casey → Metro**: case volume, intake mix, and stalled-case signals Casey surfaces day-to-day roll up into Metro's higher-altitude, lower-frequency reporting.
- **Cal → Penny**: a completed appointment is one signal that a case has reached a billable state; Penny audits the resulting Make-logged transaction, not the appointment itself.
- **Operations Live State page**: written/updated by Metro, intended as the shared snapshot other agents and reports read from instead of re-querying Notion databases directly.

## Why this restructuring, in one line

The 5-role model already had two pairs of roles that depended on each other's output — ops reporting fed content drafting, and intake fed triage. Merging each pair into a single named owner (Metro, Casey) removes the handoff between two agents working the same data, Penny carries the finance role forward unchanged, and Cal fills a genuine gap — mobile-appointment scheduling — that no prior MetroPrints agent owned.

## Open item

[[Cal]]'s spec is a first-pass definition, not yet confirmed in full detail (calendar system, staff-scheduling scope, reminder channel). See that note's "Open item" section before treating Cal as final.
