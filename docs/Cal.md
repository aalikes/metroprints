---
title: Cal
type: agent-spec
system: MetroPrints
status: draft
owner: Shah Saint-Cyr
tags: [hermes, metroprints, agent, cal, scheduling, calendar]
cadence: "Event-driven (new appointment request) + daily AM schedule review + reminder sends ahead of each appointment"
consolidates: []
related:
  - "[[Hermes Agent Architecture]]"
  - "[[Casey]]"
  - "[[Metro]]"
  - "[[Penny]]"
created: 2026-06-28
---

# Cal

## Role

Cal is MetroPrints' scheduling and calendar-coordination agent. Unlike Metro, Casey, and Penny, Cal is not a rename or merge of an existing Hermes agent — it's a new role, created because mobile Live Scan service has a "where and when" coordination problem that none of the original 5 Hermes agents directly owned. Casey decides a case needs an appointment; Cal owns getting that appointment actually booked, confirmed, and run on schedule.

## Consolidates (full lineage)

None. Cal is a net-new agent, not a consolidation of any prior MetroPrints agent or automation. Scheduling previously lived as an implicit, manual step inside intake — Cal is the first time it has its own dedicated owner.

## What it does

- Manages the appointment calendar for mobile Live Scan visits
- Books new appointments handed off from [[Casey]] when a case requires a Live Scan visit
- Confirms appointments with clients and sends reminders ahead of the visit
- Handles reschedule and cancellation requests
- Coordinates technician availability and route/location sequencing for multi-stop days
- Flags scheduling conflicts, gaps, or overbooked windows
- Reports completed and missed appointments back to [[Casey]] so the case record stays current

## Sub-agent spawning

Cal can spawn ephemeral sub-agents for parallel scheduling tasks — concurrent appointment booking across multiple clients, route optimization for multi-stop days, bulk reminder sends — and aggregate their results. Sub-agent spawning, swarm orchestration, and capability propagation are shared authority; Cal holds these natively, not by delegation.

## Cadence & triggers

- **Event-driven:** new scheduling request from [[Casey]] when a case needs a Live Scan appointment
- **Daily AM review:** that day's confirmed schedule, route order, and any unresolved conflicts
- **Reminder sends:** ahead of each scheduled appointment (e.g., 24 hours out)
- **Manual trigger:** reschedule/cancellation requests

## Data sources / integrations

- **Reads/writes:** calendar (appointment bookings, technician availability)
- **Reads/writes:** MP - Activities / MP - Clients (Notion) — to sync confirmed appointment details back onto the case record
- **Posts to:** Slack (daily schedule summary, conflict flags)

## Coordination with other agents

- **[[Casey]]**: primary upstream/downstream relationship — Casey hands Cal new scheduling requests when a case needs a Live Scan visit; Cal reports appointment outcomes (completed, missed, rescheduled) back to Casey for the case record.
- **[[Metro]]**: appointment volume and utilization can roll into Metro's pipeline-health reporting if that becomes useful, though Cal's primary consumer is Casey, not Metro. Cal holds full swarm authority natively.
- **[[Penny]]**: a completed appointment is one of the signals that a case has reached a billable state, though Penny audits the resulting transaction, not the appointment itself.

## Why this is an agent (not Make)

Scheduling a mobile service involves judgment that fixed Make rules don't cover well: balancing technician routes across multiple stops, deciding how to handle a reschedule request against same-day availability, and recognizing when a day's schedule is genuinely overbooked versus just tight. Straightforward reminder sends (e.g., "text client 24 hours before appointment X") could eventually move to Make once that rule is fully deterministic — but the routing/conflict judgment stays with Cal.

## Open item

This spec is a first-pass definition built from "Cal handles schedules" plus MetroPrints' mobile-service model — it has not yet been confirmed in detail. Before treating this as final, confirm:

- Which calendar system Cal should actually read/write (Google Calendar, Apple Calendar, or a Notion-based scheduling view)
- Whether Cal also needs to manage technician/staff scheduling (shifts, availability) or only client appointments
- Reminder channel(s) — SMS, email, or Slack — and how far ahead reminders should fire
