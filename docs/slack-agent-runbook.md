# Multi-Agent Slack Deployment: Solutions & Runbook

## 1. Config Token Rotation (xoxe.xoxp-1, expires 12h)

### Problem
`apps.manifest.update` requires App Configuration Tokens (`xoxe.xoxp-1`) that expire every 12 hours.

### Solution: Automated Rotation Script

Drop this as `~/rotate-slack-tokens.sh` and add to crontab:

```bash
#!/usr/bin/env bash
set -euo pipefail

CONFIG="$HOME/.slack-tokens.json"

# Read stored refresh token
refresh_token=$(jq -r '.refresh_token' "$CONFIG")

# Rotate via Slack API
response=$(curl -sS --request POST 'https://slack.com/api/tooling.tokens.rotate' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "refresh_token=$refresh_token")

if ! echo "$response" | jq -e '.ok' > /dev/null; then
  echo "FATAL: token rotation failed: $(echo "$response" | jq -r '.error')"
  exit 1
fi

# Write new tokens + exp
echo "$response" | jq '{token, refresh_token, exp}' > "$CONFIG"

# Apply updated manifest to all 5 bots
for app_id in "$@"; do
  manifest=$(curl -sS --request GET "https://slack.com/api/apps.manifest.export?app_id=$app_id" \
    -H "Authorization: Bearer $(jq -r '.token' "$CONFIG")")
  # Validate manifest has required event subscriptions
  echo "$manifest" | jq -e '.manifest.settings.event_subscriptions.bot_events | index("app_mention")' > /dev/null
  curl -sS --request POST 'https://slack.com/api/apps.manifest.update' \
    -H "Authorization: Bearer $(jq -r '.token' "$CONFIG")" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg app_id "$app_id" --arg manifest "$(echo "$manifest" | jq -c '.manifest')" \
      '{app_id: $app_id, manifest: $manifest}')"
done
```

**Crontab** (runs every 10 hours, buffer before 12h expiry):
```cron
0 */10 * * * /Users/shahsaint-cyr/rotate-slack-tokens.sh APP_ID_1 APP_ID_2 APP_ID_3 APP_ID_4 APP_ID_5
```

**First-time setup** — generate initial tokens manually:
1. Go to `https://api.slack.com/apps` → Your App → **App Manifest** tab
2. Scroll to **App Configuration Tokens** → **Generate Token**
3. Copy both the `xoxe.xoxp-...` token and the `xoxe-...` refresh token
4. Save to `~/.slack-tokens.json`:
   ```json
   { "token": "xoxe.xoxp-1-...", "refresh_token": "xoxe-1-...", "exp": 0 }
   ```

**GitOps integration** (preventive):
Add a CI step to validate the manifest before deployment:
```bash
openclaw doctor --validate-manifest slack.manifest.json
# Or via Slack API:
curl -sS --request POST 'https://slack.com/api/apps.manifest.validate' \
  -H "Authorization: Bearer $SLACK_CONFIG_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"manifest\": $(cat slack.manifest.json | jq -Rs)}"
```

---

## 2. Socket Mode Pong Timeouts (Mac host)

### Problem
Default `clientPingTimeout` of 5000ms is too aggressive. Mac host has worse latency jitter than VPS. OpenClaw health-monitor restarts socket on `stale-socket`.

### Root Causes
1. **Slack SDK default**: `clientPingTimeout: 5000` — too tight for consumer ISPs
2. **health-monitor `stale-socket`**: falsely flags quiet-but-healthy sockets as stale
3. **Mac sleep/idle**: `pmset sleep 1` + `networkoversleep 0` kills WebSocket

### Fix: Increase Ping Timeout + Disable Stale-Socket Detection

Add to `openclaw.json` (works on v2026.4.9+):

```json5
{
  channels: {
    slack: {
      socketMode: {
        clientPingTimeout: 20000,   // was 5000 (SDK default) or 15000 (OpenClaw default)
        serverPingTimeout: 30000,   // was 30000
        pingPongLoggingEnabled: false, // set true only when debugging
      },
    },
  },
}
```

This is the **primary fix** — OpenClaw v2026.4.9+ passes these through to `SocketModeReceiver`. The 15s default was added in a post-v2026.4.26 build; if on v2026.4.9, set `clientPingTimeout` explicitly.

### Fix: Disable False Stale-Socket Detection

