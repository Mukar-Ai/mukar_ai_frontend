import { useState, useRef, useEffect } from "react";
import { ArrowLeftIcon, SendIcon, PaperclipIcon, SparklesIcon, ChevronRightIcon } from "./icons.jsx";
import { analyzeDeal, evaluateChoice, OBJECTIVES, EVIDENCE_OPTIONS } from "./riskEngine.js";

const C = {
  ink: "#14181A",
  inkSoft: "#1C2220",
  paper: "#EDE6D3",
  paperDark: "#E2D8BE",
  inkText: "#231C13",
  gold: "#B8892B",
  goldSoft: "#DCC07F",
  rust: "#A23B2E",
  sage: "#4B6E53",
  muted: "#8A8168",
  mutedInk: "#6E7A72",
};

const API_BASE = import.meta.env.VITE_API_URL || "";

function formatFCFA(n) {
  if (n == null || isNaN(n)) return "—";
  return Math.round(n).toLocaleString("fr-FR") + " FCFA";
}

async function api(path, options) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function StampBadge({ level }) {
  const color = level === "Low" ? C.sage : level === "Medium" ? C.gold : C.rust;
  const word = level === "Low" ? "Low risk" : level === "Medium" ? "Medium risk" : "High risk";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: `2px solid ${color}`,
        borderRadius: "9999px",
        padding: "10px 18px",
        transform: "rotate(-4deg)",
        color,
        fontFamily: "'Fraunces', serif",
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: "0.02em",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 3,
          border: `1px solid ${color}`,
          borderRadius: "9999px",
          opacity: 0.5,
        }}
      />
      {word}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.mutedInk, opacity: 0.25, margin: "18px 0" }} />;
}

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        background: disabled ? C.muted : C.inkText,
        color: C.paper,
        border: "none",
        borderRadius: 10,
        padding: "14px 16px",
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontWeight: 600,
        fontSize: 15,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange, formatValue, unitLabels }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.mutedInk, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 14, color: C.inkText, fontWeight: 600 }}>{formatValue(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
      {unitLabels && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ fontSize: 11, color: C.muted }}>{unitLabels[0]}</span>
          <span style={{ fontSize: 11, color: C.muted }}>{unitLabels[1]}</span>
        </div>
      )}
    </div>
  );
}

const emptyDraft = () => ({ rawText: "", amount: null, termDays: null, customer: null, objective: null, evidence: [] });

