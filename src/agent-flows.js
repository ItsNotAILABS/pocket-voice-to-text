/**
 * Agentic voice flows — multi-step playbooks for voice agents.
 * Pure JS; used by engine + API. POCKET can mirror these on the host.
 */
"use strict";

var FLOWS = {
  travel_recovery: {
    id: "travel_recovery",
    label: "Travel disruption recovery",
    industry: "dfw_airline_hospitality",
    experts: ["airport_guide", "hotel_host", "transit_concierge", "dining_diplomat"],
    steps: [
      { id: "ack", prompt: "Acknowledge delay stress in one warm sentence." },
      { id: "flight", prompt: "Capture flight number / status if missing." },
      { id: "hotel", prompt: "Offer to hold late hotel check-in." },
      { id: "transit", prompt: "Offer shuttle / rideshare options if relevant." },
      { id: "dining", prompt: "Offer dining only if user is hungry or open." },
      { id: "confirm", prompt: "Confirm the multi-domain plan in 2 short sentences." },
    ],
    match: /delay|missed connection|flight|hotel|shuttle|gate|baggage/i,
  },
  code_pair: {
    id: "code_pair",
    label: "Voice pair programming",
    industry: "engineering",
    experts: ["coder"],
    steps: [
      { id: "goal", prompt: "Restate the coding goal in one line." },
      { id: "file", prompt: "Name the file or symbol to touch." },
      { id: "plan", prompt: "Give a 3-step plan, then wait." },
      { id: "act", prompt: "Describe the concrete edit; keep spoken." },
      { id: "verify", prompt: "How to verify (test or run)." },
    ],
    match: /code|function|bug|refactor|typescript|python|file|implement/i,
  },
  support_escalate: {
    id: "support_escalate",
    label: "Support with calm escalate",
    industry: "support",
    experts: ["support", "hotel_host"],
    steps: [
      { id: "empathy", prompt: "Empathize without over-apologizing." },
      { id: "scope", prompt: "One clarifying question max." },
      { id: "solve", prompt: "Offer one clear next step." },
      { id: "escalate", prompt: "Offer human handoff only if stuck." },
    ],
    match: /refund|cancel|broken|angry|manager|charge|bill/i,
  },
  morning_brief: {
    id: "morning_brief",
    label: "Morning desk brief",
    industry: "ops",
    experts: ["support"],
    steps: [
      { id: "hi", prompt: "Short greeting." },
      { id: "top3", prompt: "Ask for top 3 priorities." },
      { id: "risk", prompt: "Name one risk for the day." },
      { id: "first", prompt: "Propose the first 25-minute block." },
    ],
    match: /morning|brief|priorities|today|standup/i,
  },
  founder_sanctuary: {
    id: "founder_sanctuary",
    label: "Founder focus sanctuary",
    industry: "ops",
    experts: ["support"],
    steps: [
      { id: "land", prompt: "Help them land — one breath, no rush." },
      { id: "one", prompt: "What is the single most important ship today?" },
      { id: "cut", prompt: "What can wait?" },
      { id: "protect", prompt: "Protect a focus window; confirm it." },
    ],
    match: /focus|overwhelm|founder|ship today|too much/i,
  },
};

function listFlows() {
  return Object.keys(FLOWS).map(function (k) {
    var f = FLOWS[k];
    return {
      id: f.id,
      label: f.label,
      industry: f.industry,
      experts: f.experts,
      steps: f.steps.length,
    };
  });
}

function getFlow(id) {
  return FLOWS[id] || null;
}

function matchFlow(text) {
  var t = String(text || "");
  var best = null;
  var score = 0;
  Object.keys(FLOWS).forEach(function (k) {
    var f = FLOWS[k];
    if (f.match && f.match.test(t)) {
      var s = (t.match(f.match) || []).length + f.steps.length * 0.01;
      if (s > score) {
        score = s;
        best = f;
      }
    }
  });
  return best;
}

/**
 * Advance or start a flow for a turn.
 * state: { flow_id, step_index }
 */
function advance(state, utterance) {
  state = state || {};
  var flow = state.flow_id ? getFlow(state.flow_id) : matchFlow(utterance);
  if (!flow) {
    return {
      ok: true,
      active: false,
      state: state,
      coach: null,
      expert: null,
    };
  }
  var idx = typeof state.step_index === "number" ? state.step_index : 0;
  if (!state.flow_id) idx = 0;
  var step = flow.steps[Math.min(idx, flow.steps.length - 1)];
  var next = idx + 1;
  var done = next >= flow.steps.length;
  return {
    ok: true,
    active: true,
    flow_id: flow.id,
    label: flow.label,
    industry: flow.industry,
    expert: (flow.experts && flow.experts[0]) || null,
    step: step,
    step_index: idx,
    steps_total: flow.steps.length,
    done: done,
    state: {
      flow_id: flow.id,
      step_index: done ? idx : next,
    },
    coach:
      "[" +
      flow.label +
      " · step " +
      (idx + 1) +
      "/" +
      flow.steps.length +
      "] " +
      (step && step.prompt ? step.prompt : ""),
  };
}

var api = {
  FLOWS: FLOWS,
  listFlows: listFlows,
  getFlow: getFlow,
  matchFlow: matchFlow,
  advance: advance,
  version: "1.1.0",
};

if (typeof module === "object" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.PocketVoiceFlows = api;
