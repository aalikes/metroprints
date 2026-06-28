# Hermes Agent SOP — Slack Bot Deployment

## Overview

This document is the complete Standard Operating Procedure for creating, configuring, and deploying an AI-powered Slack bot agent (codenamed "Hermes") using OpenCode + Socket Mode + launchd persistence. Based on the live Casey agent deployment in the MetroPrints workspace.

**What you get:** A Slack bot that responds to `@mentions` with LLM-powered intelligence, persists across reboots, and is manageable through OpenCode MCP tools.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Your Mac / VPS                           │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   launchd (plist)    │    │   OpenCode + MCP             │   │
│  │   ─────────────────  │    │   ───────────────────────    │   │
│  │   listener.mjs       │    │   agent/<name>.md            │   │
│  │   Node.js native WS  │    │   slack-mcp-server stdio     │   │
│  │   KeepAlive: true    │    │   Tools: channels, users,    │   │
│  │   Auto-restart       │    │          messages, groups    │   │
│  └──────┬───────────────┘    └──────────────┬───────────────┘   │
│         │                                   │                    │
│    xapp token                          xoxb token                │
│    (Socket Mode WS)                    (HTTP API)                │
│         │         ┌──────────────────────┘                      │
│         ▼         ▼                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Slack Workspace                         │   │
│  │  @Agent → Socket Mode event → listener.mjs → LLM → reply │   │
│  │  OpenCode → bot token HTTP → read/write channels, users  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name: `<AgentName>` (e.g., Casey)
4. Pick your workspace

### App Configuration (Manifest)

Use this manifest to configure everything at once. Go to **Features → App Manifest** and paste:

```json
{
  "display_information": {
    "name": "<AgentName>",
    "description": "<description>",
    "background_color": "#1a1a2e"
  },
  "features": {
    "bot_user": {
      "display_name": "<AgentName>",
      "always_online": true
    },
    "app_home": {
      "home_tab_enabled": true,
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "assistant:write",
        "channels:history",
        "channels:join",
        "channels:manage",
        "channels:read",
        "chat:write",
        "commands",
        "files:read",
        "files:write",
        "groups:history",
        "groups:read",
        "groups:write",
        "im:history",
        "im:read",
        "im:write",
        "reactions:read",
        "reactions:write",
        "usergroups:read",
        "users:read"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_home_opened",
        "app_mention",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim"
      ]
    },
    "interactivity": {
      "is_enabled": false
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
```

### Get Tokens

1. **OAuth & Permissions** → Install to Workspace → copy **Bot User OAuth Token** (`xoxb-...`)
2. **Basic Information** → App-Level Tokens → Generate Token → `connections:write` → copy **xapp token** (`xapp-...`)
3. Note your **Bot User ID** (find in Slack: View Profile → Copy Member ID, looks like `U0BD79D3ZHD`)

---

## Step 2: Create the Socket Mode Listener

Create directory: `~/Projects/<project>/agents/<name>/`

### `listener.mjs`

```javascript
import { randomUUID } from "node:crypto";

const XAPP = "<xapp-token>";
const XOXB = "<xoxb-token>";
const SLACK_API = "https://slack.com/api";
const BOT_USER_ID = "<bot-user-id>";

// ── LLM Config (pick one) ──────────────────────────

// DeepSeek (OpenAI-compatible):
const LLM_KEY = process.env.DEEPSEEK_API_KEY || "";
const LLM_URL = "https://api.deepseek.com/v1/chat/completions";
const LLM_MODEL = "deepseek-chat";

// OR Anthropic:
// const LLM_KEY = process.env.ANTHROPIC_API_KEY || "";
// const LLM_URL = "https://api.anthropic.com/v1/messages";
// const LLM_MODEL = "claude-3-5-haiku-latest";

const SYSTEM_PROMPT = `You are <AgentName>, <role description>.

## Identity
<detailed identity>

## Workspace Knowledge
<key channels, users, structure>

## Capabilities
<what you can do>

## Response Style
- Be conversational but professional
- Answer questions directly
- If you can't do something, explain why and offer alternatives`;

// ── API Helpers ─────────────────────────────────────

async function slack(method, body, token = XOXB) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── LLM Call ────────────────────────────────────────