export default function App() {
  const [screen, setScreen] = useState("home");
  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft());
  const [messages, setMessages] = useState([]);
  const [stage, setStage] = useState(0); // 0 describe, 1 objective, 2 evidence, 3 ready
  const [textInput, setTextInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [simState, setSimState] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    api("/deals")
      .then((data) => setDeals(data.deals || []))
      .catch(() => setDeals([]))
      .finally(() => setDealsLoading(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, stage]);

  function startNewDeal() {
    setDraft(emptyDraft());
    setMessages([{ from: "ai", text: "Tell me about the deal — who's asking, how much, and for how long?" }]);
    setStage(0);
    setTextInput("");
    setAnalysis(null);
    setNarrative(null);
    setScreen("copilot");
  }

  async function handleSendText() {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setMessages((m) => [...m, { from: "user", text }]);
    setTextInput("");
    setParsing(true);
    setMessages((m) => [...m, { from: "ai", text: "__thinking__" }]);

    let parsed;
    try {
      parsed = await api("/parse-deal", { method: "POST", body: JSON.stringify({ text }) });
    } catch {
      parsed = {};
    }

    setDraft((d) => ({
      ...d,
      rawText: text,
      amount: parsed.amount_fcfa ?? d.amount,
      termDays: parsed.term_days ?? d.termDays,
      customer: parsed.customer ?? d.customer,
    }));

    setMessages((m) => {
      const withoutThinking = m.filter((msg) => msg.text !== "__thinking__");
      return [...withoutThinking, { from: "ai", text: "Got it. What matters most to you in this deal?" }];
    });
    setParsing(false);
    setStage(1);
  }

  function handleObjective(obj) {
    setDraft((d) => ({ ...d, objective: obj.id }));
    setMessages((m) => [
      ...m,
      { from: "user", text: obj.label },
      { from: "ai", text: "Any evidence you can share? Select what applies, then continue." },
    ]);
    setStage(2);
  }

  function toggleEvidence(id) {
    setDraft((d) => ({
      ...d,
      evidence: d.evidence.includes(id) ? d.evidence.filter((e) => e !== id) : [...d.evidence, id],
    }));
  }

  function handleEvidenceContinue() {
    const count = draft.evidence.length;
    setMessages((m) => [
      ...m,
      { from: "user", text: count > 0 ? `${count} piece${count > 1 ? "s" : ""} of evidence attached` : "No evidence to attach right now" },
      { from: "ai", text: "Ready to analyze whenever you are." },
    ]);
    setStage(3);
  }

  async function handleAnalyze() {
    const a = analyzeDeal(draft);
    setAnalysis(a);
    setScreen("analysis");
    setNarrativeLoading(true);
    setNarrative(null);

    try {
      const result = await api("/narrative", {
        method: "POST",
        body: JSON.stringify({
          rawText: draft.rawText,
          objectiveId: draft.objective,
          evidenceIds: draft.evidence,
          analysis: a,
        }),
      });
      setNarrative(result);
    } catch {
      setNarrative({
        why: ["Evidence and requested exposure shaped this recommendation."],
        recommendation: "Don't reject the deal — restructure it.",
      });
    }
    setNarrativeLoading(false);
  }

  function openSimulator() {
    setSimState({
      amount: analysis.requestedAmount || analysis.recommendedExposure,
      term: analysis.requestedTerm,
      upfrontPct: analysis.upfrontPct,
    });
    setScreen("simulator");
  }

  async function applyDeal() {
    const evalR = evaluateChoice({ ...simState, evidenceScore: analysis.evidenceScore });
    const riskLevel = evalR.level === "Reduced" ? "Low" : evalR.level === "Balanced" ? "Medium" : "High";
    const payload = {
      name: draft.customer || draft.rawText.slice(0, 28) || "Untitled deal",
      rawText: draft.rawText,
      objective: draft.objective,
      requestedAmount: analysis.requestedAmount,
      requestedTerm: analysis.requestedTerm,
      amount: simState.amount,
      term: simState.term,
      upfrontPct: simState.upfrontPct,
      riskLevel,
      evidenceConfidence: analysis.evidenceConfidence,
      evidenceCount: draft.evidence.length,
      structure: analysis.structure,
      recommendation: narrative?.recommendation || null,
    };
    try {
      const { id } = await api("/deals", { method: "POST", body: JSON.stringify(payload) });
      setDeals((d) => [{ id, ...payload, amount: payload.amount, term: payload.term, evidence_count: payload.evidenceCount, risk_level: riskLevel }, ...d]);
    } catch {
      setDeals((d) => [{ id: Date.now(), name: payload.name, amount: payload.amount, term: payload.term, risk_level: riskLevel, evidence_count: payload.evidenceCount }, ...d]);
    }
    setScreen("home");
  }

  const simEval = simState ? evaluateChoice({ ...simState, evidenceScore: analysis?.evidenceScore || 0 }) : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        background: `radial-gradient(circle at 30% 0%, ${C.inkSoft}, ${C.ink} 70%)`,
        padding: "24px 12px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: C.paper,
          borderRadius: 16,
          border: `1px solid ${C.goldSoft}`,
          boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 640,
        }}
      >
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.paperDark}` }}>
          {screen !== "home" && (
            <button
              onClick={() => {
                if (screen === "copilot") setScreen("home");
                else if (screen === "analysis") setScreen("home");
                else if (screen === "simulator") setScreen("analysis");
              }}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.inkText, padding: 4 }}
            >
              <ArrowLeftIcon size={20} />
            </button>
          )}
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 19, color: C.inkText, letterSpacing: "0.01em" }}>
            {screen === "home" && "MUKAR"}
            {screen === "copilot" && "New deal"}
            {screen === "analysis" && "Deal analysis"}
            {screen === "simulator" && "Deal simulator"}
          </span>
        </div>

        {screen === "home" && (
          <div className="mukar-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 20px 24px" }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: C.inkText, lineHeight: 1.25, margin: "6px 0 6px" }}>
              Know the deal. Structure the risk.
            </p>
            <p style={{ color: C.mutedInk, fontSize: 14, lineHeight: 1.5, margin: "0 0 22px" }}>
              AI-assisted intelligence for safer, smarter trade-credit decisions.
            </p>

            <button
              onClick={startNewDeal}
              style={{
                width: "100%",
                background: C.inkText,
                color: C.paper,
                border: "none",
                borderRadius: 10,
                padding: "15px 16px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              Analyze a deal <ChevronRightIcon size={17} />
            </button>

            <Divider />

            <p style={{ fontSize: 13, color: C.muted, fontWeight: 600, marginBottom: 10 }}>Recent deals</p>

            {dealsLoading && <p style={{ fontSize: 13.5, color: C.muted }}>Loading…</p>}
            {!dealsLoading && deals.length === 0 && (
              <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
                No deals yet. Start with the one that's on your desk right now.
              </p>
            )}

            {deals.map((d) => {
              const risk = d.riskLevel || d.risk_level;
              const evCount = d.evidenceCount ?? d.evidence_count ?? 0;
              return (
                <div key={d.id} style={{ padding: "14px 0", borderBottom: `1px solid ${C.paperDark}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, color: C.inkText, fontSize: 15 }}>{d.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: risk === "Low" ? C.sage : risk === "Medium" ? C.gold : C.rust }}>
                      {risk} risk
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: C.mutedInk, margin: "4px 0 0" }}>
                    {formatFCFA(d.amount)} · {d.term} days · {evCount} evidence item{evCount === 1 ? "" : "s"}
                  </p>
                </div>
              );
            })}

            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 24, lineHeight: 1.5 }}>
              Recommendations are decision support, not guarantees.
            </p>
          </div>
        )}

        {screen === "copilot" && (
          <>
            <div ref={scrollRef} className="mukar-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 18px 8px" }}>
              {messages.map((m, i) =>
                m.text === "__thinking__" ? (
                  <div key={i} style={{ margin: "8px 0", fontSize: 13.5, color: C.muted, fontStyle: "italic" }}>
                    MUKAR is reading the deal…
                  </div>
                ) : (
                  <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", margin: "8px 0" }}>
                    <div
                      style={{
                        maxWidth: "82%",
                        background: m.from === "user" ? C.inkText : C.paperDark,
                        color: m.from === "user" ? C.paper : C.inkText,
                        borderRadius: 12,
                        padding: "10px 13px",
                        fontSize: 14,
                        lineHeight: 1.45,
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              )}

              {stage === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {OBJECTIVES.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handleObjective(o)}
                      style={{ textAlign: "left", background: "transparent", border: `1px solid ${C.mutedInk}`, borderRadius: 9, padding: "10px 13px", fontSize: 14, color: C.inkText, cursor: "pointer" }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              {stage === 2 && (
                <div style={{ marginTop: 6 }}>
                  {EVIDENCE_OPTIONS.map((e) => (
                    <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", fontSize: 13.5, color: C.inkText, cursor: "pointer" }}>
                      <input type="checkbox" className="mukar-checkbox" checked={draft.evidence.includes(e.id)} onChange={() => toggleEvidence(e.id)} />
                      {e.label}
                    </label>
                  ))}
                  <div style={{ marginTop: 10 }}>
                    <PrimaryButton onClick={handleEvidenceContinue}>Continue</PrimaryButton>
                  </div>
                </div>
              )}

              {stage === 3 && (
                <div style={{ marginTop: 10, background: C.paperDark, borderRadius: 10, padding: 14, textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                    <SparklesIcon size={15} color={C.gold} />
                    <span style={{ fontSize: 13, color: C.mutedInk, fontWeight: 600 }}>Ready to analyze</span>
                  </div>
                  <PrimaryButton onClick={handleAnalyze}>Analyze deal</PrimaryButton>
                </div>
              )}
            </div>

            {stage === 0 && (
              <div style={{ borderTop: `1px solid ${C.paperDark}`, padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button disabled title="Attach evidence during the conversation" style={{ background: "none", border: "none", color: C.muted, padding: 6, cursor: "default" }}>
                  <PaperclipIcon size={18} />
                </button>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendText();
                    }
                  }}
                  placeholder="A customer wants 3M FCFA for 60 days…"
                  rows={1}
                  style={{ flex: 1, resize: "none", border: `1px solid ${C.mutedInk}`, borderRadius: 9, padding: "9px 11px", fontSize: 14, background: "white", color: C.inkText }}
                />
                <button
                  onClick={handleSendText}
                  disabled={parsing || !textInput.trim()}
                  style={{ background: C.inkText, border: "none", borderRadius: 9, padding: 10, cursor: parsing ? "default" : "pointer", opacity: parsing || !textInput.trim() ? 0.5 : 1 }}
                >
                  <SendIcon size={16} color={C.paper} />
                </button>
              </div>
            )}
          </>
        )}

        {screen === "analysis" && analysis && (
          <div className="mukar-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <StampBadge level={analysis.riskLevel} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: C.muted }}>Evidence confidence</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.inkText }}>{analysis.evidenceConfidence}</div>
              </div>
            </div>

            <Divider />

            <p style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Recommended deal</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: C.muted }}>Maximum exposure</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.inkText }}>{formatFCFA(analysis.recommendedExposure)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.muted }}>Term</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.inkText }}>{analysis.recommendedTerm} days</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.muted }}>Upfront</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: C.inkText }}>{analysis.upfrontPct}%</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: C.muted }}>Structure</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: C.inkText }}>{analysis.structure}</div>
              </div>
            </div>

            <Divider />

            <p style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Why</p>
            {narrativeLoading && <p style={{ fontSize: 13.5, color: C.muted, fontStyle: "italic" }}>Weighing the evidence…</p>}
            {!narrativeLoading && narrative && (
              <ul style={{ margin: 0, paddingLeft: 18, color: C.inkText, fontSize: 13.5, lineHeight: 1.6 }}>
                {narrative.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}

            <div style={{ marginTop: 18, background: "rgba(162,59,46,0.08)", border: `1px solid ${C.rust}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.rust, marginBottom: 3 }}>Downside</div>
              <p style={{ fontSize: 13.5, color: C.inkText, margin: 0, lineHeight: 1.5 }}>
                If this goes wrong, you could lose {formatFCFA(analysis.recommendedExposure)}.
              </p>
            </div>

            {!narrativeLoading && narrative && (
              <div style={{ marginTop: 14, background: C.paperDark, borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <SparklesIcon size={14} color={C.gold} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.mutedInk }}>MUKAR's recommendation</span>
                </div>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: C.inkText, margin: 0, lineHeight: 1.35 }}>{narrative.recommendation}</p>
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <PrimaryButton onClick={openSimulator} disabled={narrativeLoading}>
                Simulate alternatives
              </PrimaryButton>
            </div>

            <p style={{ fontSize: 11, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>This recommendation is decision support, not a guarantee.</p>
          </div>
        )}

        {screen === "simulator" && analysis && simState && (
          <div className="mukar-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 20px 24px" }}>
            <p style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 6 }}>Current request</p>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: C.inkText, margin: "0 0 16px" }}>
              {formatFCFA(analysis.requestedAmount)} · {analysis.requestedTerm} days · 0% upfront
            </p>

            <Divider />

            <p style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 12 }}>Adjust terms</p>

            <Slider
              label="Amount"
              value={simState.amount}
              min={Math.min(100000, analysis.requestedAmount)}
              max={Math.max(analysis.requestedAmount, 100000)}
              step={10000}
              onChange={(v) => setSimState((s) => ({ ...s, amount: v }))}
              formatValue={formatFCFA}
              unitLabels={[formatFCFA(Math.min(100000, analysis.requestedAmount)), formatFCFA(analysis.requestedAmount)]}
            />
            <Slider
              label="Term"
              value={simState.term}
              min={7}
              max={Math.max(90, analysis.requestedTerm)}
              step={1}
              onChange={(v) => setSimState((s) => ({ ...s, term: v }))}
              formatValue={(v) => `${v} days`}
              unitLabels={["7d", `${Math.max(90, analysis.requestedTerm)}d`]}
            />
            <Slider
              label="Upfront payment"
              value={simState.upfrontPct}
              min={0}
              max={100}
              step={5}
              onChange={(v) => setSimState((s) => ({ ...s, upfrontPct: v }))}
              formatValue={(v) => `${v}%`}
              unitLabels={["0%", "100%"]}
            />

            <Divider />

            <p style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Living analysis</p>
            <div style={{ background: C.paperDark, borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.mutedInk }}>Risk exposure</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: simEval.level === "Reduced" ? C.sage : simEval.level === "Balanced" ? C.gold : C.rust }}>{simEval.level}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Cash exposed</span>
                <span style={{ fontSize: 12, color: C.inkText, fontWeight: 600 }}>{formatFCFA(simEval.effectiveExposure)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: C.muted }}>Term</span>
                <span style={{ fontSize: 12, color: C.inkText, fontWeight: 600 }}>{simState.term} days</span>
              </div>

              <p style={{ fontSize: 13, color: C.inkText, marginTop: 12, marginBottom: 0, lineHeight: 1.5, fontStyle: "italic" }}>
                {simState.term < analysis.requestedTerm
                  ? `Cutting the term from ${analysis.requestedTerm} to ${simState.term} days lowers exposed cash to ${formatFCFA(simEval.effectiveExposure)} while keeping most of the order value.`
                  : simState.upfrontPct > analysis.upfrontPct
                  ? `Raising the upfront payment to ${simState.upfrontPct}% cuts the cash actually at risk to ${formatFCFA(simEval.effectiveExposure)}.`
                  : `At these terms, ${formatFCFA(simEval.effectiveExposure)} of your cash is exposed for ${simState.term} days.`}
              </p>
            </div>

            <div style={{ marginTop: 18 }}>
              <PrimaryButton onClick={applyDeal}>Apply this deal</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
