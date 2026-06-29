---
title: Hermes Agent Activation Tutorial
type: tutorial
system: MetroPrints
status: live
tags: [hermes, agent, deployment, slack, tutorial, step-by-step]
created: 2026-06-29
---

# Hermes Agent Activation — Step-by-Step Tutorial

Complete walkthrough for activating any Hermes agent in Slack. From zero to responding bot.

---

## Prerequisites

Before starting, ensure you have:

- [ ] **Node.js 22+** installed (`node --version`)
- [ ] **DeepSeek API key** with credits (`sk-...`)
- [ ] **Slack workspace** access (admin preferred)
- [ ] **OpenCode** installed and configured
- [ ] **GitHub** access to [hermes-agents](https://github.com/aalikes/hermes-agents)

---

## Phase 1: Create Slack App

### Step 1.1 — Create the App

1. Go to https://api.slack.com/apps
2. Click **Create New App → From scratch**
3. Name: `<AgentName>` (e.g., Penny)
4. Choose workspace: `MetroPrints` (metroprintsworkspace.slack.com)
5. Click **Create App**

### Step 1.2 — Apply the Manifest

1. In the new app, go to **Features → App Manifest**
2. Copy the manifest from `agents/<name>/manifest.json` in the repo
3. Paste and save

Your app now has:
- ✅ Socket Mode enabled
- ✅ Event subscriptions (app_mention, message.*)
- ✅ Bot token scopes (chat:write, channels:history, etc.)
- ✅ Slash commands
- ✅ Interactivity enabled

### Step 1.3 — Get Your Tokens

1. **OAuth & Permissions → Install to Workspace**
   - Copy **Bot User OAuth Token** (`xoxb-...`) ← Save this
2. **Basic Information → App-Level Tokens**
   - Click **Generate Token and Scopes**
   - Name: `socket-mode`
   - Add scope: `connections:write`
   - Copy the token (`xapp-...`) ← Save this
3. **Slack Desktop → View agent profile → Copy Member ID**
   - Looks like `U0BDF2P4SHL` ← Save this

**You now have 3 tokens: xoxb, xapp, bot-user-id**

---

## Phase 2: Deploy with One Command

### Step 2.1 — Run the Deploy Script

```bash
cd ~/Projects/hermes-agents
node hermes-deploy.mjs <AgentName> <xapp> <xoxb> <bot-user-id> "Description"
```

**Example (Penny):**
```bash
node hermes-deploy.mjs Penny \
  xapp-1-A0123456789-... \
  xoxb-1234567890-... \
  U0EXAMPLE \
  "Finance oversight agent"
```

### Step 2.2 — What Happens

The script automatically:

1. Creates `agents/<name>/` directory
2. Copies Casey's listener template (all features included)
3. Replaces agent name, bot ID, knowledge files
4. Creates **launchd plist** at `~/Library/LaunchAgents/`
5. Copies `package.json` (for imapflow email support)
6. Generates Slack app manifest with default commands
7. Loads launchd — agent goes live immediately

### Step 2.3 — Verify It's Running

```bash
# Check status
launchctl list | grep metroprints

# Expected output:
# 12226  0  com.metroprints.casey.listener
# 38410  0  com.metroprints.metro.listener
# XXXXX  0  com.metroprints.penny.listener   ← new agent

# Check logs
tail -f ~/Library/Logs/com.metroprints.penny.listener.log

# Expected output:
# [penny] Loaded knowledge: ...
# [penny] Connecting to Slack Socket Mode...
# [penny] Connected. Listening.
# [penny] Hello, connections: 1
```

### Step 2.4 — Test in Slack

1. Go to your Slack workspace
2. Type `@Penny hello` in any channel or DM
3. Agent should respond with LLM-powered reply

---

## Phase 3: Customize the Agent

### Step 3.1 — Edit the System Prompt

Open `agents/<name>/listener.mjs` and update `BASE_SYSTEM_PROMPT`:

```javascript
const BASE_SYSTEM_PROMPT = `You are <Name>, <description>.

## Identity
- What business/team you serve
- Your role and purpose

## What You Do
- List of responsibilities
- Commands you respond to

## What You DO NOT Do
- Boundaries and handoffs to other agents

## Agent Coordination
- Who you work with and how`;
```

### Step 3.2 — Add Custom Slash Commands

In `handleCommand` switch statement, add your commands:

```javascript
case "/penny-revenue":
  finalText = "💰 Revenue report coming soon — full Notion integration pending.";
  break;
case "/penny-expenses":
  finalText = "📊 Expense audit — check Notion Financial Tracker for live data.";
  break;
```

Then add them to `agents/<name>/manifest.json`:

```json
{
  "command": "/penny-revenue",
  "description": "Show revenue report",
  "should_escape": false
}
```

### Step 3.3 — Restart to Apply

```bash
launchctl unload ~/Library/LaunchAgents/com.metroprints.penny.listener.plist
launchctl load ~/Library/LaunchAgents/com.metroprints.penny.listener.plist
```

Then paste updated manifest at api.slack.com/apps → App Manifest.

---

## Phase 4: Connect Integrations

### Step 4.1 — Notion (Available)

Already configured in launchd plist. Agent can query:

```javascript
// Query MP - Activities
await notionQueryDB("27189d07-dc61-8122-acde-f2cffd");

// Search workspace
await notionSearch("FBI case");
```

### Step 4.2 — Gmail (Needs App Password)

1. Go to https://myaccount.google.com/apppasswords
2. Sign in with agent's email
3. Select **Mail → Other (AgentName)**
4. Copy the 16-char code
5. Update the plist:

```bash
# In ~/Library/LaunchAgents/com.metroprints.<name>.listener.plist
# Add under EnvironmentVariables:
# <key>METROPRINTS_EMAIL</key>
# <string>agent@metroprints.co</string>
# <key>METROPRINTS_EMAIL_PASS</key>
# <string>xxxx xxxx xxxx xxxx</string>
```

6. Restart: `launchctl unload/load`

### Step 4.3 — Website Monitoring

Already configured. Agent checks `https://metroprints.co` on `/agent status` command.

### Step 4.4 — Google Drive

Requires Google Cloud OAuth setup (separate guide). For now, agents reference manual Drive operations.

---

## Phase 5: Set Up Scheduled Jobs

### Step 5.1 — Add to Crontab

```bash
crontab -e
```

Add jobs based on agent's schedule:

```cron
# Casey — daily standup
0 8 * * * /usr/local/bin/node ~/Projects/metroprints/agents/casey/cron/standup.mjs

# Casey — stale case sweep
0 9 * * * /usr/local/bin/node ~/Projects/metroprints/agents/casey/cron/sweep.mjs

# Metro — ops snapshot (Mon/Wed/Fri/Sat)
0 6 * * 1,3,5,6 /usr/local/bin/node ~/Projects/metroprints/agents/metro/cron/snapshot.mjs

# Penny — weekly finance QA
0 8 * * 1 /usr/local/bin/node ~/Projects/metroprints/agents/penny/cron/audit.mjs
```

### Step 5.2 — Or Use launchd Timers

Add to the existing plist:

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>0</integer>
</dict>
```

---

## Phase 6: Update Documentation

### Step 6.1 — Agent Spec in Obsidian

Create `Skills/Skills/Metroprints/agents/<Name>.md`:

```markdown
---
title: <Name>
type: agent-spec
system: MetroPrints
status: active
owner: Shah Saint-Cyr
tags: [hermes, metroprints, agent]
cadence: "<schedule description>"
related: ["[[Casey]]", "[[Metro]]"]
created: YYYY-MM-DD
---

# <Name>

## Role
<description>

## What it does
<responsibilities>

## Cadence & triggers
<schedule>

## Coordination with other agents
<handoffs>
```

### Step 6.2 — Update Agentic Centre

Add the new agent to `Skills/MetroPrints Agentic Centre.md` under `## Agents`.

### Step 6.3 — Push to GitHub

```bash
cd ~/Projects/hermes-agents
git add .
git commit -m "feat: activate <Name> agent"
git push
```

---

## Activating Existing Agents (Quick Reference)

### Casey (Case Management) — Already Active

```bash
# Status
launchctl list | grep casey

# Restart
launchctl unload ~/Library/LaunchAgents/com.metroprints.casey.listener.plist
launchctl load ~/Library/LaunchAgents/com.metroprints.casey.listener.plist

# Logs
tail -f ~/Library/Logs/com.metroprints.casey.listener.log
```

**16 slash commands:** `/casey`, `/casey-audit`, `/casey-channels`, `/casey-members`, `/casey-status`, `/casey-alert`, `/casey-recall`, `/casey-help`, `/casey-learn`, `/casey fbi-intake`, `/casey fbi-status`, `/casey fbi-stale`, `/casey fbi-dispatch`, `/casey website`, `/casey cases`

**Duties:** Case intake, FBI PrintDeck workflow, compliance monitoring, daily standups, case sweeps, escalation management. Coordinates with Penny (billable state), Cal (appointments), Metro (reporting).

---

### Metro (Ops Intelligence) — Already Active

```bash
# Status
launchctl list | grep metro.listener

# Restart
launchctl unload ~/Library/LaunchAgents/com.metroprints.metro.listener.plist
launchctl load ~/Library/LaunchAgents/com.metroprints.metro.listener.plist

# Logs
tail -f ~/Library/Logs/com.metroprints.metro.listener.log
```

**8 slash commands:** `/metro`, `/metro snapshot`, `/metro pipeline`, `/metro revenue`, `/metro briefing`, `/metro content`, `/metro-help`, `/metro-learn`

**Duties:** Mon/Wed/Fri/Sat 6AM ops snapshots, Saturday revenue checks (coordinated with Penny), bi-weekly Monday strategic briefings, knowledge/content review, SOP maintenance, FAQ/blog detection. Coordinates with Casey (case signals), Penny (finance data), Cal (scheduling utilization).

---

### Penny (Finance Oversight) — Planned

```bash
# Deploy
node ~/Projects/hermes-agents/hermes-deploy.mjs Penny <xapp> <xoxb> <bot-id> "Finance oversight agent"

# Status
launchctl list | grep penny
```

**Duties:** Weekly finance QA, Saturday revenue/anomaly pass (coordinated with Metro), Square/Stripe audit, expense classification, dedup registry review, finance anomaly monitoring. Does NOT log transactions — Make handles deterministic logging; Penny audits and detects anomalies.

---

### Cal (Scheduling) — Planned

```bash
# Deploy
node ~/Projects/hermes-agents/hermes-deploy.mjs Cal <xapp> <xoxb> <bot-id> "Scheduling agent"

# Status
launchctl list | grep cal
```

**Duties:** Mobile Live Scan appointment scheduling, operator availability management, client reminders (48hr/24hr/2hr), reschedule handling, no-show tracking. Hands off completed/missed appointments back to Casey for case record updates.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Agent doesn't respond | `launchctl list | grep <name>` — is PID listed? |
| Agent gives generic "I'm <name>" reply | LLM API key expired/out of credits — check error log |
| `app_mention` not firing | Manifest applied correctly at api.slack.com/apps? |
| `missing_scope` errors | Manifest scopes complete? Reinstall app to workspace? |
| Double responses | Dedup code active? Check logs for duplicate events |
| Thread not tracking without @mention | Was agent's first reply in that thread? Did 30 min expire? |
| Launchd won't start | Node path correct? `which node` → update plist `ProgramArguments` |
| Logs show "no LLM" | `DEEPSEEK_API_KEY` in plist? Key has credits? |

---

## Quick Command Reference

```bash
# Deploy new agent
node hermes-deploy.mjs <name> <xapp> <xoxb> <bot-id> "role"

# Check all agents
launchctl list | grep metroprints

# Restart an agent
launchctl unload ~/Library/LaunchAgents/com.metroprints.<name>.listener.plist
launchctl load ~/Library/LaunchAgents/com.metroprints.<name>.listener.plist

# View live logs
tail -f ~/Library/Logs/com.metroprints.<name>.listener.log

# Check errors
cat ~/Library/Logs/com.metroprints.<name>.listener.error.log

# Test in Slack
@<Name> hello
```

---

_Last updated: June 29, 2026 | Source: Casey + Metro live deployments_
