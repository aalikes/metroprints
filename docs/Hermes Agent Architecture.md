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
---

# Hermes Agent Architecture

Target state for MetroPrints automation: **3 named Hermes agents** — Metro, Casey, Penny — plus Make automations and Notion databases as the source of truth. This note is the hub; each agent has its own page linked below.

## Design principle

Hermes agents are reserved for judgment-heavy work: summarization, anomaly detection, classification, routing, escalation, and synthesis. Deterministic work (raw logging, fixed if/then routing, receipt capture) is pushed to Make, cron, Apple Shortcuts, or native Notion automations instead of living inside an agent. Re-litigating this line is the most common way agent sprawl creeps back in — if a "new" agent idea is really an if/then rule, it belongs in Make, not in Hermes.

## From 6 roles to 3 named agents

The original Hermes model defined 5 functional roles, each its own agent. A 6th role (Scheduling) was added as a separate agent (Cal), then merged back into Casey since scheduling is case-management work. The result is 3 persona-named agents.

| Original role | New owner |
|---|---|
| Ops Intelligence | [[Metro]] |
| Knowledge, Content & Sync | [[Metro]] (merged in) |
| Intake & Case Router | [[Casey]] |
| Task Triage & Escalation | [[Casey]] (merged in) |
| Scheduling | [[Casey]] (merged in — was [[Cal]], now folded back) |
| Finance & Transaction Control | [[Penny]] (renamed, scope unchanged) |

## The 3 agents

| # | Agent | Primary Job | Cadence |
|---|-------|-------------|---------|
| 1 | [[Metro]] | Ops snapshots, anomalies, revenue alerts, strategic briefings, SOPs/knowledge, content drafting | Mon/Wed/Fri/Sat 06:00 ET; Saturday revenue check; bi-weekly Monday briefing; weekly knowledge/content review |
| 2 | [[Casey]] | New cases, client intake, FBI/Live Scan routing, dedupe, daily queue triage, overdue escalation, mobile appointment scheduling, technician routing, reminders | Event-driven (email, calendar, form, @mention) + manual; daily 07:00 ET sweep; daily AM schedule review + reminder sends |
| 3 | [[Penny]] | Finance QA, anomaly review, dedupe checks, Make oversight | Weekly QA; Saturday revenue/anomaly pass (coordinated with Metro) |

## Sub-Agent & Swarm Capabilities

Every Hermes agent can spawn ephemeral, task-scoped sub-agents through the OpenCode sub-agent interface. Swarm orchestration and capability propagation are shared across all 3 agents — no single agent holds exclusive authority.

### How it works

- **Spawning**: each agent spins up a sub-agent (via `mode: subagent`) to handle complex, parallelizable tasks without blocking its own event loop. Sub-agents are short-lived, single-task workers that report results back to their spawning agent.
- **Swarm orchestration (all agents)**: when a task benefits from parallel decomposition, any agent can spawn multiple sub-agents concurrently, monitor all of them, and aggregate results into a unified output. An ops snapshot, a multi-case compliance sweep, a finance audit — whatever the task, the owning agent orchestrates its own swarm.
- **Domain isolation**: sub-agents stay within their spawning agent's domain. Casey's sub-agents handle case intake/triage/scheduling work; Penny's sub-agents handle finance QA. Cross-domain tasks can be decomposed and dispatched peer-to-peer — any agent can hand a sub-task to another agent's domain.
- **Lifetime**: sub-agents are ephemeral — created for a specific task, run to completion, and torn down. No sub-agent persists beyond its assigned task.
- **Capability propagation**: sub-agent spawning is a peer capability. Any Hermes agent can grant spawning capability to another agent or new sub-system. All 3 agents have this authority.

### Who can do what

| Capability | Metro | Casey | Penny |
|---|---|---|---|---|
| Spawn sub-agents for own tasks | Yes | Yes | Yes |
| Swarm orchestrate (multiple concurrent) | Yes | Yes | Yes |
| Monitor sub-agents across domains | Yes | Yes | Yes |
| Grant spawning to another agent | Yes | Yes | Yes |

### Guardrails

- Sub-agents do NOT create Slack bots, Slack apps, or persistent services
- Sub-agents do NOT make judgment calls — their spawning agent already made the call to delegate
- Agents coordinate to detect duplicate or conflicting sub-agents across domains and flag them
- All sub-agent output flows back through the spawning agent — sub-agents never communicate directly with Shah, Slack, or Notion
- Sub-agents remain in ephemeral mode with no persistence between invocations

