import { evaluate, initialState } from './engine.js';

const S = {
  step: 'document',
  samples: [],
  doc: { text: '', hash: '', sampleId: null, kind: '' },
  extraction: null,      // { status, attempts, model, recorded, ran_at|recorded_at, source_hash }
  loading: null,         // { started }
  included: new Set(),
  people: [],
  actorId: null,
  settings: {},
  inputs: {},
  start: {},
  state: null,
  path: [],
  last: null,
  draft: null,           // { text, source, loading }
  questions: [],
};

const $view = document.getElementById('view');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = (v) => (v === true ? 'Yes' : v === false ? 'No' : String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
const short = (h) => (h ? h.slice(0, 8) : '');
const byId = (list, id) => (list || []).find((x) => x.id === id);
const label = (list, id) => byId(list, id)?.label || pretty(id);

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

function go(step) {
  if (step === 'verify' && !S.extraction && !S.loading) return;
  if (step === 'replay' && !S.state) return;
  S.step = step;
  render();
  window.scrollTo(0, 0);
}

// ---------------- Document ----------------

async function setDoc(text, sample) {
  if (S.doc.text && text !== S.doc.text && (S.extraction || S.path.length)) {
    if (!confirm('Changing the document clears the review, replay and questions. Continue?')) return false;
  }
  if (text !== S.doc.text) {
    S.extraction = null; S.state = null; S.path = []; S.last = null; S.questions = []; S.draft = null;
  }
  S.doc = { text, hash: text ? await sha256(text) : '', sampleId: sample?.id || null, kind: sample?.kind || 'Pasted document' };
  return true;
}

function viewDocument() {
  const s = S.samples.find((x) => x.id === S.doc.sampleId);
  const recorded = s?.recorded && s.sha256 === S.doc.hash;
  return `
    <h1 class="hero">Walk a spec. Stop where it can’t decide.</h1>
    <p class="lede">Paste a PRD or policy document. Gemini 4 Argon extracts the workflow, code checks every quote against the source, and you replay real paths by pressing the document’s own buttons.</p>
    <div class="samples">
      ${S.samples.map((x) => `<button class="pill ${S.doc.sampleId === x.id ? 'on' : ''}" data-sample="${esc(x.id)}">${esc(x.title)}</button>`).join('')}
    </div>
    <textarea class="editor" id="editor" spellcheck="false" placeholder="Paste a non-sensitive PRD, spec or policy document…">${esc(S.doc.text)}</textarea>
    <div class="meta">
      <div class="facts">
        ${S.doc.text ? `<span class="kindtag ${S.doc.sampleId === 'github' ? 'public' : ''}">${esc(S.doc.kind)}</span>` : ''}
        <span>${S.doc.text.length.toLocaleString()} characters</span>
        ${S.doc.hash ? `<span class="mono">sha256 ${esc(short(S.doc.hash))}</span>` : ''}
      </div>
      <div class="go">
        ${recorded ? `<button class="btn" id="userec">Use recorded run · ${esc(new Date(s.recorded).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))}</button>` : ''}
        <button class="btn primary" id="extract" ${S.doc.text.trim() ? '' : 'disabled'}>Extract with Gemini 4 Argon</button>
      </div>
    </div>`;
}

function bindDocument() {
  const ed = document.getElementById('editor');
  ed.addEventListener('input', async () => {
    const text = ed.value;
    if (S.extraction || S.path.length) { S.extraction = null; S.state = null; S.path = []; S.last = null; S.questions = []; }
    S.doc = { text, hash: text ? await sha256(text) : '', sampleId: null, kind: 'Pasted document' };
    const btn = document.getElementById('extract');
    btn.disabled = !text.trim();
    document.querySelector('.facts').innerHTML = `<span class="kindtag">Pasted document</span><span>${text.length.toLocaleString()} characters</span><span class="mono">sha256 ${esc(short(S.doc.hash))}</span>`;
    renderChrome();
  });
  $view.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', async () => {
    const s = S.samples.find((x) => x.id === b.dataset.sample);
    if (await setDoc(s.text, s)) render();
  }));
  document.getElementById('extract').addEventListener('click', () => runExtract(false));
  document.getElementById('userec')?.addEventListener('click', () => runExtract(true));
}

