// Deterministic replay engine. The model only extracts structure; this code decides outcomes.
//
// Outcome classifications:
//   defined              -> "Defined"            (state changes per a documented rule)
//   forbidden            -> "Blocked by document" (explicit prohibition, unmet condition, other role)
//   needs_clarification  -> "Needs decision"     (no rule decides, rule outcome unspecified, or conflict)
//   unsupported          -> "Out of scope"
//   invalid_input        -> input validation message, not a business outcome

export const LABELS = {
  defined: 'Defined',
  forbidden: 'Blocked by document',
  needs_clarification: 'Needs decision',
  unsupported: 'Out of scope',
  invalid_input: null,
};

export function initialState(model, overrides = {}) {
  const state = {};
  for (const v of model.variables) state[v.id] = v.initial;
  for (const [k, val] of Object.entries(overrides)) {
    if (k in state) state[k] = val;
  }
  return state;
}

function readOperand(cond, ctx) {
  if (cond.var !== undefined) return ctx.state[cond.var];
  if (cond.setting !== undefined) return ctx.settings[cond.setting];
  if (cond.input !== undefined) return ctx.inputs[cond.input];
  if (cond.relation !== undefined) return Boolean(ctx.actor.relations?.[cond.relation]);
  return undefined;
}

export function condHolds(cond, ctx) {
  const left = readOperand(cond, ctx);
  const right = cond.value;
  switch (cond.op) {
    case 'eq': return left === right;
    case 'ne': return left !== right;
    case 'in': return Array.isArray(right) && right.includes(left);
    case 'not_in': return Array.isArray(right) && !right.includes(left);
    case 'lt': return typeof left === 'number' && left < right;
    case 'lte': return typeof left === 'number' && left <= right;
    case 'gt': return typeof left === 'number' && left > right;
    case 'gte': return typeof left === 'number' && left >= right;
    default: return false;
  }
}

function roleMatches(item, actor) {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.some((r) => actor.roles.includes(r));
}

function allHold(conds, ctx) {
  return (conds || []).every((c) => condHolds(c, ctx));
}

function effectKey(effect) {
  if (effect === null || effect === undefined) return 'null';
  return JSON.stringify(Object.keys(effect).sort().map((k) => [k, effect[k]]));
}

function validateInputs(model, inputs) {
  for (const def of model.inputs || []) {
    const val = inputs[def.id];
    if (val === undefined || val === null || val === '') continue;
    if (def.type === 'integer' && !Number.isInteger(val)) {
      return `${def.label || def.id} must be a whole number. ${val} was not rounded.`;
    }
  }
  return null;
}

// Evaluate one action by one actor against the reviewed model.
// `included` is the set of rule/prohibition ids the human kept on the Verify screen.
export function evaluate({ model, included, state, settings, actor, action, inputs = {} }) {
  const keep = (item) => !included || included.has(item.id);
  const ctx = { state, settings, actor, inputs };
  const before = { ...state };

  if (!model.actions.some((a) => a.id === action)) {
    return { classification: 'unsupported', label: LABELS.unsupported, state: before, changed: false, evidence: [] };
  }

  const inputError = validateInputs(model, inputs);
  if (inputError) {
    return { classification: 'invalid_input', label: null, message: inputError, state: before, changed: false, evidence: [] };
  }

  const prohibitions = (model.prohibitions || []).filter(keep).filter((p) => p.action === action);
  const hit = prohibitions.find((p) => roleMatches(p, actor) && allHold(p.when, ctx));
  if (hit) {
    return { classification: 'forbidden', label: LABELS.forbidden, reason: 'prohibition', state: before, changed: false, evidence: [hit] };
  }

  const rules = (model.rules || []).filter(keep).filter((r) => r.action === action);
  const applicable = rules.filter((r) => allHold(r.when, ctx));
  const mine = applicable.filter((r) => roleMatches(r, actor));

  if (mine.length === 0) {
    const others = applicable.filter((r) => !roleMatches(r, actor));
    if (others.length > 0) {
      return { classification: 'forbidden', label: LABELS.forbidden, reason: 'role', state: before, changed: false, evidence: others };
    }
    // Rules exist for this action but none covers this state/input, or none exist at all.
    return {
      classification: 'needs_clarification', label: LABELS.needs_clarification, reason: 'no_rule',
      state: before, changed: false, evidence: rules,
    };
  }

  const distinct = new Map();
  for (const r of mine) distinct.set(effectKey(r.effect), r);
  if (distinct.size > 1) {
    return { classification: 'needs_clarification', label: LABELS.needs_clarification, reason: 'conflict', state: before, changed: false, evidence: mine };
  }

  const rule = mine[0];
  if (rule.effect === null || rule.effect === undefined) {
    return { classification: 'needs_clarification', label: LABELS.needs_clarification, reason: 'unspecified_outcome', state: before, changed: false, evidence: [rule] };
  }

  const after = { ...before, ...rule.effect };
  const changed = Object.keys(rule.effect).some((k) => before[k] !== after[k]);
  return { classification: 'defined', label: LABELS.defined, state: after, changed, evidence: mine };
}
