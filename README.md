# MetroPrints Hermes Agent System

Four AI agents (Metro, Casey, Penny, Cal) operating as Slack bots in the MetroPrints workspace — handling operations intelligence, case management, finance oversight, and scheduling.

## Agents

| Agent | Role | Channel | Status |
|-------|------|---------|--------|
| **Metro** | Executive intelligence — ops snapshots, revenue alerts, strategic briefings, knowledge/content | `#metroprints-alerts` | Active |
| **Casey** | Case management — intake, FBI/Live Scan routing, daily triage, compliance monitoring | `#metroprints-critical` | Active |
| **Penny** | Finance oversight — transaction QA, anomaly detection, dedup review, Make audit | `#metroprints-alerts` | Active |
| **Cal** | Scheduling — mobile Live Scan appointments, technician routing, reminders | `#metroprints-alerts` | Draft |

## Architecture

```
Slack Socket Mode (WebSocket) → Node.js listener → DeepSeek LLM
                                                  → Notion API
                                                  → Obsidian vault (knowledge)
                                                  → Gmail IMAP (email monitoring)
                                                  → metroprints.co (website monitor)
```

Each agent runs as a persistent Node.js process managed by launchd, with auto-restart on failure.

## Directory Structure

```
agents/
├── metro/          Metro listener, cron, manifest
├── casey/          Casey listener, cron, manifest
├── penny/          Penny listener, cron, manifest
├── cal/            Cal listener, cron, manifest
└── shared/         Shared utilities (cron-utils, subagent spawning)
docs/               Agent specs, architecture, SOPs
scripts/            Deployment and management scripts
.opencode/          OpenCode agent definitions and templates
```

## Quick Commands

```bash
# Deploy a new agent
node scripts/hermes-deploy.mjs <name> <xapp> <xoxb> <bot-user-id> [description]

# Check agent status
launchctl list | grep metroprints

# View agent logs
tail -f ~/Library/Logs/com.metroprints.metro.listener.log

# Restart an agent
launchctl unload ~/Library/LaunchAgents/com.metroprints.metro.listener.plist
launchctl load ~/Library/LaunchAgents/com.metroprints.metro.listener.plist
```

## Environment Variables

See `.env.example` for the full list. Each agent's launchd plist injects:
- `DEEPSEEK_API_KEY` — DeepSeek API key
- `SLACK_XAPP_TOKEN` — Slack Socket Mode app-level token (`xapp-`)
- `SLACK_XOXB_TOKEN` — Slack Bot User OAuth token (`xoxb-`)
- `SLACK_BOT_USER_ID` — Bot user ID (`U...`)
- `NOTION_API_KEY` — Notion integration token (`ntn_...`)
- `METROPRINTS_EMAIL` — Gmail address for email monitoring (optional)
- `METROPRINTS_EMAIL_PASS` — Gmail App Password for IMAP (optional)

## Notion Databases

| Database | ID | Used By |
|----------|-----|---------|
| Activities | `27189d07-dc61-8122-acde-f2cffd` | All agents |
| Planning | `27189d07-dc61-8168-9182-ef0386dbd9e7` | All agents |
| ORI | `731bd0e1-0c8f-4db5-8fc5-4086e9cba134` | All agents |
| Projects | `27189d07-dc61-8140-abb6-d35934cf48a7` | All agents |
| Marketplace | `9bd3910c-6dc2-4bb7-81be-8af80b2a3e74` | All agents |
| Financial Tracker | `e3f5a9cf-2e0e-4c7d-90b1-8672c61b20e7` | Penny |
| Transactions | `36389d07-dc61-8160-8a02-e9f966e9a39d` | Penny |
| Budgets | `36389d07-dc61-816a-af99-eb57bd0b7d9f` | Penny |

## Scheduled Jobs (Cron)

| Agent | Job | Schedule | Script |
|-------|-----|----------|--------|
| Casey | Morning standup | Daily 8:00 AM | `agents/casey/cron/standup.mjs` |
| Casey | Channel audit | Daily 9:00 AM | `agents/casey/cron/audit.mjs` |
| Casey | Weekly review | Fri 4:00 PM | `agents/casey/cron/review.mjs` |
| Casey | Cost monitor | Daily 6:00 PM | `agents/casey/cron/cost.mjs` |
| Metro | Ops snapshot | Mon/Wed/Fri/Sat 6:00 AM | `agents/metro/cron/snapshot.mjs` |
| Metro | Revenue check | Sat 6:00 AM | `agents/metro/cron/revenue.mjs` |
| Metro | Strategic briefing | Bi-weekly Mon 6:00 AM | `agents/metro/cron/briefing.mjs` |
| Penny | Finance QA | Weekly Mon 9:00 AM | `agents/penny/cron/qa.mjs` |
| Cal | Schedule review | Daily 7:00 AM | `agents/cal/cron/review.mjs` |

Install: `crontab -e` and add entries from `docs/casey-task-register.md`.

## Sub-Agent Spawning

All agents share swarm authority — each can spawn ephemeral sub-agents for parallel task decomposition. Use the `[SPAWN:role]prompt[/SPAWN]` syntax in responses. Sub-agents run as parallel LLM calls and their results replace the markers.

See `agents/shared/subagent.mjs` for the implementation and `docs/Hermes Agent Architecture.md` for the full spec.