async function runExtract(useRecorded) {
  if (!S.doc.text.trim()) return;
  S.loading = { started: Date.now(), useRecorded };
  S.extraction = null;
  go('verify');
  const timer = setInterval(() => { if (S.step === 'verify' && S.loading) render(); }, 1000);
  const forHash = S.doc.hash;
  const reqId = (S.reqId = (S.reqId || 0) + 1);
  try {
    const r = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: S.doc.text, useRecorded }) });
    const data = await r.json();
    if (forHash !== S.doc.hash || reqId !== S.reqId) return; // stale response
    S.extraction = data;
    if (data.status === 'passed') setupReview(data.model);
  } catch (err) {
    if (forHash === S.doc.hash) S.extraction = { status: 'infra_error', message: `Network error: ${err.message}`, attempts: [] };
  } finally {
    clearInterval(timer);
    if (forHash === S.doc.hash && reqId === S.reqId) { S.loading = null; render(); }
  }
}

// ---------------- Verify ----------------

function setupReview(model) {
  S.included = new Set([...model.rules, ...model.prohibitions].map((r) => r.id));
  S.state = null; S.path = []; S.last = null;
}

function ruleSummary(m, r, kind) {
  const who = (r.roles && r.roles.length) ? r.roles.map((x) => label(m.roles, x)).join(', ') : 'Anyone';
  const act = label(m.actions, r.action);
  const conds = (r.when || []).map((c) => condText(m, c)).join(' and ');
  if (kind === 'prohibitions') return `${who} can’t ${act}${conds ? ` when ${conds}` : ''}`;
  const eff = r.effect ? Object.entries(r.effect).map(([k, v]) => `${label(m.variables, k)} → ${pretty(v)}`).join(', ') : 'outcome not stated';
  return `${who} · ${act}${conds ? ` (when ${conds})` : ''} → ${eff}`;
}

function condText(m, c) {
  const ops = { eq: 'is', ne: 'is not', in: 'is one of', not_in: 'is not one of', lt: '<', lte: '≤', gt: '>', gte: '≥' };
  if (c.setting !== undefined) return `${label(m.settings, c.setting)} is ${c.value ? 'on' : 'off'}`;
  if (c.relation !== undefined) return c.value ? label(m.relations, c.relation).toLowerCase() : `not ${label(m.relations, c.relation).toLowerCase()}`;
  const name = c.var !== undefined ? label(m.variables, c.var) : label(m.inputs, c.input);
  const val = Array.isArray(c.value) ? c.value.map(pretty).join(' / ') : pretty(c.value);
  return `${name} ${ops[c.op] || c.op} ${val}`;
}

