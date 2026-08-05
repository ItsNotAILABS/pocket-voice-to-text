/**
 * Real business voice modes — customer service, sales, reception, ops.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PocketVoiceBusiness = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MODES = {
    customer_service: {
      id: "customer_service",
      label: "Customer service",
      personality: "support",
      intents: [
        { match: /refund|money back|charge/i, reply: "I can help with billing. Was this a recent charge, and do you have the order number?" },
        { match: /cancel|unsubscribe/i, reply: "I can walk you through cancel. Is this for a subscription or a one-time order?" },
        { match: /broken|not work|bug|error/i, reply: "Sorry about that. What product or page, and what exactly happens?" },
        { match: /human|agent|manager/i, reply: "I can escalate. Let me take your name and the best callback number." },
        { match: /hello|hi|hey/i, reply: "Hi — thanks for reaching out. How can I help today?" },
      ],
      fallback: "I want to make sure I get this right. Can you say that again in one short sentence?",
    },
    sales: {
      id: "sales",
      label: "Sales concierge",
      personality: "sales",
      intents: [
        { match: /price|cost|how much/i, reply: "Happy to cover pricing. Are you looking for a single seat or a team?" },
        { match: /demo|trial/i, reply: "We can set a short demo. What day works, and who else should join?" },
        { match: /integrat|api|crm/i, reply: "Got it — integrations matter. Which tools do you already use?" },
        { match: /hello|hi|hey/i, reply: "Hi — what problem are you trying to solve?" },
      ],
      fallback: "Tell me the outcome you want in the next 30 days, and I'll map the next step.",
    },
    reception: {
      id: "reception",
      label: "Reception / routing",
      personality: "reception",
      intents: [
        { match: /sales|buy|pricing/i, reply: "I'll connect you with sales. One moment." },
        { match: /support|help|broken/i, reply: "Connecting you to support. What's your name?" },
        { match: /bill|invoice|account/i, reply: "Billing can help with that. Do you have your account email?" },
        { match: /hello|hi|hey/i, reply: "Hello — who may I connect you with?" },
      ],
      fallback: "I can take a message or route you. Support, sales, or billing?",
    },
    ops: {
      id: "ops",
      label: "Ops / status",
      personality: "executive",
      intents: [
        { match: /status|update|brief/i, reply: "Status: green unless you report a blocker. What's the top risk right now?" },
        { match: /down|outage|incident/i, reply: "Incident mode. What's impacted, since when, and who is on it?" },
        { match: /hello|hi|hey/i, reply: "Briefing ready. What's the priority?" },
      ],
      fallback: "Give me the decision you need in one sentence.",
    },
  };

  function listModes() {
    return Object.keys(MODES).map(function (k) {
      return { id: MODES[k].id, label: MODES[k].label, personality: MODES[k].personality };
    });
  }

  function getMode(id) {
    return MODES[id] || MODES.customer_service;
  }

  /**
   * Local intent reply (no network). Replace with LLM in production.
   */
  function route(modeId, utterance) {
    var mode = getMode(modeId);
    var text = String(utterance || "");
    for (var i = 0; i < mode.intents.length; i++) {
      if (mode.intents[i].match.test(text)) {
        return {
          mode: mode.id,
          personality: mode.personality,
          reply: mode.intents[i].reply,
          matched: true,
        };
      }
    }
    return {
      mode: mode.id,
      personality: mode.personality,
      reply: mode.fallback,
      matched: false,
    };
  }

  return { listModes: listModes, getMode: getMode, route: route, MODES: MODES };
});