async function think(messages) {
  if (!LLM_KEY) return null;
  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LLM_KEY}`,
        "Content-Type": "application/json",
        "x-api-key": LLM_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });
    const j = await res.json();
    if (j.error) { console.error("[agent] LLM error:", JSON.stringify(j.error)); return null; }
    return j.choices?.[0]?.message?.content || j.content?.[0]?.text || null;
  } catch (e) {
    console.error("[agent] LLM error:", e.message);
    return null;
  }
}

// ── Context Fetching ────────────────────────────────

async function fetchContext(channel, thread, count = 6) {
  try {
    const params = { channel, limit: count };
    if (thread) params.ts = thread;
    const res = await slack("conversations.replies", params);
    if (!res.ok || !res.messages) return [];
    return res.messages
      .filter((m) => m.text)
      .map((m) => {
        let text = m.text;
        text = text.replace(new RegExp(`<@${BOT_USER_ID}>`, "g"), "@Agent");
        text = text.replace(/<@[^>]+>/g, "@someone");
        text = text.replace(/<!channel>/g, "@channel");
        text = text.replace(/<[^>|]+\|[^>]+>/g, "$1");
        text = text.replace(/<([^>]+)>/g, "$1");
        const role = m.user === BOT_USER_ID ? "assistant" : "user";
        return { role, content: text };
      });
  } catch { return []; }
}

// ── Response Handler ────────────────────────────────

async function handle(channel, user, text, thread) {
  try {
    let userName = "there";
    try {
      const u = await slack("users.info", { user });
      if (u.ok && u.user?.real_name) userName = u.user.real_name;
    } catch {}

    const history = await fetchContext(channel, thread);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(0, -1).slice(-10),
      { role: "user", content: `[${userName}]: ${text}` },
    ];

    let reply = await think(messages);
    if (!reply) {
      reply = `Hey ${userName.split(" ")[0]}! I'm <AgentName>. How can I help?`;
    }

    await slack("chat.postMessage", { channel, text: reply, thread_ts: thread });
    console.log(`[agent] Replied in ${channel} to ${userName}`);
  } catch (e) {
    console.error("[agent] handle error:", e.message);
    try {
      await slack("chat.postMessage", { channel, text: "Sorry, something went wrong. Try again?", thread_ts: thread });
    } catch {}
  }
}

// ── Socket Mode Connection ──────────────────────────

function isMentioned(text) {
  return text.includes(`<@${BOT_USER_ID}>`);
}

function cleanText(text) {
  return text.replace(new RegExp(`<@${BOT_USER_ID}>\\s*`, "g"), "").trim();
}

async function getWebSocketUrl() {
  const res = await slack("apps.connections.open", {}, XAPP);
  if (!res.ok) throw new Error(`apps.connections.open failed: ${res.error}`);
  return res.url;
}

async function connect() {
  const url = await getWebSocketUrl();
  console.log(`[agent] Connecting to Slack Socket Mode...`);
  const ws = new WebSocket(url);
  let pingInterval;

  ws.onopen = () => {
    console.log("[agent] Connected. Listening.");
    pingInterval = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 30000);
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "hello") {
        console.log(`[agent] Hello, connections: ${msg.num_connections}`);
        return;
      }

      if (msg.type === "disconnect") {
        console.log(`[agent] Disconnect: ${msg.reason}. Reconnecting...`);
        clearInterval(pingInterval);
        ws.close();
        setTimeout(connect, 1000);
        return;
      }

      if (msg.type === "events_api" && msg.payload?.event) {
        const evt = msg.payload.event;
        ws.send(JSON.stringify({ envelope_id: msg.envelope_id, type: "ack" }));

        if (evt.user === BOT_USER_ID) return;
        if (evt.subtype === "message_changed" || evt.subtype === "message_deleted") return;

        const text = evt.text || "";

        if (evt.type === "app_mention") {
          console.log(`[agent] MENTION: ${evt.channel} user=${evt.user} text="${text.substring(0, 60)}"`);
          await handle(evt.channel, evt.user, text, evt.ts);
          return;
        }

        if (evt.type === "message" && isMentioned(text)) {
          console.log(`[agent] MENTION (msg): ${evt.channel} user=${evt.user} text="${text.substring(0, 60)}"`);
          await handle(evt.channel, evt.user, cleanText(text), evt.ts);
          return;
        }
      }
    } catch (e) {
      console.error("[agent] Error:", e.message);
    }
  };

  ws.onerror = (err) => console.error("[agent] WS error:", err.message || err);

  ws.onclose = (event) => {
    console.log(`[agent] Closed (${event.code}). Reconnect in 5s...`);
    clearInterval(pingInterval);
    setTimeout(connect, 5000);
  };
}

console.log("[agent] Starting Socket Mode listener...");
connect();
```

---

## Step 3: Deploy with launchd (macOS Persistence)

Create `~/Library/LaunchAgents/com.<project>.<agent>.listener.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.<project>.<agent>.listener</string>
	<key>ProgramArguments</key>
	<array>
		<string>/usr/local/bin/node</string>
		<string>/Users/<user>/Projects/<project>/agents/<agent>/listener.mjs</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>WorkingDirectory</key>
	<string>/Users/<user>/Projects/<project>/agents/<agent></string>
	<key>EnvironmentVariables</key>
	<dict>
		<key>DEEPSEEK_API_KEY</key>
		<string>sk-...</string>
	</dict>
	<key>StandardOutPath</key>
	<string>/Users/<user>/Library/Logs/com.<project>.<agent>.listener.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/<user>/Library/Logs/com.<project>.<agent>.listener.error.log</string>