function attemptRow(a) {
  if (a.infra_error) {
    return `<div class="row"><span class="tag error">Attempt ${a.n} · ${esc(pretty(a.infra_error))} error</span><span class="why">${esc(a.message)}</span></div>`;
  }
  const kinds = [...new Set((a.errors || []).map((e) => e.message.split(':')[0].replace(/".*$/, '').trim()))].slice(0, 3).join(' · ');
  return a.failed
    ? `<div class="row"><span class="tag error">Attempt ${a.n} · ${a.failed} of ${a.checks} checks failed</span><span class="why">${esc(kinds)}</span><span class="faint">→ sent back to Gemini 4 Argon</span></div>`
    : `<div class="row"><span class="tag defined">Attempt ${a.n} · ${a.checks} of ${a.checks} checks passed</span><span class="faint">${(a.ms / 1000).toFixed(1)}s · ${esc(a.model || '')}</span></div>`;
}

function viewVerify() {
  if (S.loading) {
    const secs = Math.round((Date.now() - S.loading.started) / 1000);
    return `<h1 class="hero">Reading the document…</h1>
      <p class="lede"><span class="spinner"></span>${S.loading.useRecorded ? 'Loading the recorded run' : `Gemini 4 Argon is extracting the workflow, then code checks every quote · ${secs}s`}</p>`;
  }
  const x = S.extraction;
  if (!x) return '';
  if (x.status === 'invalid_input') return `<div class="alert warn">${esc(x.message)}</div>`;
  if (x.status === 'infra_error') {
    return `<h1 class="hero">The model call failed.</h1>
      <div class="loop">${(x.attempts || []).map(attemptRow).join('')}</div>
      <div class="alert">${esc(x.message || 'The extraction stopped on an infrastructure or model error. Nothing was retried automatically.')}</div>
      <button class="btn primary" id="retry">Retry extraction</button>`;
  }
  const when = x.recorded ? `Recorded run from ${new Date(x.recorded_at).toLocaleString('en-US')}` : `Run at ${new Date(x.ran_at).toLocaleTimeString('en-US')}`;
  if (x.status === 'unverified') {
    return `<h1 class="hero">Some rules never matched the source.</h1>
      <div class="loop">${x.attempts.map(attemptRow).join('')}</div>
      <div class="alert warn">After ${x.attempts.length} attempts the extraction still had unverifiable quotes or references. Nothing was executed. This is an extraction failure, not a gap in the document.</div>
      <button class="btn primary" id="retry">Retry extraction</button>`;
  }
  const m = x.model;
  const lines = S.doc.text.split('\n');
  const cited = new Set();
  for (const r of [...m.rules, ...m.prohibitions, ...m.settings, ...m.roles]) if (r.line) cited.add(r.line);
  const items = [...m.rules.map((r) => ['rules', r]), ...m.prohibitions.map((r) => ['prohibitions', r])];
  const runnable = items.filter(([, r]) => S.included.has(r.id)).length;
  return `
    <section style="padding-top:8px">
      <h1 class="hero" style="margin-top:6px">Every rule points to a sentence in the source.</h1>
      <div class="loop">${x.attempts.map(attemptRow).join('')}<div class="row faint" style="font-size:13px">${esc(when)} · source sha256 ${esc(short(x.source_hash))}</div></div>
    </section>
    <div class="cols">
      <section>
        <div class="k">Source</div>
        <div class="srcview" id="srcview">${lines.map((l, i) => `<div class="l ${cited.has(i + 1) ? 'cited' : ''}" id="L${i + 1}"><span class="n">${i + 1}</span><span>${esc(l) || '&nbsp;'}</span></div>`).join('')}</div>
      </section>
      <section>
        <div class="k">Extracted rules · you decide what runs</div>
        <div class="rules">
          ${items.map(([kind, r]) => `
            <div class="rule ${S.included.has(r.id) ? '' : 'off'}">
              <div>
                <div class="kind">${kind === 'rules' ? 'Rule' : 'Prohibition'}</div>
                <div class="t">${esc(ruleSummary(m, r, kind))}</div>
                <div class="m"><a href="#L${r.line}" data-line="${r.line}" style="color:inherit">line ${r.line}</a> · <b>quote ✓</b></div>
              </div>
              <div class="seg"><button class="${S.included.has(r.id) ? 'on' : ''}" data-inc="${esc(r.id)}">Include</button><button class="${S.included.has(r.id) ? '' : 'on'}" data-exc="${esc(r.id)}">Exclude</button></div>
            </div>`).join('')}
        </div>
        <div class="foot"><span class="faint" style="font-size:15px">Code checked the quotes. You check the meaning. If a rule reads wrong, re-extract instead of replaying it.</span><span style="display:flex;gap:10px"><button class="btn" id="reextract">Re-extract</button><button class="btn primary" id="startreplay" ${runnable ? '' : 'disabled'}>Start replay</button></span></div>
      </section>
    </div>`;
}

function bindVerify() {
  document.getElementById('retry')?.addEventListener('click', () => runExtract(false));
  document.getElementById('reextract')?.addEventListener('click', () => { if (confirm('Discard this extraction and your review, then ask Gemini 4 Argon again?')) runExtract(false); });
  $view.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => { S.included.add(b.dataset.inc); S.state = null; render(); }));
  $view.querySelectorAll('[data-exc]').forEach((b) => b.addEventListener('click', () => { S.included.delete(b.dataset.exc); S.state = null; render(); }));
  $view.querySelectorAll('[data-line]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const el = document.getElementById(`L${a.dataset.line}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1200);
  }));
  document.getElementById('startreplay')?.addEventListener('click', () => { startReplay(); go('replay'); });
}

