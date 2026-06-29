---
title: Casey — FBI PrintDeck Workflow
type: agent-workflow
system: MetroPrints
agent: Casey
status: active
tags: [fbi, printdeck, fingerprint, fd-258, eft, enc, pdf, casey]
related:
  - "[[Casey]]"
  - "[[Metro]]"
  - "[[Penny]]"
created: 2026-06-28
---

# Casey — FBI PrintDeck Workflow

## Role

Casey manages the FBI PrintDeck workflow as part of the broader case lifecycle. She tracks each step, posts reminders for manual actions, logs all milestones to Notion, and escalates stalled cases. She cannot perform physical steps (printing, mailing) or run the ENC → EFT conversion software directly, but she monitors the pipeline end-to-end.

## Workflow Phases (Embedded in Case Lifecycle)

This workflow fits between Phase 2 (Fingerprinting) and Phase 3 (Background Check) of the standard case lifecycle. It is Phase 2.5 — FBI Processing.

```
Phase 2: Fingerprinting
    ├── Capture fingerprints
    ├── Submit FBI request (shah@metroprints.co)
    └── Process payment

Phase 2.5: FBI PrintDeck Processing ← Casey monitors this
    ├── Wait for FBI Email #2
    ├── Extract Order#, PIN, Tokenised Link
    ├── ENC → EFT conversion (manual — capture system)
    ├── EFT → PDF via PrintDeck (manual — PrintDeck tool)
    ├── Save PDF to client Google Drive
    ├── Print + assemble packet
    ├── Mail to FBI CJIS Division
    └── Log tracking + follow-up in Notion

Phase 3: Background Check
    └── Track result, handle rejections
```

## What Casey Automates

| Step | Automation | Status |
|------|-----------|--------|
| FBI intake creation | Case record created via `/casey intake` | ✅ Ready |
| Email #2 monitoring | Poll technician inbox (shah@metroprints.co) | ⬜ Needs email access |
| Data extraction (Order#, PIN, Link) | Parse Email #2 body for patterns | ⬜ Needs email access |
| Conversion step reminders | Post to #metroprints-alerts when case stalls at ENC/EFT/PDF | ✅ Via cron |
| Notion tracking | Log all dates, filenames, tracking numbers | ⬜ Needs Notion API |
| Mailing address validation | Auto-fill FBI CJIS address | ✅ Hardcoded in prompt |
| Library printer IDs | Provide Princh printer IDs on request | ✅ Hardcoded in prompt |
| Status commands | `/casey fbi-status`, `/casey fbi-stale` | ✅ Ready |
| Daily FBI sweep | Flag cases with missing fields, stale follow-ups | ✅ Via cron |

## What Remains Manual (Physical)

- Operating the fingerprint capture hardware
- Running ENC → EFT conversion software
- Using PrintDeck to convert EFT → PDF
- Printing confirmation email + fingerprint cards
- Cropping fingerprint cards
- Assembling and mailing the physical packet

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/casey fbi-intake [name]` | Open new FBI case — log Order#, client type, technician email |
| `/casey fbi-email2 [order#]` | Log Email #2 received — extract PIN, Link, timestamp |
| `/casey fbi-convert [order#]` | Log ENC→EFT→PDF milestones |
| `/casey fbi-mail [order#] [tracking#]` | Log mailed date + tracking number |
| `/casey fbi-status [order#]` | Show full FBI case timeline |
| `/casey fbi-stale` | List FBI cases stalled >48 hrs at any conversion step |
| `/casey fbi-dispatch` | Generate today's FBI cases needing action |

## FBI Case Tracking Schema (Notion — MP Activities)

When Notion API is available, Casey logs:

```
Order #:_______________
PIN:__________________
Tokenised Link:________
Client Name:___________
Client Type: EDO / Dept Order
Technician Email: shah@metroprints.co

EFT Exported: YYYY-MM-DD HH:MM
PDF Generated: YYYY-MM-DD HH:MM
Google Drive Folder: [link]
PDF Filename:__________
Email #2 Received: YYYY-MM-DD HH:MM
Mailed Date: YYYY-MM-DD
Tracking #:____________
Mail-out Package: 2 cards + confirmation
Expected FBI Delivery: YYYY-MM-DD
Follow-up Check: YYYY-MM-DD
Mailed Notice Sent: YYYY-MM-DD HH:MM
```

## FBI CJIS Mailing Address

```
FBI CJIS Division
ATTN: ELECTRONIC SUMMARY REQUEST
1000 Custer Hollow Road
Clarksburg, West Virginia 26306
```

## Library Printers (Princh)

| Location | Printer ID |
|----------|-----------|
| Country Walk Library | 106246 |
| Culmer/Overtown Library | 106247 |

## Cron Automation Targets (Near-Term)

When Make/Zapier automations go live, these manual steps become automated:

| Current Manual Step | Near-Term Target | Target Steps |
|---------------------|-----------------|-------------|
| ENC → EFT conversion | One-click utility or Make scenario | Removes 2 steps |
| EFT → PDF (PrintDeck) | Integrated conversion app | Removes 3 steps |
| Google Drive folder creation | Make scenario | Removes 1 step |
| Email #2 saving to Drive | Make scenario | Removes 1 step |
| Conversion logging to Notion | Make scenario | Removes 1 step |
| Notion tracking updates | Make scenario | Removes 1 step |

**Total manual steps today: 23. Near-term automation: 17. Custom app target: 12.**

## Casey's Role in Automation

Casey does NOT replace these automations. She:
1. Monitors that automations are running correctly
2. Flags when a step hasn't happened on schedule
3. Escalates stalled cases
4. Provides status at a glance via Slack commands
5. Generates daily/weekly FBI dispatch reports

Once Make automations go live, Casey shifts from "reminding about manual steps" to "auditing automation health."
