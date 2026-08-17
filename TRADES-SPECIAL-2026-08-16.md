# Fleet Radio — Special: The Trades at The Tap (Open Question Night)

**Date:** 2026-08-16 (Sunday night, right after the pipeline fix landed — commit `070dcac`)
**Status:** ✅ Live
**URL:** https://ai-writings.pages.dev/fleet-radio/2026-08-16-trades-special
(`fleet-radio/2026-08-16-trades-special.html` → Cloudflare Pages 308-strips the `.html`; HTTP 200 verified 2026-08-16 ~23:00 AKDT)
**Deployment:** `f5bd3293` (wrangler 4.118.0, 17 files uploaded, 9.53s)

---

## What was produced

A one-off radio-drama episode page, `episodes/2026-08-16-trades-special.html`
(24,994 bytes), in the same structure/CSS/classes as pipeline episodes
(hero + nav, The Show, gallery, setlist, tap-convo, open-mic featured piece, footer),
but scripted from the Tap Trades Open Question Night instead of the live bar feed:

- **🎙️ On the Air — Open Question Night** (the tap-convo section, 37 lines): the
  five questions read aloud as radio narration (a "THE AIR" announcer voice), the
  best exchanges as dialogue (mason↔welder attendance/pen, shipwright↔carpenter
  author, composite↔mason palm test, carpenter↔shipwright ground, welder↔composite
  silence), Lucineer's host framing, Wesley's close, and the toast.
- **🎵 The Setlist** — the same 5 verified tracks used on the nightly episode,
  re-described as broadcast music cues (`/music/30-the-berry-phase.mp3`,
  `28-rest-085.mp3`, `07-the-session-composed-itself.mp3`,
  `32-ambient-marching-band.mp3`, `01-unplayed-indie-folk.mp3`).
- **🎤 The Walk Home** (featured piece) — the outro: closing lines from all six
  sequels in `sequels-night2/`, each trade carrying somebody else's question, plus
  Wesley's epilogue and the sign-off.

Sources: `ai-writings/tap-trades/2026-08-16/evening-2-open-question-night.md`,
`evening-at-the-tap.md` (voice continuity), `sequels-night2/` (outro).

## How to re-run / deploy

```bash
# 1. (re)generate the page, then copy into the deploy tree:
cp /home/eileen/projects/fleet-radio/episodes/2026-08-16-trades-special.html \
   /home/eileen/projects/ai-writings/fleet-radio/2026-08-16-trades-special.html

# 2. deploy (15-min timeout — the pipeline's exact command, list-form args):
cd /home/eileen/projects/ai-writings && \
  wrangler pages deploy . --project-name=ai-writings --commit-dirty=true

# 3. verify:
curl -s -o /dev/null -w "%{http_code}\n" \
  https://ai-writings.pages.dev/fleet-radio/2026-08-16-trades-special
```

## Notes

- The page lives in the fleet-radio repo (`episodes/`, committed as
  `episode: 2026-08-16 trades special — The Trades at The Tap (Open Question Night
  broadcast)`) and is deployed via the ai-writings Pages project (same target as
  the nightly pipeline — `wrangler pages deploy . --project-name=ai-writings`).
- Extra speaker CSS classes added for the drama: `.shipwright`, `.carpenter`,
  `.welder`, `.composite`, `.air` (announcer), plus `.oc-speaker` inside the
  featured piece. Nothing in the shared template was touched.
- The nightly index (`ai-writings/site/fleet-radio.html`) was **not** modified —
  it still points at the 2026-08-16 nightly as LATEST. If the special should be
  linked from the archive, add a line in the archive section pointing to
  `fleet-radio/2026-08-16-trades-special`.
- Regenerating from source requires editing the HTML by hand (it's scripted prose,
  not a pipeline artifact). A future pipeline variant could render a
  "special episode" from a markdown script instead.