// ---------------- Replay ----------------

function defaultPeople(m) {
  const letters = 'ABCDEFG';
  const people = [];
  const rel = Object.fromEntries((m.relations || []).map((r) => [r.id, true]));
  const first = m.roles[0]?.id;
  people.push({ id: 'A', roles: first ? [first] : [], relations: rel });
  m.roles.forEach((r, i) => people.push({ id: letters[i + 1], roles: [r.id], relations: {} }));
  return people;
}

function startReplay() {
  const m = S.extraction.model;
  if (!S.people.length || S.people.some((p) => p.roles.some((r) => !byId(m.roles, r)))) {
    S.people = defaultPeople(m);
    S.actorId = 'A';
    S.settings = Object.fromEntries(m.settings.map((s) => [s.id, false]));
    S.inputs = Object.fromEntries((m.inputs || []).map((i) => [i.id, '']));
    S.start = {};
  }
  resetPath();
}

function resetPath() {
  const m = S.extraction.model;
  S.runId = `run-${Date.now().toString(36)}`;
  S.state = initialState(m, S.start);
  S.runStart = { state: { ...S.state }, settings: { ...S.settings }, people: structuredClone(S.people), inputs: { ...S.inputs } };
  S.path = [];
  S.last = null;
  S.draft = null;
}

function personText(m, p) {
  const roles = p.roles.map((r) => label(m.roles, r)).join(', ') || 'No role';
  const rels = Object.entries(p.relations).filter(([, v]) => v).map(([k]) => label(m.relations, k).toLowerCase());
  return `${p.id} · ${roles}${rels.length ? ` · ${rels.join(', ')}` : ''}`;
}

function inputValues(m) {
  const out = {};
  for (const def of m.inputs || []) {
    const raw = S.inputs[def.id];
    if (raw === '' || raw === undefined) continue;
    out[def.id] = def.type === 'integer' ? Number(raw) : raw;
  }
  return out;
}

function headline(m, res, actor, action) {
  const a = label(m.actions, action);
  switch (res.classification) {
    case 'defined': {
      const ch = Object.keys(res.state).filter((k) => res.state[k] !== S.state[k]).map((k) => `${label(m.variables, k)} is now ${pretty(res.state[k]).toLowerCase()}`);
      const open = (res.undecided || []).map((k) => label(m.variables, k));
      return [`${actor.id} · ${a}: ${ch.length ? ch.join(', ') : 'no visible change'}.`, `The document defines this outcome.${open.length ? ` This rule says nothing about ${open.join(', ')}; those values are just unchanged.` : ''}`];
    }
    case 'forbidden':
      if (res.reason === 'role') {
        const roles = [...new Set(res.evidence.flatMap((r) => r.roles || []))].map((r) => label(m.roles, r)).join(' or ');
        return [`Only ${roles} can ${a.toLowerCase()} here.`, 'Nothing changed. The document assigns this to another role. It is not a gap.'];
      }
      return [`${actor.id} can’t ${a.toLowerCase()} here.`, 'Nothing changed. The document forbids this. It is not a gap.'];
    case 'needs_clarification':
      if (res.reason === 'conflict') return ['Two rules in the document disagree.', 'Nothing changed. The document gives different outcomes for the same situation and says nothing about which one wins.'];
      if (res.reason === 'unspecified_outcome') return ['The document allows this but never says what it changes.', 'Nothing changed. We stopped instead of guessing.'];
      return ['The document doesn’t say what happens here.', 'Nothing changed. No rule covers this state, person and input. We stopped instead of guessing.'];
    case 'unsupported':
      return ['This action is outside what the replay supports.', 'Nothing was executed.'];
    case 'excluded_by_review':
      return ['You excluded the rules for this action.', 'Nothing was executed. This is your review choice, not a gap in the document. Include the rule or re-extract on Verify.'];
    case 'invalid_input':
      return [res.message, 'Fix the input. Nothing was executed.'];
    default:
      return ['Unexpected result.', ''];
  }
}

