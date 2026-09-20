// @ts-nocheck

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });

const env = (key) => globalThis.Netlify?.env?.get(key) || process.env[key];

function compactContext(context) {
  return {
    baseCurrency: context?.baseCurrency,
    totals: context?.totals,
    stocks: (context?.stocks || []).slice(0, 80),
    fixedDeposits: context?.fixedDeposits || [],
    bankAccounts: context?.bankAccounts || [],
    expenses: (context?.expenses || []).slice(-50),
    liabilities: context?.liabilities || {},
  };
}

async function callOpenAI(payload) {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = env("OPENAI_MODEL") || "gpt-5";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
  return data;
}

function outputText(data) {
  if (data.output_text) return data.output_text;
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

async function handleChat(body) {
  const context = compactContext(body.context);
  const data = await callOpenAI({
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text:
              "You are WealthWise AI inside a personal finance app. Answer using the supplied portfolio context. Do not claim to write data. For any action that changes data, tell the user to upload/review/confirm in the app. Keep financial guidance practical and avoid guarantees.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Question: ${body.message}\n\nCurrent WealthWise data:\n${JSON.stringify(context)}`,
          },
        ],
      },
    ],
  });
  return json({ reply: outputText(data) || "I could not produce a response." });
}

async function handleExtract(body) {
  if (!body.image || !String(body.image).startsWith("data:image/")) {
    return json({ error: "Upload a valid image." }, 400);
  }
  const importType = body.importType || "auto";
  const data = await callOpenAI({
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text:
              "Extract personal finance records from screenshots for WealthWise. Return only structured records. Never invent missing numbers; use 0 or empty string when unreadable. Supported record types: stock, fd, expense.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Import type hint: ${importType}. ` +
              "For stock records use data fields sym, qty, avg, ltp, cur, exch, note. " +
              "For fixed deposits use bank, dtype, prin, rate, matamt, start, matdate, cur, note. " +
              "For expenses use date, merchant, category, amount, cur, note.",
          },
          { type: "input_image", image_url: body.image, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "wealthwise_extraction",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            records: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { type: "string", enum: ["stock", "fd", "expense"] },
                  confidence: { type: "number" },
                  data: { type: "object", additionalProperties: true },
                },
                required: ["type", "confidence", "data"],
              },
            },
          },
          required: ["summary", "records"],
        },
      },
    },
  });
  let parsed;
  try {
    parsed = JSON.parse(outputText(data));
  } catch {
    parsed = { summary: "Extraction finished, but the response could not be parsed.", records: [] };
  }
  return json(parsed);
}

async function handleSync(body) {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const table = env("SUPABASE_WEALTHWISE_TABLE") || "wealthwise_profiles";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, skipped: "Supabase is not configured." });
  const user = body.user || {};
  if (!user.id) return json({ error: "Missing user id." }, 400);
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  if (body.mode === "read") {
    const r = await fetch(`${url}?user_id=eq.${encodeURIComponent(user.id)}&select=data`, { headers });
    const rows = await r.json();
    return json({ ok: r.ok, data: rows?.[0]?.data || null });
  }
  const payload = {
    user_id: user.id,
    email: user.email || null,
    display_name: user.name || null,
    data: body.data || {},
    updated_at: new Date().toISOString(),
  };
  const r = await fetch(`${url}?on_conflict=user_id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  return json({ ok: r.ok, status: r.status });
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json();
    if (body.action === "chat") return await handleChat(body);
    if (body.action === "extract") return await handleExtract(body);
    if (body.action === "sync") return await handleSync(body);
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    return json({ error: error.message || "Assistant failed." }, 500);
  }
};

export const config = {
  path: "/api/wealthwise-assistant",
  method: ["POST", "OPTIONS"],
};
