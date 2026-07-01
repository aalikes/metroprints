import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const XAPP = process.env.SLACK_XAPP_TOKEN;
const XOXB = process.env.SLACK_XOXB_TOKEN;
const SLACK_API = "https://slack.com/api";
const BOT_USER_ID = "U0BDVLQNWCC";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = "2022-06-28";
const MP_WEBSITE = process.env.METROPRINTS_WEBSITE || "https://metroprints.co";

const OBSIDIAN_VAULT = "/Users/shahsaint-cyr/Library/Mobile Documents/iCloud~md~obsidian/Documents/Skills";
const KNOWLEDGE_FILES = [
  "Skills/Metroprints/agents/Penny.md",
  "Skills/Metroprints/agents/Hermes Agent Architecture.md",
  "Skills/Metroprints/playbooks/hermes-agent-sop.md",
];

const NOTION_DBS = {
  activities: "27189d07-dc61-8122-acde-f2cffd",
  planning: "27189d07-dc61-8168-9182-ef0386dbd9e7",
  ori: "731bd0e1-0c8f-4db5-8fc5-4086e9cba134",
  projects: "27189d07-dc61-8140-abb6-d35934cf48a7",
  marketplace: "9bd3910c-6dc2-4bb7-81be-8af80b2a3e74",
  finance: "e3f5a9cf-2e0e-4c7d-90b1-8672c61b20e7",
  transactions: "36389d07-dc61-8160-8a02-e9f966e9a39d",
  budgets: "36389d07-dc61-816a-af99-eb57bd0b7d9f",
};

let loadedKnowledge = "";

function loadKnowledge() {
  let combined = "";
  for (const rel of KNOWLEDGE_FILES) {
    try {
      const full = `${OBSIDIAN_VAULT}/${rel}`;
      combined += `\n\n--- ${rel} ---\n${readFileSync(full, "utf-8")}`;
    } catch (e) {
      console.error(`[penny] Could not load knowledge file ${rel}: ${e.message}`);
    }
  }
  loadedKnowledge = combined;
  return loadedKnowledge;
}

loadKnowledge();

function buildSystemPrompt() {
  return BASE_SYSTEM_PROMPT.replace("__KNOWLEDGE__", loadedKnowledge || "(no knowledge loaded — run /penny-learn to refresh)");
}

const BASE_SYSTEM_PROMPT = `You are Penny, MetroPrints' finance oversight agent.

## Your Role
You audit the finance data that Make automations produce. You do NOT do raw transaction logging — that work belongs to Make scenarios (FBI Fee Logger, Fuel Tracker, USPS Logger, Square/Stripe Logger, all retired as agents, increasingly consolidated into a single Unified Expense Email Logger Make scenario). Your job is judgment: oversight, anomaly detection, exception review.

## What you do
- Audit Make-created finance entries for completeness and accuracy
- Flag missing categories on logged transactions
- Flag duplicate-looking transactions
- Check whether the Finance Tracker has gone 7+ days without an update
- Summarize revenue / expense health on request
- Flag unusual expenses or revenue drops
- Review dedup registry failures
- Access the web: fetch and read URLs for tax/IRS updates, Square/Stripe fee changes, compliance research. Use /penny-web [url] to fetch a page.

## What you explicitly do NOT do
- You do not log new transactions yourself — that's Make's job now. If asked to log a fuel purchase, Square sale, or USPS fee, say so and point to Make.
- You do not treat the old FBI Fee Logger, Fuel Tracker, or USPS Logger as your job. They're retired as agents.

## Cadence
- Weekly finance QA pass
- Saturday revenue/anomaly pass, coordinated with Metro (Metro = ops-level anomaly flagging, you = transaction-level audit for the same period)

## Coordination
- Metro: joint Saturday pass
- Casey: a case reaching a billable state is a signal you watch for, but Make logs the actual transaction

## Style
Direct, numbers-first, honest about data gaps. If the Finance Tracker / Notion data isn't wired into a specific ask yet, say so plainly instead of fabricating figures. Keep replies tight.
- **When talking to another agent:** Recognize it's an agent, not Shah. Be brief and functional. Don't echo, debate, or loop. Coordinate efficiently and stop.

__KNOWLEDGE__`;

async function slack(method, body, token = XOXB) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

const activeThreads = new Map();
const threadCooldowns = new Map(); // thread_ts → last response timestamp
const KNOWN_BOTS = new Set(["U0BD79D3ZHD","U0BDF2P4SHL","U0BDVLQNWCC"]);
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

const recentEvents = new Set();
function isDuplicate(evt) {
  const key = `${evt.channel}:${evt.user}:${evt.ts}`;
  if (recentEvents.has(key)) return true;
  recentEvents.add(key);
  setTimeout(() => recentEvents.delete(key), 5000);
  return false;
}

