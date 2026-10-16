import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize as normPath } from 'node:path';
import { geminiProvider, extractWithRepair, draftQuestion, templateQuestion, sha256, InfraError, EXTRACT_MODEL, QUESTION_MODEL } from './src/extract.js';

const PORT = Number(process.env.PORT || 8080);
const ROOT = new URL('.', import.meta.url).pathname;
const PUBLIC = join(ROOT, 'public');
const MAX_BODY = 2_000_000;
const provider = process.env.GEMINI_API_KEY ? geminiProvider(process.env.GEMINI_API_KEY) : null;

const SAMPLES = [
  { id: 'github', title: 'GitHub Docs · deployment review', kind: 'Public documentation · CC BY 4.0', file: 'test/contracts/github-deployments-v1/input.md' },
  { id: 'contradiction', title: 'Test spec · conflicting approval rules', kind: 'Authored test spec · not a real PRD', file: 'test/contracts/spec-gap-v1/contradiction.md' },
  { id: 'missing-outcome', title: 'Test spec · approval outcome missing', kind: 'Authored test spec · not a real PRD', file: 'test/contracts/spec-gap-v1/missing-outcome.md' },
];

// Recorded real extraction runs, shown only with their original timestamp and interaction ids.
const RECORDED = new Map();
const runDir = join(ROOT, 'samples', 'runs');
if (existsSync(runDir)) {
  for (const f of readdirSync(runDir).filter((x) => x.endsWith('.json'))) {
    const run = JSON.parse(readFileSync(join(runDir, f), 'utf8'));
    RECORDED.set(run.source_hash, run);
  }
}

// Structural checks can pass on an empty model. Without actions and rules there is nothing to replay.
function isReplayable(model) {
  return Boolean(model && !model.unsupported && model.actions?.length && (model.rules?.length || model.prohibitions?.length));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': type.startsWith('application/json') ? 'no-store' : 'public, max-age=60',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Document is too large (2 MB max).'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Request body is not JSON.'), { status: 400 }); }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, extract_model: EXTRACT_MODEL, question_model: QUESTION_MODEL, provider: provider ? 'gemini' : 'none' });
    }

    if (req.method === 'GET' && url.pathname === '/api/samples') {
      const out = [];
      for (const s of SAMPLES) {
        const text = await readFile(join(ROOT, s.file), 'utf8');
        out.push({ id: s.id, title: s.title, kind: s.kind, text, sha256: sha256(text), recorded: RECORDED.has(sha256(text)) ? RECORDED.get(sha256(text)).recorded_at : null });
      }
      return send(res, 200, out);
    }

    if (req.method === 'POST' && url.pathname === '/api/extract') {
      const { text, useRecorded } = await readJson(req);
      if (typeof text !== 'string' || !text.trim()) {
        return send(res, 400, { status: 'invalid_input', message: 'Paste a non-empty document first.' });
      }
      const hash = sha256(text);
      if (useRecorded && RECORDED.has(hash)) return send(res, 200, { ...RECORDED.get(hash), recorded: true });
      if (!provider) return send(res, 503, { status: 'infra_error', message: 'No model provider configured on the server.' });
      const result = await extractWithRepair(provider, text);
      if (result.status === 'passed' && !isReplayable(result.model)) result.status = 'unsupported';
      return send(res, 200, { ...result, recorded: false, ran_at: new Date().toISOString() });
    }

    if (req.method === 'POST' && url.pathname === '/api/question') {
      const { ctx } = await readJson(req);
      if (!ctx || typeof ctx.action !== 'string') return send(res, 400, { message: 'Missing question context.' });
      if (!provider) return send(res, 200, { source: 'template', text: templateQuestion(ctx) });
      try {
        const q = await draftQuestion(provider, ctx);
        if (!q.text) throw new InfraError('empty response');
        return send(res, 200, { source: 'model draft', ...q });
      } catch (err) {
        return send(res, 200, { source: 'template', text: templateQuestion(ctx), error: String(err.message).slice(0, 200) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/engine.js') {
      return send(res, 200, await readFile(join(ROOT, 'src', 'engine.js')), TYPES['.js']);
    }

    if (req.method === 'GET') {
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = normPath(join(PUBLIC, path));
      if (!file.startsWith(PUBLIC) || !existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
    }

    send(res, 405, { message: 'Method not allowed' });
  } catch (err) {
    send(res, err.status || 500, { status: 'infra_error', message: err.status ? err.message : 'Server error.' });
    if (!err.status) console.error(err);
  }
});

server.requestTimeout = 600_000;
server.listen(PORT, () => console.log(`Spec Gap Replay on :${PORT} (provider: ${provider ? 'gemini' : 'none'})`));
