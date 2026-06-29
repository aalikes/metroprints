# Casey Task Register
**MetroPrints Slack Workspace Administrator**  
_Compiled from Obsidian vault, operations playbook, and alert configuration_

---

## ACTIVE — Running Now

| ID | Task | Trigger | Status |
|----|------|---------|--------|
| T01 | Respond to `@Casey` mentions in any channel/DM | Real-time | ✅ Live |
| T02 | Handle `/casey` slash commands (9 commands) | Real-time | ✅ Live |
| T03 | Maintain conversation context (20-msg window) | Real-time | ✅ Live |
| T04 | Load knowledge from Obsidian vault at startup | On launch | ✅ Live |

## SCHEDULED — Needs Cron Setup

| ID | Task | Schedule | Channel |
|----|------|----------|---------|
| T05 | **Morning Standup** — Scan #metroprints-critical for overnight P0/P1 alerts, summarize status | Daily 8:00 AM | #metroprints-critical |
| T06 | **Channel Health Audit** — List all channels, flag archived/inactive, check membership | Daily 9:00 AM | #metroprints-alerts |
| T07 | **Member Audit** — Report new/removed members, role changes | Weekly Mon 9:00 AM | #metroprints-alerts |
| T08 | **Alert System Check** — Verify Casey connected, webhook status, Socket Mode health | Every 6 hours | #metroprints-alerts |
| T09 | **Weekly Review** — Summarize resolved alerts, open alerts by priority, stale items | Weekly Fri 4:00 PM | #metroprints-alerts |
| T10 | **Cost Monitor** — Check DeepSeek API usage, alert if >80% of budget | Daily 6:00 PM | DM Shah |
| T11 | **Thread Digest** — Summarize key conversations from each channel that day | Daily 5:00 PM | #metroprints-alerts |

## SOON — Needs External Access

| ID | Task | Depends On |
|----|------|-----------|
| T12 | **Revenue Monitoring** — Daily revenue vs $800-$1200 target, flag drops | Notion Financial DB access |
| T13 | **Compliance Tracking** — FDLE cert expiry (60-day warning), insurance lapse | FDLE portal / Notion Compliance DB |
| T14 | **Payment Alerts** — Failed Square/Stripe transactions, invoice >30 days | Square/Stripe API |
| T15 | **Operations Monitoring** — Equipment status, appointment availability, no-show rate | Notion Operations DB |
| T16 | **Notion→Slack Webhook** — Set up and verify incoming webhooks for auto-alerts | Webhook configuration |
| T17 | **Slack Config Token Rotation** — Rotate xoxe tokens every 10 hours | Token rotation script |

## RESPONSIBILITIES — Per Operations Playbook

### Daily (from MetroPrints_Daily_Operations_Playbook.md)
- Review P0/P1/P2 alerts in #metroprints-critical
- Confirm overnight alerts have action underway
- Assign owners for unassigned alerts
- Update status on resolved alerts

### Weekly (Friday 4:00 PM)
- Verify alert statuses are correct (Open/In Progress/Resolved)
- Clear resolved alerts from board
- Flag stale items (>3 days Open without progress)
- Generate week-end summary

### Alert Thresholds (from MetroPrints_Alert_Configuration.md)
- **P0 Critical**: FDLE cert expired, insurance lapsed, payment system down, data breach, equipment failure → <1 hour response
- **P1 Urgent**: Revenue drop, failed transaction, cert expiring, quality failure → resolve by 6 PM
- **P2 Standard**: Low availability, high no-show, client inactivity → resolve in 3-5 days
- **P3 FYI**: Compliance audit, training backlog → weekly review

---

## What Casey Can Do vs What She Needs

| Capability | Now | Needs |
|-----------|-----|-------|
| Read/write Slack messages | ✅ | — |
| List channels, members, groups | ✅ | — |
| Post alerts to #metroprints-critical/alerts | ✅ | — |
| Summarize conversations | ✅ | — |
| Scheduled cron jobs | ❌ | launchd cron or plist timers |
| Read Notion databases | ❌ | Notion API key + DB IDs |
| Check revenue/payments | ❌ | Square/Stripe API keys |
| Monitor FDLE certs | ❌ | FDLE portal or manual notification |
| Rotate Slack tokens | ❌ | Token rotation script + cron |

---

## Cron Implementation Plan

```
# Casey Scheduled Jobs — add to crontab (crontab -e)

# Morning standup — summarize critical alerts
0 8 * * * /usr/local/bin/node -e "fetch('http://localhost:0/internal/casey?task=standup')" 2>/dev/null

# Channel health audit (daily)
0 9 * * * /usr/local/bin/node /Users/shahsaint-cyr/Projects/metroprints/agents/casey/cron/audit.mjs

# Member changes (weekly Monday)
0 9 * * 1 /usr/local/bin/node /Users/shahsaint-cyr/Projects/metroprints/agents/casey/cron/members.mjs

# Alert system health check (every 6 hours)
0 */6 * * * /usr/local/bin/node /Users/shahsaint-cyr/Projects/metroprints/agents/casey/cron/health.mjs

# Weekly review (Friday 4pm)
0 16 * * 5 /usr/local/bin/node /Users/shahsaint-cyr/Projects/metroprints/agents/casey/cron/review.mjs

# Cost monitoring (daily 6pm)
0 18 * * * /usr/local/bin/node /Users/shahsaint-cyr/Projects/metroprints/agents/casey/cron/cost.mjs
```

---

_Last updated: June 28, 2026 | Source: Obsidian vault + MetroPrints playbooks_
