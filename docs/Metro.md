---
title: Metro
type: agent-spec
system: MetroPrints
status: active
owner: Shah Saint-Cyr
tags: [hermes, metroprints, agent, metro, ops-intelligence, knowledge, content]
cadence: "Mon/Wed/Fri/Sat 06:00 ET snapshot; Saturday revenue check; bi-weekly Monday strategic briefing; weekly knowledge/content review"
consolidates:
  - Hermes Ops Intelligence Agent (MP Intelligence Agent, Operations Snapshot Agent, Revenue Alert Agent, Strategic Briefing Agent)
  - Hermes Knowledge Content and Sync Agent (MetroPrints Knowledge Sync, Notion to Obsidian sync governance, MP AI Skill File updater, Workflow Skill Set updater, Blog/FAQ opportunity detector, SOP/playbook updater)
related:
  - "[[Hermes Agent Architecture]]"
  - "[[Casey]]"
  - "[[Penny]]"
  - "[[Cal]]"
created: 2026-06-28
---

# Metro

## Role

Metro is MetroPrints' executive intelligence and knowledge agent — the agent that watches the business, reports on it, and keeps institutional knowledge current. It's the merger of the former **Hermes Ops Intelligence Agent** and **Hermes Knowledge, Content & Sync Agent**: one agent that both monitors operations and turns what it learns into documentation, SOPs, and content.

## Consolidates (full lineage)

- **Hermes Ops Intelligence Agent** — folded in whole
  - MP Intelligence Agent / Operations Snapshot Agent
  - Revenue Alert Agent
  - Strategic Briefing Agent
- **Hermes Knowledge, Content & Sync Agent** — folded in whole
  - MetroPrints Knowledge Sync
  - Notion → Obsidian sync governance for MP docs
  - MP AI Skill File updater
  - Workflow Skill Set updater
  - Blog / FAQ opportunity detector
  - SOP / playbook updater

## What it does

**Ops Intelligence side**

- Produces the MetroPrints operations snapshot on each scheduled run
- Tracks stalled cases and aging follow-ups
- Flags revenue anomalies
- Surfaces upcoming compliance deadlines
- Summarizes pipeline health
- Writes/updates the **Operations Live State** page in Notion

**Knowledge & Content side**

- Reviews MP database/workflow changes
- Updates MP AI Skills / Workflow Skill Set
- Maintains the Obsidian mirror mapping (governs *what* should sync and *when*; raw sync runs as a script, not agent reasoning)
- Detects client questions that should become FAQs
- Drafts blog/FAQ entries once a content opportunity is approved
- Updates SOP references when underlying workflows change

Because Metro now owns both halves, the old handoff ("Ops Intelligence flags a content opportunity, hands off to Knowledge & Content") is internal — Metro moves straight from spotting an insight to drafting the content without a cross-agent relay.

## Cadence & triggers

| Run | Schedule | Focus |
|---|---|---|
| Standard snapshot | Mon/Wed/Fri/Sat, 06:00 ET | Ops snapshot, stalled cases, aging follow-ups |
| Revenue check | Saturday (same run) | Revenue anomalies — coordinated with [[Penny]] |
| Strategic briefing | Bi-weekly, Monday | Revenue, pipeline, priorities |
| Knowledge/content review | Weekly | SOP drift, skill-file currency, FAQ/blog opportunities |
| Ad hoc | On major SOP/playbook update or approved content opportunity | Documentation update or content draft |

## Data sources / integrations

- **Reads:** MetroPrints Notion databases (cases, clients, activities, revenue/finance views), MP - Blog & Content
- **Writes:** Operations Live State page, MP AI Skill File, Workflow Skill Set, SOP references, draft blog/FAQ entries
- **Posts to:** Slack (ops channel)
- **Governs (does not itself execute):** Notion → Obsidian raw sync script

## Coordination with other agents

- **[[Penny]]**: Saturday revenue/anomaly pass is coordinated — Metro flags anomalies at the ops level, Penny audits the underlying transaction data for the same period.
- **[[Casey]]**: case volume, intake mix, and stalled-case signals Casey surfaces day-to-day roll up into Metro's higher-altitude, lower-frequency reporting.
- **[[Cal]]**: scheduling volume/utilization can feed Metro's pipeline-health view if useful, though Cal's day-to-day output is mainly consumed by Casey.

## Why this is one agent, not two

Ops reporting and knowledge/content already had a hard dependency in the old model — Ops Intelligence's approved insights were the main trigger for Knowledge & Content's blog/FAQ drafts. Splitting "notice something worth writing about" and "write it" across two agents added a handoff with no judgment benefit. Metro removes that handoff: noticing and writing live in the same place.

## Naming history

Formerly two separate notes: *Hermes Ops Intelligence Agent* and *Hermes Knowledge Content and Sync Agent*. Both are retired as standalone notes; Metro is their merged successor.
