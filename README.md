# Spec Gap Replay

Walk a spec's documented paths. Stop where the document can't decide.

Developers get a PRD or policy document and start building. The normal path is clear. The edge cases are not, and they surface weeks later as bugs or Slack threads. Spec Gap Replay turns the document into a workflow you can click through, and it never fills a gap with a guess.

## How it works

1. **Document.** Paste a non-sensitive spec, PRD or policy document.
2. **Verify.** Gemini 4 Argon extracts states, settings, roles, actions, rules and prohibitions, each with a quote. Code checks every quote against the source and every reference in the model. Failed checks go back to Argon for repair, at most 3 calls in total. Infrastructure errors are never retried automatically. A person then includes or excludes each rule.
3. **Replay.** Pick who is acting, flip the document's settings, and press the document's own buttons. Code decides every outcome:
   - **Defined:** a reviewed rule decides the result and the state changes.
   - **Blocked by document:** a quoted prohibition, an unmet condition, or another role's action. Not a gap.
   - **Needs decision:** no rule covers this state, the rule doesn't say what it changes, or two rules conflict. Nothing changes.
   - **Out of scope:** the action isn't part of the extracted workflow.
4. **Questions.** For a Needs decision result, a fast Gemini model drafts a neutral question. You edit it and add it. Export Markdown with the exact path, state, settings and source quotes.

The model never decides outcomes. Passing the quote checks proves the text exists in the source. It does not prove the meaning is right, which is why a person reviews the rules.

## Run locally

```bash
npm install
GEMINI_API_KEY=... npm start   # http://localhost:8080
npm test                       # engine and repair-loop tests against frozen criteria
```

Models: `gemini-4-argon` for extraction (Interactions API), `gemini-3.8-flash` for question drafts. Override with `EXTRACT_MODEL` and `QUESTION_MODEL`.

## Deploy (Google Cloud Run)

```bash
gcloud run deploy spec-gap-replay --source . --region asia-northeast3 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest --allow-unauthenticated
```

## Sample documents and attribution

- `test/contracts/github-deployments-v1/input.md` contains GitHub Docs pages on deployment review, pinned to commit `cb051611377a0d2904411e6157154e9b4953d870`. © GitHub and contributors, licensed [CC BY 4.0](test/contracts/github-deployments-v1/LICENSE-CC-BY-4.0.txt). Changes: concatenation, packaging headings, and front-matter removal only. Sources and hashes are in `manifest.json`.
- `test/contracts/spec-gap-v1/*.md` are authored test specs, not real PRDs.
- `samples/runs/` holds a recorded real extraction run. The app only shows it with its original timestamp.

Built at the Google DeepMind AI Hackathon, Seoul, 2026-10-16.