PR #68253 (merged) opts Slack out of the generic `stale-socket` heuristic since Socket Mode SDK owns its own liveness. Update to v2026.5.x+ which includes this.

If stuck on v2026.4.x, increase the threshold:
```json5
{
  gateway: {
    channelStaleEventThresholdMinutes: 120,  // was 30
    channelMaxRestartsPerHour: 3,            // was 10
  },
}
```

### Fix: Prevent Mac Sleep Killing WebSocket

```bash
# Disable sleep entirely (server-appropriate)
sudo pmset sleep 0
sudo pmset hibernatemode 0
sudo pmset networkoversleep 1  # prioritize network over sleep

# Create persistent caffeinate launchd plist
# ~/Library/LaunchAgents/com.user.caffeinate.plist:
cat > ~/Library/LaunchAgents/com.user.caffeinate.plist <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.caffeinate</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-dimsu</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
XML
launchctl load ~/Library/LaunchAgents/com.user.caffeinate.plist
```

### Fix: Prevent Event-Loop Starvation from Killing Socket

Issue #77651: If a long model call (10+ min) starves the event loop, the Socket Mode heartbeat drops and `manuallyStopped` gets permanently poisoned. Fix available in v2026.5.12+. Until upgraded:

```bash
# Add unhandled rejection warning mitigation
export NODE_OPTIONS="--unhandled-rejections=warn"
```

---

## 3. Channel Names vs Channel IDs

### Problem
Using `#channel-name` in config silently fails. OpenClaw needs `C-prefixed` channel IDs.

### Solution: Always Use C-prefixed IDs

**Replace** this:
```json5
channels: { "#general": { allow: true, requireMention: true } }
```

**With** this:
```json5
channels: { "C0123456789": { allow: true, requireMention: true } }
```

### How to find channel IDs:

| Method | Steps |
|--------|-------|
| **Browser** | Open channel → URL shows `https://app.slack.com/client/T.../C...` |
| **Desktop** | Right-click channel → **View channel details** → ID at bottom |
| **CLI** | `openclaw slack channels list` or `curl -H "Authorization: Bearer $SLACK_BOT_TOKEN" https://slack.com/api/conversations.list \| jq '.channels[] \| {id, name}'` |

### Prevention: CI Config Validation

Add a script that validates all configured channels exist:

```bash
#!/usr/bin/env bash
# validate-channels.sh — run in CI or after config change
TOKEN="$SLACK_BOT_TOKEN"
CONFIG="$HOME/.openclaw/openclaw.json"

# Extract all channel keys from config (skip non-channel keys)
jq -r '.channels.slack.channels | keys[]' "$CONFIG" | while read -r key; do
  if [[ "$key" == C* ]]; then
    # Verify it exists
    resp=$(curl -sS -H "Authorization: Bearer $TOKEN" \
      "https://slack.com/api/conversations.info?channel=$key")
    if ! echo "$resp" | jq -e '.ok' > /dev/null; then
      echo "INVALID: channel $key — $(echo "$resp" | jq -r '.error')"
      exit 1
    fi
    echo "OK: #$(echo "$resp" | jq -r '.channel.name') ($key)"
  elif [[ "$key" == \#* ]]; then
    echo "ERROR: channel '$key' uses # prefix — must be C-prefixed ID"
    exit 1
  fi
done
```

---

## 4. Plugin Management (Externalized Slack Plugin)

### Problem
OpenClaw v2026.5.12 externalized Slack plugin. Mac (v2026.4.9) has it bundled; VPS (v2026.6.8) needs explicit install.

### Solution: Version-Aware Plugin Bootstrap

Add to your deployment script:

```bash
#!/usr/bin/env bash
# sync-plugins.sh — run after every OpenClaw upgrade
VERSION=$(openclaw --version | grep -oP '\d+\.\d+\.\d+' | head -1)
MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)

# Externalized plugins needed per version
if [[ "$MAJOR" -ge 2026 && "$MINOR" -ge 5 ]]; then
  echo "[plugin-sync] Installing externalized plugins..."
  openclaw plugins install slack
  openclaw plugins install @openclaw/slack
  openclaw doctor --fix
elif [[ "$MAJOR" -eq 2026 && "$MINOR" -eq 4 ]]; then
  echo "[plugin-sync] v2026.4.x — Slack bundled in core, no action needed"
fi

# Verify plugin loaded
openclaw plugins list | grep -q slack || {
  echo "FATAL: slack plugin not found after install"
  exit 1
}

# Fix: ensure activation.onStartup is true for cron delivery
# (bug #82360: isolated cron delivery fails with non-startup plugins)
PLUGIN_JSON=$(find /usr/local/lib/node_modules/openclaw -path '*/@openclaw/slack/openclaw.plugin.json' 2>/dev/null || \
              find /usr/lib/node_modules/openclaw -path '*/@openclaw/slack/openclaw.plugin.json' 2>/dev/null)
if [ -n "$PLUGIN_JSON" ]; then
  jq '.activation.onStartup = true' "$PLUGIN_JSON" > "${PLUGIN_JSON}.tmp" && mv "${PLUGIN_JSON}.tmp" "$PLUGIN_JSON"
fi
```

