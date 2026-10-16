// Structural validation of an extracted model against the source text.
// Passing these checks proves every quote exists and every reference resolves.
// It does not prove the extracted meaning is correct; a human reviews that.

const OPS = new Set(['eq', 'ne', 'in', 'not_in', 'lt', 'lte', 'gt', 'gte']);

export function normalize(text) {
  return String(text)
    .replace(/\*\*|__|`/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Map each normalized character back to a source line so citations show a line number.
function buildIndex(source) {
  const lines = source.split('\n');
  let flat = '';
  const lineOf = [];
  lines.forEach((line, i) => {
    const n = normalize(line);
    if (!n) return;
    if (flat) { flat += ' '; lineOf.push(i + 1); }
    flat += n;
    for (let k = 0; k < n.length; k++) lineOf.push(i + 1);
  });
  return { flat, lineOf };
}

export function locateQuote(index, quote) {
  const q = normalize(quote || '');
  if (q.length < 8) return null;
  const at = index.flat.indexOf(q);
  if (at < 0) return null;
  return { line: index.lineOf[at], end_line: index.lineOf[at + q.length - 1] };
}

export function validateModel(model, source) {
  const errors = [];
  let checks = 0;
  const fail = (path, msg) => errors.push({ path, message: msg });
  const check = (ok, path, msg) => { checks++; if (!ok) fail(path, msg); return ok; };

  if (!model || typeof model !== 'object') {
    return { ok: false, checks: 1, errors: [{ path: '$', message: 'Output is not a JSON object.' }] };
  }
  for (const key of ['variables', 'settings', 'roles', 'actions', 'rules', 'prohibitions']) {
    check(Array.isArray(model[key]), key, `Missing array "${key}".`);
  }
  if (errors.length) return { ok: false, checks, errors };
  model.inputs = Array.isArray(model.inputs) ? model.inputs : [];
  model.relations = Array.isArray(model.relations) ? model.relations : [];

  const index = buildIndex(source);
  const vars = new Map(model.variables.map((v) => [v.id, v]));
  const settings = new Set(model.settings.map((s) => s.id));
  const roles = new Set(model.roles.map((r) => r.id));
  const actions = new Set(model.actions.map((a) => a.id));
  const inputs = new Map(model.inputs.map((i) => [i.id, i]));
  const relations = new Set(model.relations.map((r) => r.id));

  const ids = new Set();
  const all = ['variables', 'settings', 'roles', 'actions', 'inputs', 'relations', 'rules', 'prohibitions']
    .flatMap((k) => model[k].map((item, i) => ({ item, path: `${k}[${i}]` })));
  for (const { item, path } of all) {
    check(typeof item.id === 'string' && item.id.length > 0, path, 'Missing id.');
    if (['rules', 'prohibitions'].some((k) => path.startsWith(k))) {
      check(!ids.has(item.id), path, `Duplicate rule id "${item.id}".`);
      ids.add(item.id);
    }
  }

  for (const [i, v] of model.variables.entries()) {
    const p = `variables[${i}]`;
    check(Array.isArray(v.values) && v.values.length > 0, p, `Variable "${v.id}" has no values.`);
    check(Array.isArray(v.values) && v.values.includes(v.initial), p, `Initial value of "${v.id}" is not one of its values.`);
  }

  const citable = [
    ...model.settings.map((x, i) => [x, `settings[${i}]`]),
    ...model.roles.map((x, i) => [x, `roles[${i}]`]),
    ...model.relations.map((x, i) => [x, `relations[${i}]`]),
    ...model.inputs.map((x, i) => [x, `inputs[${i}]`]),
    ...model.rules.map((x, i) => [x, `rules[${i}]`]),
    ...model.prohibitions.map((x, i) => [x, `prohibitions[${i}]`]),
  ];
  for (const [item, path] of citable) {
    const loc = locateQuote(index, item.quote);
    if (check(Boolean(loc), path, `Quote not found in source: "${String(item.quote || '').slice(0, 80)}"`)) {
      item.line = loc.line;
    }
  }

  const checkCond = (c, path) => {
    check(OPS.has(c.op), path, `Unknown operator "${c.op}".`);
    if (c.var !== undefined) {
      const v = vars.get(c.var);
      if (check(Boolean(v), path, `Unknown variable "${c.var}".`)) {
        const vals = Array.isArray(c.value) ? c.value : [c.value];
        for (const val of vals) check(v.values.includes(val), path, `Value "${val}" is not a value of "${c.var}".`);
      }
    } else if (c.setting !== undefined) {
      check(settings.has(c.setting), path, `Unknown setting "${c.setting}".`);
      check(typeof c.value === 'boolean', path, 'Setting conditions must compare to true or false.');
    } else if (c.input !== undefined) {
      const inp = inputs.get(c.input);
      if (check(Boolean(inp), path, `Unknown input "${c.input}".`) && inp.type === 'integer') {
        check(Number.isInteger(c.value), path, `Input "${c.input}" compares to a non-integer.`);
      }
    } else if (c.relation !== undefined) {
      check(relations.has(c.relation), path, `Unknown relation "${c.relation}".`);
    } else {
      check(false, path, 'Condition must reference a var, setting, input or relation.');
    }
  };

  for (const kind of ['rules', 'prohibitions']) {
    for (const [i, r] of model[kind].entries()) {
      const p = `${kind}[${i}]`;
      check(actions.has(r.action), p, `Unknown action "${r.action}".`);
      for (const role of r.roles || []) check(roles.has(role), p, `Unknown role "${role}".`);
      for (const [j, c] of (r.when || []).entries()) checkCond(c, `${p}.when[${j}]`);
      if (kind === 'rules' && r.effect) {
        for (const [k, val] of Object.entries(r.effect)) {
          const v = vars.get(k);
          if (check(Boolean(v), p, `Effect sets unknown variable "${k}".`)) {
            check(v.values.includes(val), p, `Effect value "${val}" is not a value of "${k}".`);
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, checks, errors };
}
