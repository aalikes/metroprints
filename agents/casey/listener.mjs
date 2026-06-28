import { randomUUID } from "node:crypto";

const XAPP = process.env.SLACK_XAPP_TOKEN || "";
const XOXB = process.env.SLACK_XOXB_TOKEN || "";
const SLACK_API = "https://slack.com/api";
const BOT_USER_ID = process.env.SLACK_BOT_USER_ID || "";

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
  // app_mention strips the bot ID, but message events keep the <@U...> format
  if (text.includes(`<@${BOT_USER_ID}>`)) return true;
  return false;
}

function cleanText(text) {
  return text.replace(new RegExp(`<@${BOT_USER_ID}>\\s*`, "g"), "").trim();
}

async function connect() {
  const url = await getWebSocketUrl();
  console.log(`[casey] Connecting to Slack Socket Mode...`);
  const ws = new WebSocket(url);
  let pingInterval;

  ws.onopen = () => {
    console.log("[casey] Connected. Listening.");
    pingInterval = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 30000);
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "hello") {
        console.log(`[casey] Hello, connections: ${msg.num_connections}`);
        return;
      }

      if (msg.type === "disconnect") {
        console.log(`[casey] Disconnect: ${msg.reason}. Reconnecting...`);
        clearInterval(pingInterval);
        ws.close();
        setTimeout(connect, 1000);
        return;
      }

      if (msg.type === "events_api" && msg.payload?.event) {
        const evt = msg.payload.event;

        // Ack within 3 seconds
        ws.send(JSON.stringify({ envelope_id: msg.envelope_id, type: "ack" }));

        // Skip own messages and bot messages
        if (evt.user === BOT_USER_ID) return;
        if (evt.subtype === "message_changed" || evt.subtype === "message_deleted") return;

        const text = evt.text || "";

        // Handle app_mention event (when subscribed)
        if (evt.type === "app_mention") {
          console.log(`[casey] MENTION (app_mention): ${evt.channel} user=${evt.user} text="${text.substring(0, 80)}"`);
          await handle(evt.channel, evt.user, text, evt.ts);
          return;
        }

        // Handle message event with @Casey mention (fallback)
        if (evt.type === "message" && isMentioned(text)) {
          console.log(`[casey] MENTION (message): ${evt.channel} user=${evt.user} text="${text.substring(0, 80)}"`);
          await handle(evt.channel, evt.user, cleanText(text), evt.ts);
          return;
        }

        // Log other events for debugging
        const subtype = evt.subtype || "";
        console.log(`[casey] ${evt.type}${subtype ? "/" + subtype : ""} channel=${evt.channel} user=${evt.user}`);
      }
    } catch (e) {
      console.error("[casey] Error:", e.message);
    }
  };

  ws.onerror = (err) => console.error("[casey] WS error:", err.message || err);
  
  ws.onclose = (event) => {
    console.log(`[casey] Closed (${event.code}). Reconnect in 5s...`);
    clearInterval(pingInterval);
    setTimeout(connect, 5000);
  };
}

// ── LLM ──────────────────────────────────────────────

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

const SYSTEM_PROMPT = `You are Casey, the MetroPrints Slack workspace administrator.

## Identity
- MetroPrints is a mobile live scan fingerprinting and apostille services business in South Florida.
- Website: https://metroprints.co
- You manage and audit the MetroPrints Slack workspace: channels, user groups, members, webhooks, and alert infrastructure.
- You respond concisely and helpfully. Be direct. No fluff.

## Workspace Knowledge
- #metroprints-critical (private): P0/P1 alerts — members: Shah (owner)
- #metroprints-alerts (private): P2/P3 alerts and status updates — entire MetroPrints team
- #all-metroprints (public): General announcements channel
- #social (public): Team fun/random
- #new-channel (public): Project channel
- The workspace has 6 users including Shah Saint-Cyr (owner/admin), bots Casey, Metro, and casey-x.

## Capabilities
- Audit channels, user groups, and member lists
- Manage channels (create, archive, set topics/purposes)
- Search messages and threads
- Monitor and post alerts
- Answer questions about the workspace structure

## Response Style
- Be conversational but professional
- If asked about workspace state, describe what you know
- If asked to do something you can't, explain why and offer alternatives
- Always be helpful and direct`;

async function think(messages) {
  if (!DEEPSEEK_KEY) return null;
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });
    const j = await res.json();
    if (j.error) { console.error("[casey] LLM error:", JSON.stringify(j.error)); return null; }
    return j.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error("[casey] LLM error:", e.message);
    return null;
  }
}

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
        text = text.replace(/<@U0BD79D3ZHD>/g, "@Casey");
        text = text.replace(/<@U0BDF2P4SHL>/g, "@Metro");
        text = text.replace(/<@U0BDN98CLAW>/g, "@casey-x");
        text = text.replace(/<@U0BBZJ7KASK>/g, "@Shah");
        text = text.replace(/<@U0BCBLPAJG5>/g, "@Shah");
        text = text.replace(/<!channel>/g, "@channel");
        text = text.replace(/<([^>|]+)\|[^>]+>/g, "$1");
        text = text.replace(/<([^>]+)>/g, "$1");
        const role = m.user === BOT_USER_ID ? "assistant" : "user";
        return { role, content: text };
      });
  } catch {
    return [];
  }
}

// ── Handle ───────────────────────────────────────────

async function handle(channel, user, text, thread) {
  try {
    let userName = "there";
    try {
      const u = await slack("users.info", { user });
      if (u.ok && u.user?.real_name) userName = u.user.real_name;
    } catch {}

    console.log(`[casey] Handling "${text.substring(0, 60)}" from ${userName}`);

    // Build conversation context
    const history = await fetchContext(channel, thread);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(0, -1).slice(-10), // last 10 messages before current
      { role: "user", content: `[${userName}]: ${text}` },
    ];

    let reply;
    const llmReply = await think(messages);
    if (llmReply) {
      reply = llmReply;
      console.log(`[casey] LLM reply for ${userName}`);
    } else {
      // Fallback if LLM unavailable
      reply = `Hey ${userName.split(" ")[0]}! I'm Casey, the MetroPrints workspace admin. I can help with workspace audits, alerts, channels, and service checks. What do you need?`;
      console.log(`[casey] Fallback reply (no LLM)`);
    }

    await slack("chat.postMessage", {
      channel,
      text: reply,
      thread_ts: thread,
    });
    console.log(`[casey] Replied in ${channel}`);
  } catch (e) {
    console.error("[casey] handle error:", e.message);
    try {
      await slack("chat.postMessage", {
        channel,
        text: "Sorry, something went wrong. Try again?",
        thread_ts: thread,
      });
    } catch {}
  }
}

console.log("[casey] Starting Casey Socket Mode listener...");
connect();
