import { createHash } from 'node:crypto';
import { validateModel } from './validate.js';

export const EXTRACT_MODEL = process.env.EXTRACT_MODEL || 'gemini-4-argon';
export const QUESTION_MODEL = process.env.QUESTION_MODEL || 'gemini-3.8-flash';
export const MAX_ATTEMPTS = 3; // total, including the first call (user-approved policy)

const SYSTEM = `You convert a product or policy document into a small, executable workflow model.
Return ONLY one JSON object, no prose, no code fences.

Schema:
{
  "variables": [{"id": "snake_case", "label": "Short label", "values": [..], "initial": <one of values>}],
  "settings": [{"id": "...", "label": "...", "quote": "..."}],          // optional on/off options the document describes
  "roles": [{"id": "...", "label": "...", "quote": "..."}],
  "relations": [{"id": "...", "label": "...", "quote": "..."}],         // facts about the acting person, e.g. "started the run"
  "inputs": [{"id": "...", "label": "...", "type": "integer"|"text", "quote": "..."}],
  "actions": [{"id": "...", "label": "Short action name, 1-4 words, e.g. the main button name"}],
  "rules": [{"id": "...", "action": "<action id>", "roles": ["<role id>"], "when": [<condition>], "effect": {"<variable id>": <value>} | null, "quote": "..."}],
  "prohibitions": [{"id": "...", "action": "<action id>", "roles": [], "when": [<condition>], "quote": "..."}]
}
Condition: {"var"|"setting"|"input"|"relation": "<id>", "op": "eq"|"ne"|"in"|"not_in"|"lt"|"lte"|"gt"|"gte", "value": ...}
Settings and relations compare to true/false.

Hard rules:
- Every "quote" must be copied character-for-character from the document. Do not paraphrase. Quote one sentence or clause.
- Model only what the document states. Never add a rule, outcome or prohibition from your own knowledge.
- If the document makes an action available but does not say what it changes, use "effect": null.
- If the document forbids something, add a prohibition. Do not express a prohibition as a missing rule.
- "roles": [] on a prohibition means it applies to everyone.
- Keep the model small: only the states and actions the document's prose actually governs. Prefer the actions a person takes on the item itself; skip admin configuration screens unless the document gives them workflow effects.
- Model each independent fact the rules depend on (for example whether other checks have passed) as a setting, so a person can toggle it during replay.

Example (an unrelated library loan document, for format only):
{"variables":[{"id":"loan","label":"Loan","values":["requested","lent","returned"],"initial":"requested"}],
 "settings":[],"roles":[{"id":"librarian","label":"Librarian","quote":"A librarian lends the book."}],
 "relations":[],"inputs":[],"actions":[{"id":"lend","label":"Lend"}],
 "rules":[{"id":"lend-1","action":"lend","roles":["librarian"],"when":[{"var":"loan","op":"eq","value":"requested"}],"effect":{"loan":"lent"},"quote":"A librarian lends the book."}],
 "prohibitions":[]}`;

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function parseJson(text) {
  if (!text) throw new Error('Empty model output.');
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model output.');
  return JSON.parse(t.slice(start, end + 1));
}

export class InfraError extends Error {
  constructor(message, kind = 'infra') { super(message); this.kind = kind; }
}

// Provider backed by the Gemini Interactions API.
export function geminiProvider(apiKey) {
  let clientPromise;
  const client = () => {
    clientPromise ||= import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey }));
    return clientPromise;
  };
  async function call({ model, input, previousId, thinking = 'medium', system }) {
    const ai = await client();
    try {
      const interaction = await ai.interactions.create({
        model,
        input,
        system_instruction: system,
        previous_interaction_id: previousId,
        generation_config: { thinking_level: thinking },
      }, { timeout: 240_000 });
      return { id: interaction.id, text: interaction.output_text, model };
    } catch (err) {
      const status = err?.status || err?.code;
      const kind = status === 429 ? 'quota' : status === 401 || status === 403 ? 'auth' : /timeout/i.test(String(err?.message)) ? 'timeout' : 'infra';
      throw new InfraError(`${kind}: ${err?.message || err}`, kind);
    }
  }
  return {
    extract: ({ source, previousId, errors }) => call({
      model: EXTRACT_MODEL,
      system: SYSTEM,
      previousId,
      input: errors
        ? `Your previous JSON failed these code checks against the document:\n${errors.map((e) => `- ${e.path}: ${e.message}`).join('\n')}\nReturn the full corrected JSON object. Copy quotes exactly from the document.`
        : `Document:\n<<<\n${source}\n>>>`,
    }),
    question: ({ prompt }) => call({ model: QUESTION_MODEL, input: prompt, thinking: 'low' }),
  };
}

// Extraction with a bounded structural repair loop. Infra errors stop immediately (no auto retry).
export async function extractWithRepair(provider, source) {
  const sourceHash = sha256(source);
  const attempts = [];
  let previousId;
  let errors;
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const started = Date.now();
    let out;
    try {
      out = await provider.extract({ source, previousId, errors });
    } catch (err) {
      attempts.push({ n, source_hash: sourceHash, ms: Date.now() - started, infra_error: err.kind || 'infra', message: String(err.message).slice(0, 300) });
      return { status: 'infra_error', source_hash: sourceHash, attempts };
    }
    previousId = out.id;
    let model;
    let result;
    try {
      model = parseJson(out.text);
      result = validateModel(model, source);
    } catch (err) {
      result = { ok: false, checks: 1, errors: [{ path: '$', message: `Invalid JSON: ${err.message}` }] };
    }
    attempts.push({
      n, source_hash: sourceHash, interaction_id: out.id, model: out.model, ms: Date.now() - started,
      checks: result.checks, failed: result.errors.length, errors: result.errors.slice(0, 20),
    });
    if (result.ok) return { status: 'passed', source_hash: sourceHash, attempts, model };
    errors = result.errors.slice(0, 30);
  }
  return { status: 'unverified', source_hash: sourceHash, attempts };
}

export function templateQuestion(ctx) {
  return `In "${ctx.state}", what should happen when ${ctx.actor} tries "${ctx.action}"? The document does not decide this.`;
}

export async function draftQuestion(provider, ctx) {
  const prompt = `Write ONE short, neutral question a developer would send to the document owner.
Do not answer it and do not propose a policy. Plain English, one sentence.
Context:
- Current state: ${ctx.state}
- Actor: ${ctx.actor}
- Attempted action: ${ctx.action}
- Why the replay stopped: ${ctx.reason}
- Related quotes:\n${ctx.quotes.map((q) => `  "${q}"`).join('\n')}`;
  const out = await provider.question({ prompt });
  return { text: String(out.text || '').trim().replace(/^"|"$/g, ''), interaction_id: out.id, model: out.model };
}
