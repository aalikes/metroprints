// Shared utilities for Hermes agent cron jobs
// Runs on VPS (openclaw-helsinki-1) — env vars injected by systemd or crontab
// For local macOS: reads from launchd plist

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnv(agentName) {
  // On VPS: env vars are injected by systemd/crontab
  // On macOS: read from launchd plist as fallback
  const env = {
    SLACK_XOXB_TOKEN: process.env.SLACK_XOXB_TOKEN || "",
    NOTION_API_KEY: process.env.NOTION_API_KEY || "",
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
  };

  // If env vars are already set (VPS), use them
  if (env.SLACK_XOXB_TOKEN && env.NOTION_API_KEY) return env;

  // Fallback: try launchd plist (macOS)
  const HOME = process.env.HOME || "/Users/shahsaint-cyr";
  const plistPath = join(HOME, "Library", "LaunchAgents", `com.metroprints.${agentName}.listener.plist`);
  if (!existsSync(plistPath)) return env;

  try {
    const plist = readFileSync(plistPath, "utf-8");
    const keyMatch = (key) => {
      const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`, "s");
      const m = plist.match(regex);
      return m ? m[1].trim() : null;
    };

    env.SLACK_XOXB_TOKEN = keyMatch("SLACK_XOXB_TOKEN") || env.SLACK_XOXB_TOKEN;
    env.NOTION_API_KEY = keyMatch("NOTION_API_KEY") || env.NOTION_API_KEY;
    env.DEEPSEEK_API_KEY = keyMatch("DEEPSEEK_API_KEY") || env.DEEPSEEK_API_KEY;
  } catch (e) {
    console.error(`Failed to read plist for ${agentName}:`, e.message);
  }

  return env;
}

export async function slackPost(channel, text, agentName) {
  const env = loadEnv(agentName);
  if (!env.SLACK_XOXB_TOKEN) {
    console.error(`No SLACK_XOXB_TOKEN found for ${agentName}`);
    return null;
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SLACK_XOXB_TOKEN}`,
    },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`Slack post failed: ${data.error}`);
    return null;
  }
  return data;
}

export async function llmThink(systemPrompt, userPrompt, agentName) {
  const env = loadEnv(agentName);
  if (!env.DEEPSEEK_API_KEY) {
    console.error(`No DEEPSEEK_API_KEY found for ${agentName}`);
    return null;
  }

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error("LLM error:", JSON.stringify(data.error));
    return null;
  }
  return data.choices?.[0]?.message?.content || null;
}

export async function notionQuery(databaseId, agentName) {
  const env = loadEnv(agentName);
  if (!env.NOTION_API_KEY) {
    console.error(`No NOTION_API_KEY found for ${agentName}`);
    return null;
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({ page_size: 50 }),
  });

  const data = await res.json();
  if (data.object === "error") {
    console.error("Notion error:", data.message);
    return null;
  }
  return data.results || [];
}

export function formatET() {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toET(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
}