function act(action) {
  const m = S.extraction.model;
  const actor = S.people.find((p) => p.id === S.actorId);
  const res = evaluate({ model: m, included: S.included, state: S.state, settings: S.settings, actor, action, inputs: inputValues(m) });
  const [h, sub] = headline(m, res, actor, action);
  const entry = {
    actor: personText(m, actor), action: label(m.actions, action), classification: res.classification, label: res.label,
    headline: h, sub, before: { ...S.state }, after: { ...res.state },
    settings: { ...S.settings }, inputs: inputValues(m),
    evidence: res.evidence.map((r) => ({ id: r.id, line: r.line, quote: r.quote })), reason: res.reason,
  };
  if (res.classification !== 'invalid_input') S.path.push(entry);
  S.last = entry;
  S.state = res.state;
  S.draft = null;
  render();
}

const TAGCLASS = { defined: 'defined', forbidden: 'blocked', needs_clarification: 'decision', unsupported: 'scope' };
const NOLABEL = { invalid_input: 'Input check', excluded_by_review: 'Your review', setup: 'Changed by you' };

function viewResult() {
  const r = S.last;
  if (!r) return `<article class="result"><div class="empty">Choose who is acting, then press one of the document’s buttons.</div></article>`;
  const tag = r.label ? `<span class="tag ${TAGCLASS[r.classification]}">${esc(r.label)}</span>` : `<span class="tag scope">${NOLABEL[r.classification] || 'Note'}</span>`;
  const quotes = r.evidence.slice(0, 3).map((e) => `<p class="quote">${esc(e.quote)}</p><div class="cite">document line ${esc(e.line)} · quote verified</div>`).join('');
  let draft = '';
  if (r.classification === 'needs_clarification') {
    if (!S.draft) draft = `<button class="btn primary" id="draftq">Draft a question</button>`;
    else if (S.draft.loading) draft = `<p class="muted"><span class="spinner"></span>Drafting with ${esc('a fast Gemini model')}…</p>`;
    else draft = `<div class="qdraft"><div class="k" style="margin:0">Question draft · ${esc(S.draft.source)} · edit before adding</div>
      <textarea id="qtext">${esc(S.draft.text)}</textarea>
      <button class="btn primary" id="addq">Add to questions</button></div>`;
  }
  return `<article class="result">${tag}<h2>${esc(r.headline)}</h2><div class="sub">${esc(r.sub)}</div>${quotes}${draft}</article>`;
}