async function checkWebsite() {
  try {
    const start = Date.now();
    const res = await fetch(MP_WEBSITE, { method: "HEAD" });
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Web Access ────────────────────────────────────────

async function webFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MetroPrints-Penny/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const contentType = res.headers.get("content-type") || "";
    const isHtml = contentType.includes("html");
    const raw = await res.text();
    const text = isHtml ? raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 4000) : raw.substring(0, 4000);
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      contentType,
      text,
      truncated: raw.length > 4000,
    };
  } catch (e) {
    return { ok: false, error: e.message, url };
  }
}

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

async function foldContext(messages) {
  const total = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (total <= 15000) return messages;
  const cut = Math.floor(messages.length * 0.6);
  const old = messages.slice(0, cut);
  const recent = messages.slice(cut);
  const summaryText = old.map((m) => `${m.role}: ${m.content}`).join("\n");
  const summary = await think([
    { role: "system", content: "Summarize this conversation in 2-3 sentences. Preserve: names, case details, decisions, action items." },
    { role: "user", content: summaryText },
  ]);
  return [{ role: "system", content: `[Earlier conversation summary] ${summary}` }, ...recent];
}

async function think(messages) {
  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", messages, temperature: 0.7, max_tokens: 1000 }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content?.trim() || "I wasn't able to generate a response.";
  } catch (e) {
    console.error("[penny] DeepSeek error:", e.message);
    return `I hit an error talking to my reasoning backend: ${e.message}`;
  }
}

async function fetchThreadHistory(channel, threadTs) {
  try {
    const res = await slack("conversations.replies", { channel, ts: threadTs, limit: 20 });
    if (!res.ok) return [];
    return res.messages.map((m) => ({
      role: m.user === BOT_USER_ID ? "assistant" : "user",
      content: m.text || "",
    }));
  } catch {
    return [];
  }
}

async function showHelp(channel, thread) {
  const text = [
    "*Penny — finance oversight*",
    "`/penny <question>` — ask me anything finance-related",
    "`/penny-revenue` — revenue / expense health summary",
    "`/penny-qa` — run a finance QA pass (missing categories, duplicates, stale tracker, anomalies)",
    "`/penny web <url>` — fetch and summarize any web page",
    "`/penny-help` — this menu",
    "`/penny-learn` — reload my knowledge files",
    "`/penny-help` — this message",
    "`/penny-learn` — reload my Obsidian knowledge files",
    "",
    "Or just @mention me / reply in a thread I'm active in.",
  ].join("\n");
  await slack("chat.postMessage", { channel, text, thread_ts: thread });
}

async function handleCommand(command, channel, user, text, responseUrl) {
  if (responseUrl) {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text: "One moment..." }),
    }).catch(() => {});
  }

  let reply;
  switch (command) {
    case "/penny-help":
      reply = [
        "*Penny — finance oversight*",
        "`/penny <question>` — ask me anything finance-related",
        "`/penny-revenue` — revenue / expense health summary",
        "`/penny-qa` — run a finance QA pass",
        "`/penny-learn` — reload my knowledge files",
      ].join("\n");
      break;
    case "/penny-learn":
      reply = "Reloading my knowledge files from Obsidian... (restart the listener to pick up edits — hot-reload isn't wired up yet, but I'll note this for the next deploy.)";
      break;
    case "/penny-web":
      if (!text) { reply = "Usage: `/penny-web <url>` — fetch and summarize a web page. Use for tax info, compliance updates, expense research."; break; }
      const webUrl = text.trim();
      if (!/^https?:\/\//.test(webUrl)) { reply = "Please provide a full URL starting with http:// or https://"; break; }
      reply = "Fetching...";
      await fetch(responseUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Fetching ${webUrl}...`, replace_original: true }) });
      const webResult = await webFetch(webUrl);
      reply = webResult.ok
        ? `*Penny Web Fetch*\n\n${webUrl}\n_Status: ${webResult.status} | ${webResult.contentType}_\n\n${webResult.text}${webResult.truncated ? "\n\n_(content truncated at 4000 chars)_" : ""}`
        : `*Penny Web Fetch*\n\n${webUrl}\n❌ Error: ${webResult.error}`;
      break;
    case "/penny-revenue": {
      const web = await checkWebsite();
      reply = [
        "*Revenue / expense health* — currently a lightweight pass, not yet wired to the live Finance Tracker database.",
        `MetroPrints site check: ${web.ok ? `up (${web.latencyMs}ms)` : `issue — ${web.error || web.status}`}`,
        "For full revenue figures I need the Finance Tracker Notion database ID wired into my NOTION_DBS config — flag that to Shah if you need real numbers right now. In the meantime, Saturday's joint pass with Metro is the place to look for the latest anomaly read.",
      ].join("\n");
      break;
    }
    case "/penny-qa":
      reply = [
        "*Finance QA pass* — checklist mode (live Notion audit not yet wired in):",
        "• Missing categories on recent entries — needs Finance Tracker DB connection",
        "• Duplicate-looking transactions — needs Finance Tracker DB connection",
        "• Finance Tracker staleness (7+ day check) — needs Finance Tracker DB connection",
        "• Dedup registry failures — needs dedup registry DB connection",
        "",
        "I can reason about any of this the moment those DB IDs are added to my config. Until then, ask me directly and I'll do my best from context.",
      ].join("\n");
      break;
      case "/penny-fetch":
        finalText = await fetchUrl(text || "https://");
        break;

    default:
      reply = await think([{ role: "system", content: buildSystemPrompt() }, { role: "user", content: text || "Hi" }]);
  }

  if (responseUrl) {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "in_channel", text: reply }),
    }).catch(() => {});
  } else {
    await slack("chat.postMessage", { channel, text: reply });
  }
}

async function handle(channel, user, text, threadTs, isBot = false) {
  try {
    const thread = threadTs || undefined;
    const history = thread ? await fetchThreadHistory(channel, thread) : [];

    let messages = [{ role: "system", content: buildSystemPrompt() }, ...history, { role: "user", content: isBot ? `[Another MetroPrints agent]: ${text}\n\n(You're talking to another agent. Be concise. Only respond if substantive.)` : text }];
    messages = await foldContext(messages);
    const reply = await think(messages);
    await slack("chat.postMessage", { channel, text: reply, thread_ts: thread });
    trackThread(thread || channel);
  } catch (e) {
    console.error("[penny] handle error:", e.message);
  }
}


async function fetchUrl(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "HermesAgent/1.0" }, signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    return text.substring(0, 6000);
  } catch (e) {
    return `Fetch error: ${e.message}`;
  }
}

