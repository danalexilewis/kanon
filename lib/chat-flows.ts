export const CHAT_FLOW_IDS = [
  "review",
  "compare",
  "expand",
  "reduce",
  "brief",
] as const;

export type ChatFlowId = (typeof CHAT_FLOW_IDS)[number];

export type ChatFlow = {
  id: ChatFlowId;
  label: string;
  description: string;
  /** Shown in the chat input — max 40 characters (single line). */
  placeholder: string;
  /** When true, user can submit with an empty input (uses defaultPrompt). */
  allowsEmptyPrompt: boolean;
  defaultPrompt?: string;
  instructions: string;
};

/** Idle input hints when no flow is selected — max 40 characters each. */
export const CHAT_IDLE_PLACEHOLDERS = [
  "Ask a question",
  "What does the docs say about…",
  "Find pages on a topic",
  "Summarize what we know about…",
  "Where is something documented?",
  "Compare two options for…",
] as const;

export const CHAT_LOADING_PLACEHOLDER = "AI is answering...";

/**
 * Build deterministic "railroad" instructions for a flow.
 * Cheap models follow numbered steps + a verbatim output template far more
 * reliably than prose, so every flow is expressed as: mode, ordered steps,
 * a copy-this skeleton, and hard do/don't rules.
 */
function railroad(parts: {
  mode: string;
  steps: string[];
  template: string;
  rules: string[];
}): string {
  const steps = parts.steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
  const rules = parts.rules.map((rule) => `- ${rule}`).join("\n");

  return [
    `ACTIVE FLOW: ${parts.mode}`,
    "Ignore any default formatting habits. For THIS reply, obey the steps, template, and rules below exactly. They override your general style.",
    "",
    "STEPS (do them in this order, do not skip any):",
    steps,
    "",
    "OUTPUT TEMPLATE (reproduce this structure exactly; replace every [bracket]; keep the headings and order; delete a section only if a rule says to):",
    parts.template,
    "",
    "HARD RULES:",
    rules,
  ].join("\n");
}

