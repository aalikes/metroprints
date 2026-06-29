# Agent Template: Slack Bot on OpenCode

Casey's full working configuration — use as blueprint for future agents.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      OpenCode                           │
│  ┌──────────────┐   ┌──────────────────────────────┐   │
│  │ agent/*.md   │   │ MCP server (slack-<agent>)    │   │
│  │ (subagent)   │   │ → slack-mcp-server stdio      │   │
│  └──────────────┘   │ → xoxb bot token              │   │
│                     │ → tools: channels_list, etc.  │   │
│                     └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌──────────────────┐                 ┌──────────────────┐
│  OpenCode MCP    │                 │  Socket Mode     │
│  HTTP API calls  │                 │  Listener        │
│  (on-demand)     │                 │  (persistent)    │
│                  │                 │                  │
│  Read channels   │                 │  @mentions       │
│  Post messages   │                 │  DM events       │
│  Manage groups   │                 │  app_mention     │
│  Search workspace│                 │  Real-time       │
└──────────────────┘                 └──────────────────┘
        │                                       │
        │         xoxb bot token                │  xapp token
        ▼                                       ▼
┌─────────────────────────────────────────────────────────┐
│                    Slack Workspace                      │
└─────────────────────────────────────────────────────────┘
```

## Files Template

### 1. Agent Definition
**Path:** `~/.opencode/agent/<name>.md` or `<project>/.opencode/agent/<name>.md`

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

## Your Role
<detailed role description>

## Available Slack Tools (via MCP)
You have access to `slack-<agent>_*` tools:
- `slack-<agent>_channels_list` — List all channels
- `slack-<agent>_conversations_history` — Read messages
- `slack-<agent>_conversations_replies` — Read thread replies
- `slack-<agent>_conversations_search_messages` — Search messages
- `slack-<agent>_users_search` — Find users
- `slack-<agent>_usergroups_list` — List user groups
- `slack-<agent>_conversations_unreads` — Get unread messages
- `slack-<agent>_conversations_mark` — Mark as read
```

### 2. Socket Mode Listener
**Path:** `<project>/agents/<name>/listener.mjs`

Zero-dependency Node.js listener using native `WebSocket` (Node 22+).

```javascript
import { randomUUID } from "node:crypto";

const XAPP = "<xapp-token>";
const XOXB = "<xoxb-token>";
const SLACK_API = "https://slack.com/api";
const BOT_USER_ID = "<bot-user-id>";

async function slack(method, body, token = XOXB) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getWebSocketUrl() {
  const res = await slack("apps.connections.open", {}, XAPP);
  if (!res.ok) throw new Error(`apps.connections.open failed: ${res.error}`);
  return res.url;
}

function isMentioned(text) {
  return text.includes(`<@${BOT_USER_ID}>`);
}

function cleanText(text) {
  return text.replace(new RegExp(`<@${BOT_USER_ID}>\\s*`, "g"), "").trim();
}

// 30-minute thread window: once the agent replies in a thread,
// all subsequent messages in that thread get a response — no @mention needed
const activeThreads = new Map();
function trackThread(threadTs) {
  if (!threadTs) return;
  activeThreads.set(threadTs, Date.now());
  setTimeout(() => {
    const last = activeThreads.get(threadTs);
    if (last && Date.now() - last >= 30 * 60 * 1000) activeThreads.delete(threadTs);
  }, 30 * 60 * 1000);
}
function isActiveThread(event) {
  const threadTs = event.thread_ts || event.ts;
  if (activeThreads.has(threadTs)) {
    activeThreads.set(threadTs, Date.now());
    return true;
  }
  return false;
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

        // Respond to any message in a thread the agent is already in (30-min window, no @mention needed)
        if (evt.type === "message" && isActiveThread(evt) && text.trim()) {
          await handle(evt.channel, evt.user, cleanText(text), evt.ts);
          return;
        }

        // Handle app_mention (when subscribed on Slack dashboard)
        if (evt.type === "app_mention") {
          await handle(evt.channel, evt.user, text, evt.ts);
          return;
        }

        // Handle regular message with @mention (fallback, always works)
        if (evt.type === "message" && isMentioned(text)) {
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

async function handle(channel, user, text, thread) {
  // ⬇️ CUSTOMIZE: Your agent's response logic
  try {
    let userName = "there";
    try {
      const u = await slack("users.info", { user });
      if (u.ok && u.user?.real_name) userName = u.user.real_name.split(" ")[0];
    } catch {}

    const reply = `Hey ${userName}! I'm <your-agent-description>. How can I help?`;

    await slack("chat.postMessage", {
      channel,
      text: reply,
      thread_ts: thread,
    });
    trackThread(thread);
  } catch (e) {
    console.error("[agent] handle error:", e.message);
  }
}

console.log("[agent] Starting Socket Mode listener...");
connect();
```

### 3. launchd Plist (macOS persistence)
**Path:** `~/Library/LaunchAgents/com.<project>.<agent>.listener.plist`

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
		<string>/Users/shahsaint-cyr/Projects/<project>/agents/<name>/listener.mjs</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>WorkingDirectory</key>
	<string>/Users/shahsaint-cyr/Projects/<project>/agents/<name></string>
	<key>StandardOutPath</key>
	<string>/Users/shahsaint-cyr/Library/Logs/com.<project>.<agent>.listener.log</string>
	<key>StandardErrorPath</key>
	<string>/Users/shahsaint-cyr/Library/Logs/com.<project>.<agent>.listener.error.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.<project>.<agent>.listener.plist
```

### 4. MCP Server Config (opencode.jsonc)
**Path:** `~/.config/opencode/opencode.jsonc` → `mcp` section

```jsonc
// Slack — <agent name> bot token auth
"slack-<agent>": {
  "type": "local",
  "command": ["slack-mcp-server", "-t", "stdio", "-enabled-tools", "channels_list,conversations_history,conversations_search_messages,conversations_replies,conversations_unreads,conversations_mark,users_search,usergroups_list,usergroups_me,usergroups_create,usergroups_update,usergroups_users_update,reactions_add,reactions_remove,conversations_add_message"],
  "enabled": true,
  "environment": {
    "SLACK_MCP_XOXB_TOKEN": "{env:SLACK_MCP_XOXB_TOKEN}",
    "SLACK_MCP_ADD_MESSAGE_TOOL": "true",
    "SLACK_MCP_MARK_TOOL": "true",
    "SLACK_MCP_LOG_LEVEL": "info"
  }
}
```

Permissions (same file):
```jsonc
"slack-<agent>_*": "allow"
```

### 5. Environment Variables (.zshrc)
```bash
export SLACK_MCP_XOXB_TOKEN="xoxb-..."
```

For multiple agents sharing one Slack workspace, they can share the same `SLACK_MCP_XOXB_TOKEN`.

## Slack App Checklist

When creating a new Slack bot for an agent:

| Step | Where | Detail |
|------|-------|--------|
| 1 | api.slack.com/apps → New App | Create from manifest or scratch — one app per agent |
| 2 | OAuth & Permissions → Bot Token Scopes | **Required**: `channels:read`, `channels:history`, `groups:read`, `groups:history`, `users:read`, `chat:write`, `commands`, `app_mentions:read`, `im:history`, `im:read`, `im:write`, `files:read`, `reactions:read`, `usergroups:read` |
| 3 | OAuth & Permissions → Optional Scopes | **Optional** (mark as `bot_optional`): `channels:manage`, `channels:join`, `groups:write`, `files:write`, `reactions:write`, `assistant:write` — only grant if agent actually needs them |
| 4 | Install to Workspace | Get xoxb token — never share across agents |
| 5 | Basic Information → App-Level Tokens | Generate xapp token with `connections:write` scope |
| 6 | Socket Mode | Enable (uses xapp token) — no public URL needed |
| 7 | Event Subscriptions | Subscribe to `app_mention`, `message.im`, `message.channels`, `message.groups`, `app_home_opened` |
| 8 | Security hardening | Add input sanitization, PII redaction, rate limiting, and DM-vs-channel guards to listener.mjs |
| 9 | Quarterly audit | Every 3 months: grep listener logs for `slack.com/api/` calls, remove unused scopes from manifest |

### Scope Audit Command

```bash
# Run quarterly — lists API methods the agent actually uses
rg -oP 'slack\.com/api/\K\w+\.\w+' ~/Library/Logs/com.<project>.<agent>.listener.log \
  | sort | uniq -c | sort -rn
```

### Scope Principle

**Start minimal, add only what the agent demonstrably needs.** If an agent can function without a scope, it belongs in `bot_optional`. Over-scoping gets flagged by Slack's review process and ~80% of users prefer apps with fewer permissions. Revisit scopes quarterly.

## Running Agent Commands

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

## Casey's Live Config (reference)

| Key | Value |
|-----|-------|
| Agent name | Casey |
| Slack app | `A0BDNNVFFDG` |
| Bot user ID | `U0BD79D3ZHD` |
| Bot ID | `B0BDNP5F1H8` |
| Workspace | MetroPrints (`T0BD9B6L8V6`) |
| MCP server | `slack-metroprints` |
| Listener | `~/Projects/metroprints/agents/casey/listener.mjs` |
| Plist | `~/Library/LaunchAgents/com.metroprints.casey.listener.plist` |
| Tokens | xoxb + xapp, exported in `.zshrc` + `.env` |