async function connect() {
  const url = await getWebSocketUrl();
  console.log("[penny] Connecting to Slack Socket Mode...");
  const ws = new WebSocket(url);
  let pingInterval;

  ws.onopen = () => {
    console.log("[penny] Connected. Listening.");
    pingInterval = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 30000);
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "hello") {
        console.log(`[penny] Hello, connections: ${msg.num_connections}`);
        return;
      }

      if (msg.type === "disconnect") {
        console.log(`[penny] Disconnect: ${msg.reason}. Reconnecting...`);
        clearInterval(pingInterval);
        ws.close();
        setTimeout(connect, 1000);
        return;
      }

      if (msg.type === "slash_commands" && msg.payload) {
        ws.send(JSON.stringify({ envelope_id: msg.envelope_id, type: "ack" }));
        const p = msg.payload;
        await handleCommand(p.command, p.channel_id, p.user_id, p.text, p.response_url);
        return;
      }

      if (msg.type === "events_api" && msg.payload?.event) {
        const evt = msg.payload.event;
        ws.send(JSON.stringify({ envelope_id: msg.envelope_id, type: "ack" }));

        if (evt.user === BOT_USER_ID) return;
        if (evt.subtype === "message_changed" || evt.subtype === "message_deleted") return;
        if (isDuplicate(evt)) return;

        const text = evt.text || "";

        if (evt.type === "message" && isActiveThread(evt) && text.trim()) {
          const threadKey = evt.thread_ts || evt.ts;
          const last = threadCooldowns.get(threadKey) || 0;
          if (Date.now() - last < 30000) return; // 30s cooldown
          const isBot = KNOWN_BOTS.has(evt.user);
          console.log(`[penny] THREAD: ${evt.channel} thread_ts=${threadKey} user=${evt.user}${isBot ? " [BOT]" : ""}`);
          threadCooldowns.set(threadKey, Date.now());
          await handle(evt.channel, evt.user, cleanText(text), evt.thread_ts || evt.ts, isBot);
          return;
        }
        // Handle DMs — respond to any message (no @mention needed)
        if (evt.type === "message" && evt.channel.startsWith("D") && text.trim()) {
          if (isDuplicate(evt)) return;
          console.log(`[penny] DM: ${evt.channel} user=${evt.user}`);
          await handle(evt.channel, evt.user, cleanText(text), evt.thread_ts || evt.ts);
          return;
        }

        if (evt.type === "app_mention") {
          await handle(evt.channel, evt.user, cleanText(text), evt.thread_ts || evt.ts);
          return;
        }
        if (evt.type === "message" && isMentioned(text)) {
          await handle(evt.channel, evt.user, cleanText(text), evt.thread_ts || evt.ts);
          return;
        }
      }
    } catch (e) {
      console.error("[penny] Error:", e.message);
    }
  };

  ws.onerror = (err) => console.error("[penny] WS error:", err.message || err);

  ws.onclose = (event) => {
    console.log(`[penny] Closed (${event.code}). Reconnect in 5s...`);
    clearInterval(pingInterval);
    setTimeout(connect, 5000);
  };
}

console.log("[penny] Starting Socket Mode listener...");
connect();
