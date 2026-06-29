---
title: Hermes Agent Deployment Workflow
type: workflow
system: MetroPrints
status: live
tags: [hermes, agent, deployment, slack, workflow]
created: 2026-06-28
---

# Hermes Agent Deployment Workflow

One-command deploy for any Hermes Slack agent. 5 minutes from tokens to live bot.

## Prerequisites

Before deploying, you need from api.slack.com/apps:

1. **Bot User OAuth Token** (`xoxb-...`) — OAuth & Permissions → Install to Workspace
2. **App-Level Token** (`xapp-...`) — Basic Information → App-Level Tokens → `connections:write`
3. **Bot User ID** (`U...`) — Slack → View bot profile → Copy Member ID

## One-Command Deploy

```bash
cd ~/Projects/metroprints
node scripts/hermes-deploy.mjs <name> <xapp> <xoxb> <bot-user-id> [description]
```

### Example: Deploy Penny

```bash
node scripts/hermes-deploy.mjs Penny \
  xapp-1-A0123456789-... \
  xoxb-1234567890-... \
  U01234567 \
  "Finance oversight agent"
```

## What It Does

| Step | Action |
|------|--------|
| 1 | Creates `agents/<name>/` directory |
| 2 | Copies Casey's listener template (with all features) |
| 3 | Replaces bot user ID, name, knowledge files |
| 4 | Creates launchd plist with all tokens + DeepSeek key |
| 5 | Copies package.json (for imapflow email support) |
| 6 | Generates Slack app manifest with 3 default commands |
| 7 | Loads launchd — bot goes live immediately |

## What Every Agent Gets (from Template)

- ✅ Socket Mode listener with WebSocket reconnect
- ✅ DeepSeek LLM integration
- ✅ 30-minute active thread window (no @mention needed in threads)
- ✅ Deduplication (no double responses)
- ✅ Slash commands (3 default + add more)
- ✅ Notion API integration
- ✅ Obsidian vault knowledge loading
- ✅ Website monitoring
- ✅ Email monitoring (imapflow — needs app password)
- ✅ launchd persistence with auto-restart
- ✅ Thread context (20 messages)

## Post-Deploy Steps

1. **Update manifest** — Go to api.slack.com/apps → App Manifest → paste `agents/<name>/manifest.json`
2. **Customize commands** — Edit `agents/<name>/listener.mjs`:
   - Update `BASE_SYSTEM_PROMPT` with agent's role
   - Add agent-specific commands to `handleCommand` switch
   - Update `showHelp()` with new commands
3. **Restart** — `launchctl unload/load` the plist
4. **Test** — `@<Name>` in Slack, then reply in thread without @mention

## Customizing After Deploy

### Add New Slash Commands

1. Edit `agents/<name>/listener.mjs`:
   - Add `case "/<name>-mycommand":` in the switch statement
   - Add command to manifest.json
2. Restart: `launchctl unload/load ~/Library/LaunchAgents/com.metroprints.<name>.listener.plist`
3. Paste updated manifest at api.slack.com/apps

### Add Agent-Specific Knowledge

1. Create an agent spec in Obsidian: `Skills/Skills/Metroprints/agents/<Name>.md`
2. Update `KNOWLEDGE_FILES` in listener.mjs to include it
3. Restart or run `/<name>-learn` in Slack

### Add Cron Jobs

Schedule via crontab or launchd timers:

```bash
# Add to Casey-style cron
*/30 * * * * /usr/local/bin/node /path/to/agent/listener.mjs --cron=snapshot
```

Or use launchd `StartCalendarInterval`:

```xml
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key><integer>6</integer>
  <key>Minute</key><integer>0</integer>
  <key>Weekday</key><integer>1</integer>  <!-- Monday -->
</dict>
```

## Current Deployed Agents

| Agent | Deploy Date | Listener Path | PID |
|-------|-------------|---------------|-----|
| Casey | June 27 | `agents/casey/listener.mjs` | Active |
| Metro | June 28 | `agents/metro/listener.mjs` | Active |
| Penny | — | `agents/penny/listener.mjs` | Planned |
| Cal | — | `agents/cal/listener.mjs` | Planned |

## Commands

```bash
# Deploy
node scripts/hermes-deploy.mjs <name> <xapp> <xoxb> <bot-user-id>

# Status
launchctl list | grep metroprints

# Logs
tail -f ~/Library/Logs/com.metroprints.<name>.listener.log

# Restart
launchctl unload ~/Library/LaunchAgents/com.metroprints.<name>.listener.plist
launchctl load ~/Library/LaunchAgents/com.metroprints.<name>.listener.plist
```
