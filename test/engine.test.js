import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluate, initialState, LABELS } from '../src/engine.js';
import { validateModel } from '../src/validate.js';
import { githubModel, syntheticModels } from './models.js';

const dir = new URL('./contracts/', import.meta.url);
const gh = JSON.parse(readFileSync(new URL('demo-github-deployments-v1.json', dir)));
const syn = JSON.parse(readFileSync(new URL('demo-spec-gap-v1.json', dir)));
const ghInput = readFileSync(new URL('github-deployments-v1/input.md', dir), 'utf8');
const synText = (name) => readFileSync(new URL(`spec-gap-v1/${name}.md`, dir), 'utf8');

test('GitHub input bytes match the frozen contract hash', () => {
  const hash = createHash('sha256').update(readFileSync(new URL('github-deployments-v1/input.md', dir))).digest('hex');
  assert.equal(hash, gh.input.sha256);
});

test('reviewed GitHub model passes structural validation against the real input', () => {
  const m = structuredClone(githubModel);
  const res = validateModel(m, ghInput);
  assert.deepEqual(res.errors, []);
});

test('reviewed synthetic models pass structural validation', () => {
  for (const [name, model] of Object.entries(syntheticModels)) {
    const res = validateModel(structuredClone(model), synText(name));
    assert.deepEqual(res.errors, [], name);
  }
});

// --- G01-G08: real GitHub Docs input ---------------------------------------

function ghActor(setup, actorId) {
  const roles = [];
  if ((setup.required_reviewers || []).includes(actorId)) roles.push('reviewer');
  if (actorId === 'authorized_administrator') roles.push('admin');
  return { id: actorId, roles, relations: { initiated_run: setup.initiator === actorId } };
}

for (const sc of gh.scenarios) {
  test(`${sc.id} ${sc.name}`, () => {
    const s = sc.setup;
    const state = initialState(githubModel, {
      job_state: s.job_state,
      review_decision: s.review_decision ? 'approved' : 'not_approved',
      environment_secrets_eligible: s.environment_secrets_eligible,
    });
    const settings = {
      prevent_self_review: s.prevent_self_review,
      allow_admin_bypass: s.allow_admin_bypass ?? true,
      other_rules_passed: s.other_protection_rules_passed,
    };
    const act = sc.action || sc.actions;
    const action = { 'Approve and deploy': 'approve', Reject: 'reject', 'bypass deployment protection rules': 'bypass' }[act.action];
    const res = evaluate({ model: githubModel, state, settings, actor: ghActor(s, act.actor), action });
    const e = sc.expected;
    assert.equal(res.label, e.classification);
    for (const key of ['job_state', 'review_decision', 'workflow_state', 'job_may_proceed', 'environment_secrets_eligible']) {
      if (key in e) assert.equal(res.state[key], e[key], key);
    }
    if (sc.id === 'G06') assert.equal(res.state.environment_secrets_eligible, state.environment_secrets_eligible, 'bypass must not change secrets');
    if (res.classification !== 'defined') assert.deepEqual(res.state, state, 'blocked actions leave state unchanged');
  });
}

// --- Synthetic conformance controls (business-layer cases) ------------------

const OUTCOME = { defined: 'defined', forbidden: 'forbidden', needs_clarification: 'needs_clarification' };

for (const sc of syn.scenarios.filter((c) => Array.isArray(c.expected?.outcomes))) {
  test(`${sc.id} ${sc.name}`, () => {
    const model = syntheticModels[sc.fixture];
    let state = initialState(model, { status: sc.setup.status });
    const statuses = [];
    const outcomes = [];
    for (const a of sc.actions) {
      const res = evaluate({ model, state, settings: {}, actor: { id: a.actor, roles: [a.actor], relations: {} }, action: a.action, inputs: { units: sc.setup.units } });
      outcomes.push(res.classification);
      statuses.push(res.state.status);
      state = res.state;
    }
    assert.deepEqual(outcomes, sc.expected.outcomes.map((o) => OUTCOME[o]));
    assert.deepEqual(statuses, sc.expected.statuses);
    if (sc.id === 'C07') {
      const res = evaluate({ model, state: initialState(model, { status: 'pending' }), settings: {}, actor: { roles: ['reviewer'], relations: {} }, action: 'approve', inputs: { units: 80 } });
      const ids = res.evidence.map((r) => r.id).sort();
      assert.deepEqual(ids, ['R3', 'R6'], 'conflict shows both rules');
    }
  });
}

test('C18 non-integer units are rejected without rounding', () => {
  const model = syntheticModels.complete;
  const state = initialState(model);
  const res = evaluate({ model, state, settings: {}, actor: { roles: ['requester'], relations: {} }, action: 'submit', inputs: { units: 80.5 } });
  assert.equal(res.classification, 'invalid_input');
  assert.equal(res.label, null);
  assert.equal(res.state.status, 'draft');
});

test('unknown action is Out of scope, not a gap', () => {
  const model = syntheticModels.complete;
  const res = evaluate({ model, state: initialState(model), settings: {}, actor: { roles: ['requester'], relations: {} }, action: 'send_payment' });
  assert.equal(res.label, LABELS.unsupported);
});

test('excluded rules are not executed', () => {
  const model = syntheticModels.complete;
  const included = new Set(model.rules.concat(model.prohibitions).map((r) => r.id).filter((id) => id !== 'R1'));
  const res = evaluate({ model, included, state: initialState(model), settings: {}, actor: { roles: ['requester'], relations: {} }, action: 'submit', inputs: { units: 80 } });
  assert.equal(res.state.status, 'draft');
});

test('R2 rules that set different variables merge instead of conflicting', () => {
  const m = structuredClone(syntheticModels.complete);
  m.variables.push({ id: 'audit', values: ['none', 'logged'], initial: 'none' });
  m.rules.push({ id: 'R3-audit', action: 'approve', roles: ['reviewer'], when: [{ var: 'status', op: 'eq', value: 'pending' }], effect: { audit: 'logged' }, quote: 'x' });
  m.rules.push({ id: 'R3-dup', action: 'approve', roles: ['reviewer'], when: [{ var: 'status', op: 'eq', value: 'pending' }, { input: 'units', op: 'lte', value: 100 }], effect: { status: 'approved' }, quote: 'x' });
  const res = evaluate({ model: m, state: initialState(m, { status: 'pending' }), settings: {}, actor: { roles: ['reviewer'], relations: {} }, action: 'approve', inputs: { units: 80 } });
  assert.equal(res.classification, 'defined');
  assert.equal(res.state.status, 'approved');
  assert.equal(res.state.audit, 'logged');
});

test('R2 G06-style result reports which variables the rule did not decide', () => {
  const res = evaluate({
    model: githubModel, state: initialState(githubModel), actor: { roles: ['admin'], relations: {} }, action: 'bypass',
    settings: { prevent_self_review: true, allow_admin_bypass: true, other_rules_passed: true },
  });
  assert.equal(res.classification, 'defined');
  assert.ok(res.undecided.includes('environment_secrets_eligible'));
  assert.ok(res.undecided.includes('review_decision'));
});

test('R3 excluding a rule is a review state, not a document gap', () => {
  const model = syntheticModels.complete;
  const included = new Set(model.rules.concat(model.prohibitions).map((r) => r.id).filter((id) => id !== 'R1'));
  const res = evaluate({ model, included, state: initialState(model), settings: {}, actor: { roles: ['requester'], relations: {} }, action: 'submit', inputs: { units: 80 } });
  assert.equal(res.classification, 'excluded_by_review');
  assert.equal(res.label, null);
});
