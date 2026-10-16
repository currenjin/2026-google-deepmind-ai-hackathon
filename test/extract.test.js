import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractWithRepair, InfraError, MAX_ATTEMPTS } from '../src/extract.js';
import { syntheticModels } from './models.js';

const source = readFileSync(new URL('./contracts/spec-gap-v1/complete.md', import.meta.url), 'utf8');
const good = JSON.stringify(syntheticModels.complete);
const fabricated = (() => {
  const m = structuredClone(syntheticModels.complete);
  m.rules[0].quote = 'Submitting always succeeds instantly.';
  return JSON.stringify(m);
})();

function fakeProvider(outputs) {
  const calls = [];
  return {
    calls,
    extract: async (args) => {
      calls.push(args);
      const next = outputs[calls.length - 1];
      if (next instanceof Error) throw next;
      return { id: `i${calls.length}`, text: next, model: 'fake' };
    },
  };
}

test('C19 persistent failure stops after exactly 3 total calls', async () => {
  const p = fakeProvider([fabricated, fabricated, fabricated, good]);
  const res = await extractWithRepair(p, source);
  assert.equal(p.calls.length, MAX_ATTEMPTS);
  assert.equal(res.status, 'unverified');
  assert.equal(res.attempts.length, 3);
  assert.ok(res.attempts.every((a) => a.failed > 0));
});

test('C21 repair passes only after full revalidation, then stops early', async () => {
  const p = fakeProvider([fabricated, good]);
  const res = await extractWithRepair(p, source);
  assert.equal(p.calls.length, 2);
  assert.equal(res.status, 'passed');
  assert.equal(p.calls[1].previousId, 'i1');
  assert.ok(p.calls[1].errors.some((e) => /Quote not found/.test(e.message)));
  assert.equal(res.attempts[1].failed, 0);
});

test('C11 fabricated citation fails validation', async () => {
  const p = fakeProvider([fabricated, fabricated, fabricated]);
  const res = await extractWithRepair(p, source);
  assert.ok(res.attempts[0].errors.some((e) => /Quote not found/.test(e.message)));
});

test('C12 infra error is not retried automatically', async () => {
  const p = fakeProvider([new InfraError('timeout: provider timed out', 'timeout'), good]);
  const res = await extractWithRepair(p, source);
  assert.equal(p.calls.length, 1);
  assert.equal(res.status, 'infra_error');
  assert.equal(res.attempts[0].infra_error, 'timeout');
});

test('every attempt is bound to the same source hash', async () => {
  const p = fakeProvider([fabricated, good]);
  const res = await extractWithRepair(p, source);
  assert.equal(new Set(res.attempts.map((a) => a.source_hash)).size, 1);
});
