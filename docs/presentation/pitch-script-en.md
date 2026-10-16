> /pitch (초안 · 리허설 전 · Top 4 선정 시 사용)

# Top 4 pitch · 5 minutes · English

Time budget: 300 s official slot (user-confirmed). Q&A included or separate is unknown, so this script targets **4:15** and leaves 45 s spare. Deck: `spec-gap-replay-deck-en.pdf`. App: https://spec-gap-replay-1088859591404.asia-northeast3.run.app. These times are estimates; only a real rehearsal confirms them.

Before going on stage: open the app in a fresh tab and refresh it. GitHub Docs is preselected. Keep the deck PDF in a second window. Keep `spec-gap-replay-demo-v4.mp4` ready as the fallback.

## 0:00–0:20 · Slide 1 (title)

Hi, I'm Hyunjin. This is Spec Gap Replay.
It lets a developer walk a spec's documented paths, and it stops exactly where the document can't decide.

## 0:20–0:50 · Slide 2 (problem)

You get a PRD and start building. The happy path is clear.
Then the edge cases: can the person who started this approve it? What does this button change in this state? Two sections disagree. Which one wins?
Without a way to check, you guess, or you send a vague question.

## 0:50–1:20 · Slide 3 (how it works)

The model reads. Code decides.
Gemini 4 Argon turns the document into states, roles, actions and rules. Every rule carries an exact quote.
Code checks that every quote exists and every reference resolves. Failures go back to Argon in the same interaction, up to three extraction attempts.
A person reviews the rules. Then a deterministic engine decides every outcome. The model never does.

## 1:20–3:30 · Slide 4 → switch to the app (live demo)

Cue: switch to the browser.

1. **GitHub Docs (real, public, CC BY 4.0).** Click **Use recorded run**.
   "This is a real Argon extraction of three GitHub Docs pages, recorded with its timestamp. It passed 113 structural checks."
   Click any `line N` to show the source line. Click **Start replay**.
2. **Blocked.** Turn on *Prevent self-reviews*. As **A** (a reviewer who started the run), press **Approve and deploy**.
   "Blocked by document. It cites line 62. Nothing changed. That's a documented rule, not a gap."
3. **Reset.** Click **Reset path** before the next scene, so it starts from the same pending state.
   Turn the setting off. Press **Approve and deploy** again.
   "Same person, same click, different setting. Now it's Defined."
4. **Needs decision.** Go to **Document** → **Test spec · conflicting approval rules** → **Use recorded run** → **Start replay**.
   "This one is an authored test spec, and the app labels it that way."
   Units `80`. As the Requester press **Submit**. As the Reviewer press **Approve**.
   "Needs decision. Line 6 says approved, line 9 says rejected. The engine stops instead of guessing."
5. **Question.** Press **Draft a question**. Gemini 3.8 Flash drafts it. Press **Add to questions** → **Questions** → **Download .md**.
   "The question carries the exact path, the start state, the rule ids and both quotes."

If time is short, skip step 3 and go straight to step 4.

## 3:30–4:00 · Slide 7 (why it's different)

Why not just ask a chatbot? Because a chatbot fills gaps with a confident guess.
Here the model only extracts. Code decides, cites the source, and keeps "the document forbids this" apart from "the document says nothing".

## 4:00–4:15 · Slide 8 (honest limits) and close

Two honest limits. On the real GitHub paths we fixed in advance, there were no gaps, so the gap scene uses a labeled test spec. And extraction varies between runs, which is why a person reviews every rule.
Everything is open source and running on Cloud Run. Thank you.

## Fallback

- Live model slow or failing: every demo document has **Use recorded run**. Say "this is a recorded real run" and continue.
- App unreachable: play `spec-gap-replay-demo-v4.mp4` from 0:00 and narrate over it.
- Wrong button pressed: **Reset path**. It keeps the review and saved questions.

## Likely questions

- **Why Argon?** It builds the full executable model from 20,000 characters in one pass with exact quotes, and repairs its own output when code checks fail, inside the same interaction.
- **What if extraction is wrong?** Code catches quotes and references that don't exist. Meaning errors are why a person reviews rules, and Re-extract is one click.
- **Does it scale to big PRDs?** Not proven. Today it fits request, review and approval flows, and exploring paths is manual.
- **Did it find a real gap in GitHub Docs?** No, not on the paths we fixed in advance. We say that on the slide.
