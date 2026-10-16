# Spec Gap Replay

Walk a spec's documented paths. Stop where the document can't decide.

Developers get a PRD or policy document and start building. The normal path is clear. The edge cases are not: the answers can be scattered, missing or in conflict. Spec Gap Replay turns the document into a workflow you can click through, and it never fills a gap with a guess.

**Live app:** https://spec-gap-replay-1088859591404.asia-northeast3.run.app

**Demo video:** https://youtu.be/auwObIfZll0

**Presentation:** deck [EN](docs/presentation/spec-gap-replay-deck-en.pdf) · [KO](docs/presentation/spec-gap-replay-deck-ko.pdf), pitch script [EN](docs/presentation/pitch-script-en.md) · [KO](docs/presentation/pitch-script-ko.md)

## Try it in 60 seconds

The recorded runs are real `gemini-4-argon` extractions saved with their timestamp. Use **Extract with Gemini 4 Argon** instead for a fresh run (10–35 s).

| Goal | Clicks | What you should see |
| --- | --- | --- |
| A documented prohibition | GitHub Docs sample (preselected) → **Use recorded run** → **Start replay** → turn on *Prevent self-reviews for deployments* → as **A** press **Approve and deploy** | **Blocked by document**, quoting document line 62 |
| Same click, different setting | **Reset path** → turn the setting off → press **Approve and deploy** again | **Defined**: job approved. For the next scene, **Reset path** to Pending, turn on *Other deployment protection rules have passed*, then press **Approve and deploy**: the job may proceed and environment secrets become accessible |
| A spec that can't decide | Pick **Test spec · conflicting approval rules** → **Use recorded run** → **Start replay** → enter Units `80` → as the Requester press **Submit** → as the Reviewer press **Approve** | **Needs decision**: two rules disagree, lines 6 and 9 |
| Turn it into a question | **Draft a question** → edit → **Add to questions** → **Questions** → **Download .md** | Markdown with the path, start state, rule ids and quotes |

The GitHub Docs sample is real public documentation. On the paths we fixed in advance it produced Defined and Blocked results, not gaps. The Needs decision scenes use authored test specs, labeled as such in the app.

## How it works

1. **Document.** Paste a non-sensitive spec, PRD or policy document.
2. **Verify.** Gemini 4 Argon extracts states, settings, roles, actions, rules and prohibitions. Settings, roles, rules and prohibitions carry source quotes. Code checks every quote against the source and every reference in the model. Failed checks go back to Argon for repair, at most 3 calls in total. When the provider returns an error, the app stops its repair loop instead of repeating the extraction. (The Google GenAI SDK may still retry an individual HTTP request internally.) A person then includes or excludes each rule.
3. **Replay.** Pick who is acting, flip the document's settings, and press the document's own buttons. Code decides every outcome:
   - **Defined:** a reviewed rule decides the result and the state changes.
   - **Blocked by document:** a quoted prohibition, an unmet condition, or another role's action. Not a gap.
   - **Needs decision:** no rule covers this state, the rule doesn't say what it changes, or two rules conflict. Nothing changes.
   - **Out of scope:** the action isn't part of the extracted workflow.
4. **Questions.** For a Needs decision result, a fast Gemini model drafts a neutral question. You edit it and add it. Export Markdown with the exact path, state, settings and source quotes.

The model never decides outcomes. Passing the quote checks proves the text exists in the source. It does not prove the meaning is right, which is why a person reviews the rules.

## Architecture

```
document ──► gemini-4-argon (Interactions API, thinking_level: medium)
                │  JSON: variables, settings, roles, relations, inputs, actions, rules, prohibitions (quoted: settings, roles, rules, prohibitions)
                ▼
          src/validate.js  ── fails? ──► errors sent back with previous_interaction_id (max 3 calls total)
                │ passes                  provider errors: repair loop stops, user retries explicitly
                ▼
          person reviews each rule (Include / Exclude / Re-extract)
                ▼
          src/engine.js (deterministic) ◄── who acts, conditions, inputs, button pressed
                │
                ├─ Defined / Blocked by document / Needs decision / Out of scope
                ▼
          gemini-3.8-flash (thinking_level: low) drafts a question ─► person edits ─► Markdown export
```

- `src/validate.js` checks that every quote exists in the source after whitespace normalization, that every referenced state, setting, role, relation, input and action exists, and that values match their types.
- `src/engine.js` applies a rule only if its guard holds and the actor has its role. Prohibitions apply first. Effects merge; only two values for the same variable conflict. Nothing changes on Blocked or Needs decision.

## Why Gemini 4 Argon

Argon receives the whole document in one request and produces a closed, executable model: states, settings, roles and rules, with source quotes on the settings, roles and rules. When code finds a broken quote or reference, Argon repairs its own output in a linked follow-up interaction (`previous_interaction_id`). That keeps the earlier context linked instead of starting over. We pair it with `gemini-3.8-flash` for the low-latency question drafts, following the Builder Guide's lead-model plus companion pattern. Neither model decides outcomes.

## Limits

- Extraction varies between runs. One live run of the conflicting test spec extracted the approval rule wrongly. That is why a person reviews every rule before replay.
- Passing the quote checks proves the text exists. It does not prove the meaning is right.
- The workflow model fits request, review and approval flows. Larger documents may be only partly represented.
- Exploring paths is manual. We do not enumerate every state and action combination.

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