## Interns

MetroPrints uses interns for hands-on, supervised support across 2 agent domains: Metro and Casey. [[Penny]]'s finance domain is not intern-accessible — financial data, transaction records, and revenue figures are restricted to Penny and Shah. Interns are the human execution layer; agents retain the judgment calls (routing, escalation tier, anomaly flags, categorization) and final review stays with Shah.

[[Metro]] is the **intern coordination hub** — all intern task assignment, tracking, completion routing, and capacity reporting flows through Metro. Agents identify intern-eligible tasks; Metro assigns them, tracks progress, and routes completed work back to the originating agent for sign-off.

| Agent domain | Intern responsibilities |
|---|---|
| [[Metro]] | Drafting blog/FAQ content from Metro's approved talking points; basic Notion data hygiene (tagging, formatting) under existing SOPs; assisting with knowledge-base and skill-file updates; content opportunity research; SOP formatting and cross-referencing |
| [[Casey]] | Data entry for new client/case records; routine (templated) client follow-up communications; document collection and organization; case file archiving; intake form pre-screening (not dedupe, not routing decisions); confirming appointments by phone/text; calendar data entry; relaying client reschedule requests

**[[Penny]]**'s domain is explicitly excluded — no intern touches financial data, transaction records, expense documentation, or revenue figures.

**Guardrails**

- Interns do not perform the Live Scan/fingerprinting capture itself or any FDLE-regulated compliance step — that stays with authorized staff under MetroPrints' FDLE Live Scan authorization.
- Interns execute tasks an agent has already classified or assigned; they don't make the judgment calls that justify keeping that work in an agent rather than a script.
- Shah reviews intern work product before it's treated as final, the same as any other human-in-the-loop step.
- Penny's domain (finance, transactions, revenue, expenses, receipts) is not intern-accessible under any circumstance — Penny's data stays with Penny and Shah.
- Metro enforces guardrail compliance at the assignment stage: if an agent attempts to route a task to an intern that crosses a guardrail boundary (including any Penny-domain task), Metro intercepts and returns it to the agent for reclassification.
- Metro maintains the active intern workload register so no intern is double-assigned or over capacity.

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

The original 5-role model used generic names: *Hermes Ops Intelligence Agent*, *Hermes Intake and Case Router*, *Hermes Task Triage and Escalation Agent*, *Hermes Finance and Transaction Control Agent*, *Hermes Knowledge Content and Sync Agent*. All 5 of those notes are retired in favor of the persona-named notes above. A 6th agent, Cal, was created for scheduling and subsequently merged into Casey. "Hermes" remains the name of the overall architecture/framework; Metro, Casey, and Penny are the named agents operating within it.

## Cross-agent coordination

- **Casey → Metro**: case volume, intake mix, and stalled-case signals Casey surfaces day-to-day roll up into Metro's higher-altitude, lower-frequency reporting. Casey also feeds appointment volume and scheduling utilization into Metro's pipeline-health view.
- **Metro ↔ Penny**: Saturday runs are coordinated — Metro flags revenue anomalies at the ops level, Penny audits the underlying transaction data for the same period.
- **Casey → Penny**: a case reaching a billable state (e.g., completed Live Scan appointment) is a signal Penny watches for on the finance side, though the transaction itself is logged by Make.
- **Metro → all agents**: peer swarm authority — every agent can spawn, orchestrate, monitor, and grant sub-agent capability. Agents coordinate to prevent inter-domain sub-agent conflicts.
- **Metro → interns**: Metro is the single coordination point — agents route intern-eligible tasks to Metro, Metro assigns and tracks, interns report completion/blockers to Metro, Metro routes finished work back to the originating agent.
- **Operations Live State page**: written/updated by Metro, intended as the shared snapshot other agents and reports read from instead of re-querying Notion databases directly.

## Why this restructuring, in one line

The 5-role model already had two pairs of roles that depended on each other's output — ops reporting fed content drafting, and intake fed triage. Merging each pair into a single named owner (Metro, Casey) removes the handoff between two agents working the same data, Penny carries the finance role forward unchanged, and Cal — which was a net-new scheduling agent — has been folded back into Casey since appointment scheduling is case-management work.

## Open item

Cal has been merged into Casey. See [[Cal]] for the deprecated spec. Casey now owns the full case lifecycle including scheduling.
