"use strict";

const SCHEMA = "pocket.voice.studio.capabilities.v1";
const CONTEXT_SNAP_SCHEMA = "pocket.voice.context_snap.v1";

const MINDSETS = Object.freeze([
  {
    id: "strategic_partner",
    label: "Strategic Mind Partner",
    description: "Executive strategy, prioritization, tradeoffs, and decision quality.",
  },
  {
    id: "senior_coding_architect",
    label: "Senior Coding Architect",
    description: "Principal-level software architecture, debugging, performance, tests, and safety.",
  },
  {
    id: "founder_sanctuary",
    label: "Founder Sanctuary",
    description: "Calm high-context thinking for founder load, focus, and consequential decisions.",
  },
]);

const VISUALIZERS = Object.freeze([
  "quantum_core",
  "neural_synapse",
  "harmonic_waves",
  "digital_matrix",
  "zen_lotus",
]);

function listMindsets() {
  return MINDSETS.map((item) => ({ ...item }));
}

function listVisualizers() {
  return [...VISUALIZERS];
}

function capabilities(opts = {}) {
  const voices = Array.isArray(opts.voices) ? opts.voices.filter(Boolean).map(String) : [];
  return {
    schema: SCHEMA,
    provider: opts.provider || "provider-neutral",
    voices,
    mindsets: listMindsets(),
    visualizers: listVisualizers(),
    context_snap: true,
    transcript_export: true,
    telemetry: true,
    realtime_transport: opts.realtime_transport || "adapter-dependent",
  };
}

function normalizeContextSnap(input = {}) {
  const selection = input.selection || {};
  const content = String(input.content || input.code || "");
  if (!content.trim()) {
    return { ok: false, error: "context_content_required" };
  }
  if (content.length > 200000) {
    return { ok: false, error: "context_content_too_large", max_chars: 200000 };
  }

  return {
    ok: true,
    snap: {
      schema: CONTEXT_SNAP_SCHEMA,
      source: String(input.source || "editor").slice(0, 64),
      file: String(input.file || input.filename || "untitled").slice(0, 512),
      language: String(input.language || "text").slice(0, 64),
      selection: {
        start_line: Number(selection.start_line || selection.startLine || 1),
        end_line: Number(selection.end_line || selection.endLine || 1),
        start_column: Number(selection.start_column || selection.startColumn || 1),
        end_column: Number(selection.end_column || selection.endColumn || 1),
      },
      content,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      created_at: new Date().toISOString(),
    },
  };
}

module.exports = {
  SCHEMA,
  CONTEXT_SNAP_SCHEMA,
  MINDSETS,
  VISUALIZERS,
  listMindsets,
  listVisualizers,
  capabilities,
  normalizeContextSnap,
};