Alternatively, pin a consistent OpenClaw version across both hosts:
```bash
npm install -g openclaw@2026.5.12    # Match VPS version on Mac
```

---

## 5. Token Confusion (xoxb vs xapp-1 vs xoxe.xoxp-1)

### Quick Reference

| Token Prefix | Name | Used For | Lifespan |
|---|---|---|---|
| `xoxb-` | Bot Token | Posting messages, reading history, API calls | Permanent (until revoked) |
| `xapp-1-` | App-Level Token | Socket Mode WebSocket auth (needs `connections:write`) | Permanent (until revoked) |
| `xoxe.xoxp-1-` | App Configuration Token | `apps.manifest.update/create/delete` API | **12 hours** |
| `xoxe-1-` | Config Refresh Token | `tooling.tokens.rotate` | Rotates with each use |

### Where Each Goes in openclaw.json

```json5
{
  channels: {
    slack: {
      mode: "socket",                    // or "http"
      botToken: "xoxb-...",              // REQUIRED for both modes
      appToken: "xapp-1-...",            // REQUIRED for Socket Mode only
      signingSecret: "abc123...",        // REQUIRED for HTTP mode only
    },
  },
}
```

### Prevention: Token Prefix Validation in CI

```bash
#!/usr/bin/env bash
# validate-tokens.sh
TOKENS=$(jq -r '.channels.slack | .botToken, .appToken, .signingSecret // empty' openclaw.json)

validate_prefix() {
  local val="$1" expected_prefix="$2" name="$3"
  if [ -n "$val" ] && [ "$val" != "null" ]; then
    case "$val" in
      $expected_prefix*) ;;
      *) echo "ERROR: $name starts with ${val:0:6} — expected $expected_prefix"; exit 1 ;;
    esac
  fi
}

validate_prefix "$BOT_TOKEN" "xoxb-" "botToken"
validate_prefix "$APP_TOKEN" "xapp-" "appToken"
```

---

## 6. Architecture Decision: Move All Agents to VPS? Use HTTP Mode?

### Recommendation: **Yes — consolidate on VPS, switch to HTTP Mode**

This eliminates 3 of 5 recurring issues at the root:

| Issue | Eliminated? | Why |
|---|---|---|
| Pong timeouts | ✅ | VPS has stable low-latency network. HTTP mode has **no persistent WebSocket** |
| Mac sleep kills WS | ✅ | No Mac host. HTTP mode has no WS to drop |
| Plugin version mismatch | ✅ | Single host, single version |
| Token rotation | ☑️ | Still needed for manifests (applies regardless) |
| Channel IDs | ☑️ | Config issue, applies anywhere |

### Migration Path

#### 1. Install OpenClaw on VPS (if not already)
```bash
npm install -g openclaw@2026.6.8
openclaw plugins install slack
```

#### 2. Switch to HTTP Mode

In `openclaw.json`:
```json5
{
  channels: {
    slack: {
      enabled: true,
      mode: "http",
      botToken: "xoxb-...",
      signingSecret: "your-signing-secret",
      webhookPath: "/slack/events",
    },
  },
}
```

#### 3. Update All 5 Slack App Manifests

Each bot's manifest needs the three URLs set to your VPS public endpoint:

```json
{
  "settings": {
    "event_subscriptions": {
      "request_url": "https://your-vps.example.com/slack/events"
    },
    "interactivity": {
      "is_enabled": true,
      "request_url": "https://your-vps.example.com/slack/events",
      "message_menu_options_url": "https://your-vps.example.com/slack/events"
    }
  },
  "features": {
    "slash_commands": [
      {
        "command": "/openclaw",
        "url": "https://your-vps.example.com/slack/events"
      }
    ]
  }
}
```