function viewReplay() {
  const m = S.extraction.model;
  const actor = S.people.find((p) => p.id === S.actorId);
  const changedKeys = S.last ? Object.keys(S.last.after).filter((k) => S.last.after[k] !== S.last.before[k]) : [];
  return `
    <section class="ctx">
      <div class="grp"><span class="lbl">Acting as</span>${S.people.map((p) => `<button class="pill ${p.id === S.actorId ? 'on' : ''}" data-actor="${p.id}">${esc(personText(m, p))}</button>`).join('')}</div>
      <div class="grp"><span class="lbl">${esc(actor.id)} is</span>
        ${m.roles.map((r) => `<button class="pill small ${actor.roles.includes(r.id) ? 'toggled' : ''}" data-role="${esc(r.id)}">${actor.roles.includes(r.id) ? '✓ ' : ''}${esc(label(m.roles, r.id))}</button>`).join('')}
        ${(m.relations || []).map((r) => `<button class="pill small ${actor.relations[r.id] ? 'toggled' : ''}" data-rel="${esc(r.id)}">${actor.relations[r.id] ? '✓ ' : ''}${esc(r.label || pretty(r.id))}</button>`).join('')}
      </div>
      ${m.settings.length ? `<div class="grp"><span class="lbl" title="The document defines these options. You choose their values for this run.">Conditions · you choose</span>${m.settings.map((s) => `<button class="pill" data-setting="${esc(s.id)}"><span class="dot ${S.settings[s.id] ? 'on' : ''}"></span>${esc(s.label || pretty(s.id))} · ${S.settings[s.id] ? 'on' : 'off'}</button>`).join('')}</div>` : ''}
      ${(m.inputs || []).length ? `<div class="grp"><span class="lbl">Inputs</span>${m.inputs.map((i) => `<label class="faint" style="font-size:14px">${esc(i.label || pretty(i.id))} <input data-input="${esc(i.id)}" type="${i.type === 'integer' ? 'number' : 'text'}" step="any" value="${esc(S.inputs[i.id])}"></label>`).join('')}</div>` : ''}
      <details class="more" ${S.startOpen ? 'open' : ''}><summary>More setup · start state</summary><div class="grp"><span class="lbl">Start from</span>${m.variables.map((v) => `<select data-start="${esc(v.id)}" aria-label="${esc(label(m.variables, v.id))}">${v.values.map((val) => `<option ${String((S.start[v.id] ?? v.initial)) === String(val) ? 'selected' : ''} value="${esc(JSON.stringify(val))}">${esc(label(m.variables, v.id))}: ${esc(pretty(val))}</option>`).join('')}</select>`).join('')}</div></details>
    </section>
    <div class="main">
      <section>
        <div class="state">${m.variables.map((v) => `<div><div class="sk">${esc(label(m.variables, v.id))}</div><div class="sv ${changedKeys.includes(v.id) ? 'changed' : ''}">${esc(pretty(S.state[v.id]))}</div></div>`).join('')}</div>
        <div class="acts">${m.actions.map((a, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-act="${esc(a.id)}">${esc(a.label || pretty(a.id))}</button>`).join('')}<button class="btn" id="reset" style="border-style:dashed;color:var(--muted)">Reset path</button></div>
        ${viewResult()}
      </section>
      <aside class="path">
        <div class="k">Path</div>
        <ol>
          <li><i></i>Start<div class="s">${esc(m.variables.map((v) => pretty(S.path[0]?.before[v.id] ?? S.state[v.id])).join(' · '))}</div></li>
          ${S.path.map((p) => `<li><i class="${p.classification}"></i>${esc(p.actor.split(' · ')[0])} · ${esc(p.action)}<div class="s">${esc(p.label || NOLABEL[p.classification] || '')}</div></li>`).join('')}
        </ol>
      </aside>
    </div>`;
}

function bindReplay() {
  const m = S.extraction.model;
  const actor = S.people.find((p) => p.id === S.actorId);
  $view.querySelectorAll('[data-actor]').forEach((b) => b.addEventListener('click', () => { S.actorId = b.dataset.actor; render(); }));
  $view.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => {
    const r = b.dataset.role;
    actor.roles = actor.roles.includes(r) ? actor.roles.filter((x) => x !== r) : [...actor.roles, r];
    logSetup(`${actor.id} ${actor.roles.includes(r) ? 'is' : 'is not'} ${label(m.roles, r)}`); render();
  }));
  $view.querySelectorAll('[data-rel]').forEach((b) => b.addEventListener('click', () => {
    actor.relations[b.dataset.rel] = !actor.relations[b.dataset.rel];
    logSetup(`${actor.id} ${actor.relations[b.dataset.rel] ? '' : 'not '}${label(m.relations, b.dataset.rel).toLowerCase()}`); render();
  }));
  const logSetup = (text) => { if (S.path.length) S.path.push({ classification: 'setup', actor: 'Setup', action: text, label: 'Changed by you', before: { ...S.state }, after: { ...S.state }, evidence: [] }); };
  $view.querySelectorAll('[data-setting]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.setting; S.settings[id] = !S.settings[id];
    logSetup(`${label(m.settings, id)} ${S.settings[id] ? 'on' : 'off'}`); render();
  }));
  $view.querySelectorAll('[data-input]').forEach((el) => el.addEventListener('change', () => { S.inputs[el.dataset.input] = el.value; }));
  $view.querySelectorAll('[data-start]').forEach((el) => el.addEventListener('change', () => { S.start[el.dataset.start] = JSON.parse(el.value); S.startOpen = true; resetPath(); render(); }));
  $view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    $view.querySelectorAll('[data-input]').forEach((el) => { S.inputs[el.dataset.input] = el.value; });
    act(b.dataset.act);
  }));
  document.getElementById('reset').addEventListener('click', () => { resetPath(); render(); });
  document.getElementById('draftq')?.addEventListener('click', draftQuestion);
  document.getElementById('addq')?.addEventListener('click', () => {
    const text = document.getElementById('qtext').value.trim();
    if (!text) return;
    const edited = text !== S.draft.text;
    S.questions.push({
      text, source: edited ? `${S.draft.source}, edited by you` : S.draft.source,
      path: S.path.map((p) => ({ actor: p.actor, action: p.action, label: p.label || NOLABEL[p.classification] || '', classification: p.classification })),
      run: { id: S.runId, start: structuredClone(S.runStart), source_hash: S.doc.hash, extraction: S.extraction.recorded ? `recorded ${S.extraction.recorded_at}` : `run ${S.extraction.ran_at}`, included_rules: S.included.size },
      state: { ...S.last.after }, settings: { ...S.last.settings }, inputs: { ...S.last.inputs },
      evidence: S.last.evidence, reason: S.last.reason,
    });
    S.draft = null;
    toast('Added to questions');
    render();
  });
}

async function draftQuestion() {
  const m = S.extraction.model;
  const r = S.last;
  S.draft = { loading: true };
  render();
  const ctx = {
    state: m.variables.map((v) => `${label(m.variables, v.id)} = ${pretty(r.before[v.id])}`).join(', '),
    actor: r.actor, action: r.action,
    reason: r.reason === 'conflict' ? 'two documented rules give different outcomes' : r.reason === 'unspecified_outcome' ? 'the action is allowed but its outcome is not stated' : 'no documented rule covers this situation',
    quotes: r.evidence.map((e) => e.quote).slice(0, 4),
  };
  try {
    const res = await fetch('/api/question', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ctx }) });
    const data = await res.json();
    S.draft = { text: data.text, source: data.source === 'model draft' ? `draft by ${data.model}` : 'template (model unavailable)' };
  } catch {
    S.draft = { text: `In ${ctx.state}, what should happen when ${ctx.actor} tries "${ctx.action}"?`, source: 'template (network error)' };
  }
  render();
}

// ---------------- Questions ----------------

function markdown() {
  const m = S.extraction?.model;
  const lines = [
    '# Open questions from Spec Gap Replay', '',
    `Source: ${S.doc.kind} · sha256 ${S.doc.hash}`,
    `Extraction: ${S.extraction?.recorded ? `recorded run ${S.extraction.recorded_at}` : `run ${S.extraction?.ran_at || ''}`} · structural checks passed · rules reviewed by a person`, '',
  ];
  S.questions.forEach((q, i) => {
    lines.push(`## ${i + 1}. ${q.text}`, '', `Question source: ${q.source}`, `Run: ${q.run.id} · ${q.run.extraction} · ${q.run.included_rules} reviewed rules included`, `Started from: ${m ? m.variables.map((v) => `${label(m.variables, v.id)} = ${pretty(q.run.start.state[v.id])}`).join(', ') : ''}`, '', 'Path that reached this point:');
    q.path.forEach((p, j) => lines.push(`${j + 1}. ${p.actor} → ${p.action} → ${p.label || 'Input check'}`));
    lines.push('', `Stopped in state: ${m ? m.variables.map((v) => `${label(m.variables, v.id)} = ${pretty(q.state[v.id])}`).join(', ') : ''}`);
    const set = Object.entries(q.settings || {}).map(([k, v]) => `${label(m?.settings, k)} ${v ? 'on' : 'off'}`).join(', ');
    if (set) lines.push(`Settings: ${set}`);
    const inp = Object.entries(q.inputs || {}).map(([k, v]) => `${label(m?.inputs, k)} = ${v}`).join(', ');
    if (inp) lines.push(`Inputs: ${inp}`);
    lines.push('', 'Related source text:');
    q.evidence.forEach((e) => lines.push(`> ${e.quote} (document line ${e.line})`));
    lines.push('');
  });
  if (!S.questions.length) lines.push('No open questions on the paths tried. This does not mean the document is complete.');
  return lines.join('\n');
}