</dict>
</plist>
```

**Commands:**
```bash
# Start
launchctl load ~/Library/LaunchAgents/com.<project>.<agent>.listener.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.<project>.<agent>.listener.plist

# Status
launchctl list | grep <agent>

# Logs
tail -f ~/Library/Logs/com.<project>.<agent>.listener.log
```

---

## Step 4: Configure OpenCode MCP

Add to `~/.config/opencode/opencode.jsonc` → `mcp`:

```jsonc
"slack-<agent>": {
  "type": "local",
  "command": ["slack-mcp-server", "-t", "stdio", "-enabled-tools",
    "channels_list,conversations_history,conversations_search_messages,conversations_replies,conversations_unreads,conversations_mark,users_search,usergroups_list,usergroups_me,usergroups_create,usergroups_update,usergroups_users_update,reactions_add,reactions_remove,conversations_add_message"],
  "enabled": true,
  "environment": {
    "SLACK_MCP_XOXB_TOKEN": "{env:SLACK_MCP_XOXB_TOKEN}",
    "SLACK_MCP_ADD_MESSAGE_TOOL": "true",
    "SLACK_MCP_MARK_TOOL": "true",
    "SLACK_MCP_LOG_LEVEL": "info"
  }
}
```

**Permissions** (same file):
```jsonc
"slack-<agent>_*": "allow"
```

**Environment** (`~/.zshrc`):
```bash
export SLACK_MCP_XOXB_TOKEN="xoxb-..."
```

---

## Step 5: Create OpenCode Agent Definition

Create `<project>/.opencode/agent/<name>.md`:

```markdown
---
description: <Name> — <role description>
mode: subagent
model: deepseek/deepseek-v4-pro
permission:
  read: allow
  edit: allow
  bash: ask
  webfetch: allow
  websearch: allow
---

You are <Name>, <role description>.

## Available Slack Tools (via MCP)
You have access to `slack-<agent>_*` tools:
- `slack-<agent>_channels_list`
- `slack-<agent>_conversations_history`
- `slack-<agent>_conversations_replies`
- `slack-<agent>_conversations_search_messages`
- `slack-<agent>_users_search`
- `slack-<agent>_usergroups_list`
- `slack-<agent>_conversations_unreads`
- `slack-<agent>_conversations_mark`
```

Restart OpenCode after MCP config changes.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Agent doesn't respond | Listener not running | `launchctl list \| grep <agent>` |
| Agent gives generic reply | LLM key missing/expired | Check `ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY` in plist and credits |
| `app_mention` events missing | Event subscription not enabled | Apply manifest in Slack dashboard |
| `missing_scope` errors | Bot scopes incomplete | Apply manifest with all scopes |
| "Fallback reply (no LLM)" | LLM API call failed | Check `error.log`, verify API key has credits |
| Port 22 timeout (VPS) | Server off or firewalled | Check cloud console, verify firewall rules |
| Duplicate connections | Old listener still running | `launchctl unload` first, then `launchctl load` |

---

## Casey Live Reference

| Key | Value |
|-----|-------|
| Agent | Casey |
| Slack App | A0BDNNVFFDG |
| Bot ID | B0BDNP5F1H8 |
| Bot User | U0BD79D3ZHD |
| Workspace | MetroPrints (T0BD9B6L8V6) |
| LLM | DeepSeek (deepseek-chat) |
| Listener Path | `~/Projects/metroprints/agents/casey/listener.mjs` |
| Plist | `~/Library/LaunchAgents/com.metroprints.casey.listener.plist` |
| MCP Server | `slack-metroprints` |
| Agent Def | `~/Projects/metroprints/.opencode/agent/casey.md` |

---

## Checklist: New Agent

- [ ] Slack app created
- [ ] Manifest applied (scopes + events + Socket Mode)
- [ ] Bot installed to workspace, tokens saved
- [ ] `listener.mjs` created with LLM + system prompt
- [ ] launchd plist created and loaded
- [ ] API key set in plist `EnvironmentVariables` (with credits!)
- [ ] MCP server block added to `opencode.jsonc`
- [ ] MCP permissions added
- [ ] `SLACK_MCP_XOXB_TOKEN` exported in `.zshrc`
- [ ] OpenCode agent `.md` created
- [ ] OpenCode restarted
- [ ] `@Agent` tested in Slack
