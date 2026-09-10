import { analyzeDeal, fallbackWhy, parseDealTextFallback, OBJECTIVES, EVIDENCE_OPTIONS } from "./riskEngine.js";

const JSON_HEADERS = { "content-type": "application/json" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function callClaude(env, prompt) {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

async function handleParseDeal(request, env) {
  const { text } = await request.json();
  if (!text || !text.trim()) return json({ error: "text is required" }, 400);

  const prompt = `Extract structured info from this trade-credit deal description written by a small business owner. Return ONLY a JSON object, no markdown, no explanation, with fields: amount_fcfa (number or null), term_days (number or null), customer (short string or null), product (short string or null). Text: "${text.trim()}"`;

  let parsed = await callClaude(env, prompt);
  if (!parsed || (parsed.amount_fcfa == null && parsed.term_days == null)) {
    parsed = parseDealTextFallback(text);
  }
  return json(parsed);
}

async function handleNarrative(request, env) {
  const body = await request.json();
  const { rawText, objectiveId, evidenceIds, analysis } = body;
  if (!analysis) return json({ error: "analysis is required" }, 400);

  const objLabel = OBJECTIVES.find((o) => o.id === objectiveId)?.label || "not specified";
  const evLabels = (evidenceIds || [])
    .map((id) => EVIDENCE_OPTIONS.find((e) => e.id === id)?.label)
    .filter(Boolean);

  const prompt = `You are MUKAR, an AI assistant that helps small business owners make safer trade-credit decisions. A business owner described this deal: "${rawText || ""}". Their stated priority is: ${objLabel}. Evidence they have: ${
    evLabels.length ? evLabels.join("; ") : "none provided"
  }.

MUKAR's risk engine already calculated these numbers — do not change them, only explain them:
- Risk level: ${analysis.riskLevel}
- Evidence confidence: ${analysis.evidenceConfidence}
- Requested exposure: ${analysis.requestedAmount} over ${analysis.requestedTerm} days
- Recommended maximum exposure: ${analysis.recommendedExposure}
- Recommended term: ${analysis.recommendedTerm} days
- Recommended upfront payment: ${analysis.upfrontPct}%
- Recommended structure: ${analysis.structure}

Return ONLY a JSON object with two fields:
"why": an array of 3-4 short bullet strings (each under 15 words) explaining the reasoning.
"recommendation": one short sentence (under 20 words), in MUKAR's voice, encouraging the seller to restructure rather than reject the deal.
Return ONLY the JSON object, nothing else.`;

  let result = await callClaude(env, prompt);
  if (!result || !Array.isArray(result.why)) {
    result = {
      why: fallbackWhy(analysis, { objective: objectiveId }),
      recommendation: "Don't reject the deal — restructure it.",
    };
  }
  return json(result);
}

async function handleListDeals(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM deals ORDER BY created_at DESC LIMIT 100"
  ).all();
  return json({ deals: results });
}

async function handleCreateDeal(request, env) {
  const d = await request.json();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO deals
      (id, name, raw_text, objective, requested_amount, requested_term, amount, term, upfront_pct, risk_level, evidence_confidence, evidence_count, structure, recommendation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      d.name || "Untitled deal",
      d.rawText || null,
      d.objective || null,
      d.requestedAmount ?? null,
      d.requestedTerm ?? null,
      d.amount,
      d.term,
      d.upfrontPct,
      d.riskLevel,
      d.evidenceConfidence || null,
      d.evidenceCount || 0,
      d.structure || null,
      d.recommendation || null
    )
    .run();
  return json({ id }, 201);
}

async function handleDeleteDeal(id, env) {
  await env.DB.prepare("DELETE FROM deals WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/parse-deal" && request.method === "POST") {
      return handleParseDeal(request, env);
    }
    if (url.pathname === "/api/narrative" && request.method === "POST") {
      return handleNarrative(request, env);
    }
    if (url.pathname === "/api/deals" && request.method === "GET") {
      return handleListDeals(env);
    }
    if (url.pathname === "/api/deals" && request.method === "POST") {
      return handleCreateDeal(request, env);
    }
    const deleteMatch = url.pathname.match(/^\/api\/deals\/([^/]+)$/);
    if (deleteMatch && request.method === "DELETE") {
      return handleDeleteDeal(deleteMatch[1], env);
    }
    if (url.pathname === "/api/risk-preview" && request.method === "POST") {
      const draft = await request.json();
      return json(analyzeDeal(draft));
    }

    // Everything else: serve the built frontend as static assets.
    return env.ASSETS.fetch(request);
  },
};