function viewQuestions() {
  if (!S.questions.length) {
    return `<h1 class="hero">No open questions yet.</h1><p class="lede">No open questions on the paths you tried. This does not mean the document is complete.</p>`;
  }
  const m = S.extraction?.model;
  return `
    <h1 class="hero">${S.questions.length} question${S.questions.length > 1 ? 's' : ''} for the document owner.</h1>
    <div class="foot" style="margin:0 0 6px"><span class="faint">Each question carries the exact path and source text that led to it.</span>
      <span style="display:flex;gap:10px"><button class="btn" id="copymd">Copy Markdown</button><button class="btn primary" id="dlmd">Download .md</button></span></div>
    <div class="qlist">${S.questions.map((q, i) => `
      <div class="q">
        <div class="qt">${esc(q.text)}</div>
        <div class="qm">${esc(q.path.map((p) => `${p.actor.split(' · ')[0]} ${p.action}`).join(' → '))} · stopped at ${esc(m ? m.variables.map((v) => pretty(q.state[v.id])).join(' · ') : '')}</div>
        ${q.evidence.slice(0, 2).map((e) => `<p class="quote" style="font-size:15px">${esc(e.quote)}</p><div class="cite">line ${esc(e.line)}</div>`).join('')}
        <div class="src" style="margin-top:8px">${esc(q.source)} · <button class="pill small" data-del="${i}">Remove</button></div>
      </div>`).join('')}</div>`;
}

