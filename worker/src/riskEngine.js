// Deterministic, rule-based risk engine. No AI involved here on purpose —
// the numbers must always be reproducible and available even if the
// Anthropic API is unreachable. Keep this in sync with
// frontend/src/riskEngine.js if you change the model.

export const OBJECTIVES = [
  { id: "protect_cash", label: "Protect my cash" },
  { id: "make_sale", label: "Make the sale" },
  { id: "win_customer", label: "Win this customer" },
  { id: "move_inventory", label: "Move inventory" },
  { id: "maximize_order", label: "Maximize the order" },
];

export const EVIDENCE_OPTIONS = [
  { id: "history", label: "Past repayment history with this customer" },
  { id: "registration", label: "Business registration or ID" },
  { id: "invoice", label: "Signed invoice or purchase order" },
  { id: "bank", label: "Bank or mobile money statement" },
  { id: "reference", label: "Trade reference from another supplier" },
];

export function analyzeDeal(draft) {
  const amount = draft.amount || 0;
  const term = draft.termDays || 30;
  const evCount = (draft.evidence || []).length;
  const hasHistory = (draft.evidence || []).includes("history");

  let evidenceScore = evCount * 15 + (hasHistory ? 15 : 0);
  evidenceScore = Math.min(100, evidenceScore);

  const baseCeiling = 400000 + evidenceScore * 9000;
  const termFactor = Math.max(0.4, 1 - (term - 14) / 200);

  let recommendedExposure = Math.min(amount || baseCeiling, baseCeiling * termFactor);
  recommendedExposure = Math.max(50000, Math.round(recommendedExposure / 10000) * 10000);
  if (amount) recommendedExposure = Math.min(recommendedExposure, amount);

  const exposureRatio = amount > 0 ? recommendedExposure / amount : 1;

  let riskLevel = "Low";
  if (exposureRatio < 0.5 || evidenceScore < 30) riskLevel = "High";
  else if (exposureRatio < 0.85 || evidenceScore < 60) riskLevel = "Medium";

  let recommendedTerm = term;
  if (riskLevel === "High") recommendedTerm = Math.max(7, Math.round(term * 0.4));
  else if (riskLevel === "Medium") recommendedTerm = Math.max(10, Math.round(term * 0.6));

  let upfrontPct = riskLevel === "High" ? 50 : riskLevel === "Medium" ? 35 : 15;
  if (draft.objective === "protect_cash") upfrontPct += 10;
  if (draft.objective === "make_sale" || draft.objective === "win_customer") upfrontPct -= 10;
  upfrontPct = Math.min(70, Math.max(0, upfrontPct));

  const structure = exposureRatio < 0.9 ? "Staged delivery" : "Standard terms";
  const evidenceConfidence = evidenceScore >= 70 ? "Strong" : evidenceScore >= 40 ? "Moderate" : "Limited";

  return {
    riskLevel,
    evidenceConfidence,
    evidenceScore,
    recommendedExposure,
    recommendedTerm,
    upfrontPct,
    structure,
    exposureRatio,
    requestedAmount: amount,
    requestedTerm: term,
  };
}

export function evaluateChoice({ amount, term, upfrontPct, evidenceScore }) {
  const baseCeiling = 400000 + evidenceScore * 9000;
  const termFactor = Math.max(0.4, 1 - (term - 14) / 200);
  const comfortable = baseCeiling * termFactor;
  const effectiveExposure = amount * (1 - upfrontPct / 100);
  const ratio = comfortable > 0 ? effectiveExposure / comfortable : 1;
  let level = "Reduced";
  if (ratio > 1.3) level = "Elevated";
  else if (ratio > 0.9) level = "Balanced";
  return { level, effectiveExposure, ratio };
}

export function fallbackWhy(a, draft) {
  const bullets = [];
  if (a.evidenceConfidence === "Limited") bullets.push("Available evidence is limited, so exposure is capped low.");
  else if (a.evidenceConfidence === "Moderate") bullets.push("Evidence gives a moderate picture of this buyer.");
  else bullets.push("Strong evidence supports a larger exposure.");
  if (a.exposureRatio < 0.9) bullets.push("Requested exposure is higher than what current evidence supports.");
  const obj = OBJECTIVES.find((o) => o.id === draft.objective);
  if (obj) bullets.push(`Your stated priority — ${obj.label.toLowerCase()} — shaped the structure.`);
  bullets.push(`A ${a.recommendedTerm}-day term with ${a.upfrontPct}% upfront balances risk and the sale.`);
  return bullets;
}

export function parseDealTextFallback(text) {
  let amount = null;
  const millionMatch = text.match(/(\d[\d.,]*)\s*(million|m)\b/i);
  if (millionMatch) {
    amount = parseFloat(millionMatch[1].replace(/,/g, "")) * 1000000;
  } else {
    const plain = text.match(/(\d[\d.,]{3,})/);
    if (plain) amount = parseFloat(plain[1].replace(/[.,](?=\d{3}\b)/g, ""));
  }
  const termMatch = text.match(/(\d+)\s*(day|days|d)\b/i);
  const term = termMatch ? parseInt(termMatch[1], 10) : null;
  return { amount_fcfa: amount, term_days: term, customer: null, product: null };
}