For multi-account (5 bots), each needs a unique `webhookPath`:
```json5
{
  accounts: {
    bot1: { botToken: "xoxb-...", signingSecret: "...", webhookPath: "/slack/events/bot1" },
    bot2: { botToken: "xoxb-...", signingSecret: "...", webhookPath: "/slack/events/bot2" },
  },
}
```

Register each URL in its respective Slack app manifest.

#### 4. SSL Setup (Required for HTTP Mode)

```bash
# Using Caddy (recommended — auto TLS)
sudo apt install caddy
cat > /etc/caddy/Caddyfile <<'EOF'
your-vps.example.com {
    reverse_path /slack/* localhost:18789
}
EOF
sudo systemctl reload caddy
```

Or use Cloudflare Tunnel / Tailscale Funnel / nginx + certbot.

#### 5. Migrate Each Bot One at a Time
```bash
# On each bot account, switch manifest URL, update config, verify
openclaw gateway restart
openclaw status --deep
# Send test message to each bot to confirm
```

---

## 7. Monitoring: Detect "Apps Not Responding" Before User Notices

### Tier 1: Heartbeat

Enable periodic agent heartbeats to verify the agent responds:

```json5
{
  agents: {
    defaults: {
      heartbeat: {
        enabled: true,
        intervalMinutes: 15,
        activeHours: "00:00-23:59",
        prompt: "Report gateway health: check if Slack socket is connected, last event time, and any errors. Reply HEARTBEAT_OK if healthy.",
      },
    },
  },
}
```

### Tier 2: External Health Check

Cron every 5 minutes sending a DM and checking response:

```bash
#!/usr/bin/env bash
# health-check.sh — run from VPS cron every 5 minutes
BOT_TOKEN="$1"   # Bot token to test
CHANNEL="$2"     # DM channel ID (C...)

# Send a message to the bot
TS=$(curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"$CHANNEL\",\"text\":\"__healthcheck__ $(date +%s)\",\"unfurl_links\":false}" \
  | jq -r '.ts // empty')

if [ -z "$TS" ]; then
  echo "ALERT: Bot $BOT_TOKEN cannot post messages"
  exit 1
fi

# Wait for response (up to 30s), check for reaction or reply
sleep 15

# Check if bot reacted to its own message (presence of status)
REACTION=$(curl -sS https://slack.com/api/reactions.get \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -d "channel=$CHANNEL&timestamp=$TS" \
  | jq -r '.message.reactions // empty')

if [ -z "$REACTION" ]; then
  echo "ALERT: Bot $BOT_TOKEN did not react to health check within 15s"
  # Escalate: Slack webhook to ops channel
  curl -sS -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $OPS_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$OPS_CHANNEL\",\"text\":\":warning: Bot <insert name> not responding to health checks\"}"
fi
```

### Tier 3: openclaw status --deep

```bash
# Run in a monitoring loop
while true; do
  STATUS=$(openclaw status --deep 2>&1 | grep -E "(Slack|status)")
  echo "$STATUS" | grep -q "OK" || {
    # Notify
    curl -sS -X POST https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer $OPS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"channel\":\"$OPS_CHANNEL\",\"text\":\":red_circle: Gateway health check FAILED\"}"
  }
  sleep 300
done
```

### Tier 4: Log-Based Alerting

Watch for these log patterns and alert:

```bash
# Journald/grep-based alert
journalctl -u openclaw-gateway -f | while read line; do
  case "$line" in
    *"health-monitor: restarting (reason: stale-socket)"*) alert "stale-socket" ;;
    *"Failed to send a message as the client has no active connection"*) alert "no-connection" ;;
    *"A pong wasn't received"*) alert "pong-timeout" ;;
    *"token_expired"*) alert "token-expired" ;;
    *"invalid_auth"*) alert "invalid-auth" ;;
  esac
done
```

---

## 8. Runbook: Step-by-Step Diagnostic Flow

When a Slack agent stops responding, follow this flow **in order**:

```
┌─────────────────────────────────────┐
│ Agent not responding in Slack        │
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│ 1. CHECK: openclaw status --deep     │
│    Look for:                         │
│    - "Slack: connected" ✓ or ✗       │
│    - lastEventAt age                 │
│    - lastError message               │
└─────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    connected=❌           connected=✅
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│ 2. RESTART       │   │ Check lastEvent │
│ openclaw         │   │ > 5 min old?    │
│ gateway restart  │   └────────┬────────┘
└────────┬────────┘            │
         │                ┌────┴────┐
         ▼                ▼         ▼
    Still dead?      Yes, old   No, recent
         │              │           │
         ▼              ▼           ▼
┌─────────────────┐  ┌────────┐ ┌────────┐
│ 3. CHECK TOKENS │  │ Check  │ │ Agent  │
│ - Bot token     │  │Socket  │ │is alive│
│   revoked?      │  │Mode    │ │- check │
│ - App token     │  │timeout │ │heartbeat│
│   expired?      │  │config  │ │logs   │
│ - Reinstall app │  │ pings  │ └────────┘
│   in workspace  │  └────────┘
└─────────────────┘
```

### Detailed Steps

**Step 1 — Quick Health Check**
```bash
openclaw status --deep
# Check: "Slack: connected", lastError, lastEventAt
```

**Step 2 — Restart Gateway**
```bash
openclaw gateway restart
# Wait 10 seconds, re-run step 1
```

**Step 3 — If Still Dead, Check Tokens**
```bash
# Test bot token
curl -sS https://slack.com/api/auth.test \
  -H "Authorization: Bearer xoxb-..." | jq .

# Test app-level token
curl -sS https://slack.com/api/apps.connections.open \
  -H "Authorization: Bearer xapp-1-..." | jq .

# Expected: {"ok": true, "url": "wss://..."} for app token
# Expected: {"ok": true, "user_id": "U..."} for bot token

# If token expired/revoked, reinstall Slack app:
# 1. Go to api.slack.com/apps
# 2. Find the app → OAuth & Permissions → Reinstall to Workspace
# 3. Copy new xoxb- token to config
```

**Step 4 — Check Event Subscriptions**
```bash
# Export manifest and verify events
curl -sS https://slack.com/api/apps.manifest.export \
  -H "Authorization: Bearer xoxe.xoxp-1-..." \
  -d "app_id=A..." | jq '.manifest.settings.event_subscriptions.bot_events'
# Must include: app_mention, message.im, message.channels
```

**Step 5 — Check Plugin Status**
```bash
openclaw plugins list | grep slack
# If missing: openclaw plugins install slack && openclaw doctor --fix
```

**Step 6 — Check Gateway Logs**
```bash
tail -200 ~/.openclaw/logs/gateway.log | grep -E "(error|warn|fail|restart|stale|pong)"
```

**Step 7 — Atomic Recovery (nuclear option)**
```bash
# Complete stop → verify → restart
openclaw gateway stop
openclaw doctor --fix
openclaw gateway install --force
openclaw gateway start
openclaw status --deep
```

### Escalation Matrix

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `invalid_auth` | Revoked/deleted Slack app | Reinstall app in workspace |
| `token_expired` | Config token expired | Run rotate script or regenerate in UI |
| `stale-socket` restart loop | Ping timeout too low + health-monitor false positive | Increase `clientPingTimeout` to 20000, update to v2026.5.x |
| `no active connection` | WebSocket dead, auto-reconnect failing | Restart gateway, check network, update OpenClaw |
| Slack shows bot online but no response | Event subscriptions missing | Update manifest via `apps.manifest.update` |
| VPS works, Mac doesn't | Mac sleep, NAT, or event loop starvation | Move to VPS-only, or set `pmset sleep 0` + caffeinate |
| `Unsupported channel: slack` from cron | Slack plugin not loaded for isolated cron | Set `activation.onStartup: true` in plugin manifest |

---

## Summary: What to Do Right Now (Priority Order)

| # | Action | Impact | Time |
|---|--------|--------|------|
| 1 | Add `socketMode.clientPingTimeout: 20000` to config on Mac | Stops pong timeout restarts | 2 min |
| 2 | Set `channelStaleEventThresholdMinutes: 120` on both hosts | Stops false stale-socket detection | 2 min |
| 3 | Create token rotation script + crontab | Prevents manifest update failures | 15 min |
| 4 | Replace `#channel-name` with `C...` IDs everywhere | Fixes silent config failures | 5 min |
| 5 | Run `openclaw plugins install slack` on VPS + `doctor --fix` | Fixes missing plugin | 5 min |
| 6 | Enable heartbeat monitoring (`intervalMinutes: 15`) | Proactive detection | 5 min |
| 7 | **Plan**: Consolidate on VPS with HTTP mode | Eliminates 60% of recurring issues | 1-2 days |