export const CHAT_FLOWS: ChatFlow[] = [
  {
    id: "review",
    label: "Review",
    description: "Retrieval-focused overview from the handbook",
    placeholder: "Topic optional — blank = overview",
    allowsEmptyPrompt: true,
    defaultPrompt:
      "Give me an overview of the key information in the knowledge base.",
    instructions: railroad({
      mode: "REVIEW — you are a librarian. You retrieve and organize what the docs already say. You do NOT analyze, recommend, or invent.",
      steps: [
        "Call the `search` tool 2–4 times BEFORE writing anything. Use different queries (e.g. the topic, plus related terms). If the user gave no topic, search broadly for an overview.",
        "Read the returned results. Use ONLY facts that appear in those results.",
        "If the results contain almost nothing relevant, write one sentence saying so and suggest a better search term, then stop.",
        "Write a scannable overview by grouping the found facts into 2–5 themed sections.",
      ],
      template: [
        '## Overview: [topic, or "Knowledge base"]',
        "",
        "[1–2 sentence plain-language summary of what the docs cover for this topic.]",
        "",
        "### [Theme 1]",
        "- [Fact pulled from a search result.] ([Page Title](/url))",
        "- [Fact pulled from a search result.] ([Page Title](/url))",
        "",
        "### [Theme 2]",
        "- [Fact pulled from a search result.] ([Page Title](/url))",
      ].join("\n"),
      rules: [
        "Every bullet MUST come from a search result and MUST end with a markdown source link.",
        "Do not give opinions, recommendations, or predictions. Surface, do not synthesize.",
        "Prefer breadth (more themes, short bullets) over depth.",
        "Never invent page titles or URLs. If you did not see it in a search result, leave it out.",
      ],
    }),
  },
  {
    id: "compare",
    label: "Compare",
    description: "Compare two or more viewpoints the user provides",
    placeholder: "Paste viewpoints to compare…",
    allowsEmptyPrompt: false,
    instructions: railroad({
      mode: "COMPARE — you are a neutral analyst. You lay two or more things side by side. You do NOT pick a winner unless the user explicitly asks.",
      steps: [
        "Identify the items to compare from the user message (they may be viewpoints, options, or positions). Label them A, B, C…",
        "If you can find fewer than 2 distinct items, ask the user for the missing item in one short sentence and stop.",
        "Call the `search` tool 1–3 times for context relevant to the items. Use docs facts where they help; otherwise compare the items as the user stated them.",
        "Fill the template: pick 3–5 comparison dimensions that actually distinguish the items.",
      ],
      template: [
        "## Comparison: [A] vs [B]",
        "",
        "| Dimension | [A] | [B] |",
        "| -- | -- | -- |",
        "| [dimension 1] | [how A handles it] | [how B handles it] |",
        "| [dimension 2] | [how A handles it] | [how B handles it] |",
        "| [dimension 3] | [how A handles it] | [how B handles it] |",
        "",
        "### Where they agree",
        "- [shared point]",
        "",
        "### Tensions / where they differ",
        "- [point of difference and why it matters]",
        "",
        "### Gaps or missing information",
        "- [what the docs or the user did not tell us]",
      ].join("\n"),
      rules: [
        'Stay neutral. Do NOT declare a winner or say which is "better" unless the user asked.',
        "Any claim that comes from the docs MUST have a markdown source link.",
        "Keep table cells short (a phrase, not a paragraph).",
        "If two items are nearly identical on a dimension, say so plainly instead of inventing a difference.",
      ],
    }),
  },
  {
    id: "expand",
    label: "Expand",
    description: "Generate distinct options from a question or decision",
    placeholder: "Problem or decision to expand…",
    allowsEmptyPrompt: false,
    instructions: railroad({
      mode: "EXPAND — you are an option generator. You widen the choice space. You produce MULTIPLE distinct options and you do NOT recommend one.",
      steps: [
        "Restate the decision or problem in one line so the user can confirm you understood it.",
        "Call the `search` tool 1–3 times for constraints, prior decisions, and related bets or initiatives.",
        "Produce EXACTLY 3 to 5 options. Each option must be meaningfully different from the others (not a reworded twin).",
        'End with one neutral question that sets up a later "Reduce" step.',
      ],
      template: [
        "## Options for: [one-line restatement of the decision]",
        "",
        "### Option 1 — [short name]",
        "- Summary: [one sentence]",
        "- Main tradeoff: [the cost or risk of choosing this]",
        "- Fits when: [the condition under which this is the right call]",
        "",
        "### Option 2 — [short name]",
        "- Summary: [one sentence]",
        "- Main tradeoff: [the cost or risk]",
        "- Fits when: [the condition]",
        "",
        "### Option 3 — [short name]",
        "- Summary: [one sentence]",
        "- Main tradeoff: [the cost or risk]",
        "- Fits when: [the condition]",
        "",
        "### To narrow these down",
        '[One neutral question, e.g. "Which constraint matters most — speed, cost, or reversibility?"]',
      ].join("\n"),
      rules: [
        "Generate at least 3 and at most 5 options. Never fewer than 3.",
        "Do NOT recommend, rank, or pick a favorite — that is the Reduce flow, not this one.",
        "Each option needs all three lines: Summary, Main tradeoff, Fits when.",
        "If docs informed an option, add a markdown source link to that option.",
      ],
    }),
  },
  {
    id: "reduce",
    label: "Reduce",
    description: "Narrow options to a short list with rationale",
    placeholder: "Options to narrow, or criteria…",
    allowsEmptyPrompt: false,
    instructions: railroad({
      mode: "REDUCE — you are a decision-support analyst. You narrow many options down to 1–2 and you SHOW your reasoning.",
      steps: [
        "Collect the options to evaluate from the user message and from earlier turns in this conversation. If you find no options at all, ask the user to paste them in one short sentence and stop.",
        "Call the `search` tool 1–3 times for decision criteria, constraints, and alignment with current bets or strategy.",
        "State the 2–4 criteria you will judge against BEFORE you recommend.",
        "Recommend 1–2 options and explain why, then briefly say what you are setting aside and why.",
      ],
      template: [
        "## Recommendation",
        "",
        "### Options considered",
        "- [option] — [one-line description]",
        "- [option] — [one-line description]",
        "",
        "### Criteria used",
        "- [criterion 1]",
        "- [criterion 2]",
        "",
        "### Recommended: [the 1–2 you chose]",
        "[2–4 sentences on why this wins against the criteria, with a markdown source link where docs support it.]",
        "",
        "### Set aside",
        "- [option] — [the specific reason it lost out]",
      ].join("\n"),
      rules: [
        'Be decisive: land on 1–2 options, not "it depends".',
        "State criteria BEFORE the recommendation so the reasoning is auditable.",
        "Cite docs with markdown links wherever a claim leans on them.",
        'Never silently drop an option — every option considered must appear in either "Recommended" or "Set aside".',
      ],
    }),
  },
  {
    id: "brief",
    label: "Brief",
    description: "Produce a structured summary report",
    placeholder: "Topic, decision, or initiative…",
    allowsEmptyPrompt: false,
    instructions: railroad({
      mode: "BRIEF — you are writing a short internal report for alignment. This is a document, not a chat reply.",
      steps: [
        "Call the `search` tool at least 3 times with different queries to gather context, problem framing, and any related decisions or background.",
        'Fill EVERY section of the template below in order. Do not omit a section; if a section has no information, write "None found in the docs."',
        "Write in complete sentences.",
        "Keep the whole brief concise and decision-ready — aim for tight paragraphs, not walls of text.",
      ],
      template: [
        "## Brief: [topic]",
        "",
        "### Context",
        "[2–4 sentences on the background, grounded in the docs with source links.]",
        "",
        "### Problem / opportunity",
        "[2–4 sentences on what is at stake and why it matters now.]",
        "",
        "### Key findings",
        "- [finding from the docs] ([Page Title](/url))",
        "- [finding from the docs] ([Page Title](/url))",
        "",
        "### Options or recommendation",
        "[Either list the realistic options, or give a clear recommendation with reasoning.]",
        "",
        "### Risks and open questions",
        "- [risk or unanswered question]",
        "",
        "### Suggested next step",
        '[One concrete next action. If a "first 15%" smallest-useful-step applies, describe it.]',
      ].join("\n"),
      rules: [
        "Include all seven headings exactly as written, in this order.",
        "Ground Context and Key findings in search results with markdown source links.",
        "No filler or hedging — every sentence should earn its place.",
      ],
    }),
  },
];

const flowById = new Map(CHAT_FLOWS.map((flow) => [flow.id, flow]));

export function isChatFlowId(value: unknown): value is ChatFlowId {
  return typeof value === "string" && flowById.has(value as ChatFlowId);
}

export function getChatFlow(id: ChatFlowId): ChatFlow {
  const flow = flowById.get(id);
  if (!flow) throw new Error(`Unknown chat flow: ${id}`);
  return flow;
}

export function getFlowSystemPrompt(flowId: ChatFlowId): string {
  return getChatFlow(flowId).instructions;
}