function bindQuestions() {
  document.getElementById('copymd')?.addEventListener('click', async () => { await navigator.clipboard.writeText(markdown()); toast('Markdown copied'); });
  document.getElementById('dlmd')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
    a.download = 'spec-gap-questions.md';
    a.click();
  });
  $view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { S.questions.splice(Number(b.dataset.del), 1); render(); }));
}

// ---------------- Shell ----------------

function renderChrome() {
  document.querySelectorAll('#steps button').forEach((b) => {
    const s = b.dataset.step;
    b.classList.toggle('on', s === S.step);
    b.disabled = (s === 'verify' && !S.extraction && !S.loading) || (s === 'replay' && !S.state) || (s === 'questions' && !S.state && !S.questions.length);
  });
  document.getElementById('qcount').textContent = S.questions.length ? `· ${S.questions.length}` : '';
  const chip = document.getElementById('srcchip');
  chip.innerHTML = S.doc.text ? `${esc(S.doc.kind)} · <span class="mono">${esc(short(S.doc.hash))}</span>` : '';
}

function render() {
  renderChrome();
  const views = { document: [viewDocument, bindDocument], verify: [viewVerify, bindVerify], replay: [viewReplay, bindReplay], questions: [viewQuestions, bindQuestions] };
  const [view, bind] = views[S.step];
  $view.innerHTML = view();
  bind();
}

document.querySelectorAll('#steps button').forEach((b) => b.addEventListener('click', () => go(b.dataset.step)));

(async () => {
  try {
    S.samples = await (await fetch('/api/samples')).json();
  } catch { S.samples = []; }
  render();
})();
