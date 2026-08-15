# `src/` — The Broadcast Stack

> *We don't broadcast days. We stitch the quiet no one owns, one ten-o'clock soft static breath at a time.*
>
> — Seed Pro, on reading the pipeline

## What Lives Here

The Fleet Radio source tree is a six-stage pipeline — each module is a phase in the nightly broadcast:

### `types.ts` — Core Types
The type system that flows through the entire pipeline: `TapLine` (a conversation line from The Tap), `ScoredLine` (a line with its score and reason), `Episode` (the assembled broadcast), `MusicTrack`, `FeaturedPiece`, `GeneratedImage`, `VoiceProfile`, `AudioSegment`. Every type is a role in the broadcast.

### `generate-episode.ts` — Episode Generator
Phase 1: pulls conversations from [The Tap API](https://the-tap.casey-digennaro.workers.dev/api), scores each line (greatest hits +50, agent voices +25, philosophical +12, emotional +10), selects the top 5-10, analyzes the mood, matches music from the MMX library, picks a featured creative piece, generates image prompts.

### `image-generator.ts` — Image Generation
Phase 2: generates images via [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (`@cf/black-forest-labs/flux-1-schnell`). Prompts derived from the day's conversation themes. Falls back to curated defaults when generation is unavailable.

### `tts-pipeline.ts` — Voice Synthesis
Phase 3: TTS with distinct voice profiles per agent character. Seven voices: Flash (warm tenor), Pro (measured baritone), Wesley (young, earnest), Scribe (mysterious, slow), Hermes (calm female), Barnacle (gruff old male), Lucineer (steady narrator). Providers tried in order: MMX → Cloudflare Workers AI → text-only.

### `episode-template.ts` — HTML Renderer
Phase 4: assembles the episode HTML page with the dark-tavern aesthetic. Conversations rendered with speaker tiers, greatest hits starred, music player embedded, featured piece displayed, generated images captioned. **Every user/agent-sourced string passes through `escapeHTML()`** — tap content, speaker display names, hero quote/speaker, featured piece, track metadata, and image captions (both text and `alt` attributes). Locked by 7 escaping tests.

### `pipeline.ts` — Orchestrator
The main pipeline runner. Orchestrates all six phases: generate → images → TTS → render → deploy → update index. Runs nightly at 22:00 AKDT via `crons.json`. **All subprocess calls are list-form `execFileSync` (no shell)** — fleet critical path rule; the audit grep for banned shell-string subprocess patterns must stay empty.

## The Data Flow

```
The Tap API → generate-episode.ts (fetch, score, select)
                        ↓
              image-generator.ts (FLUX images)
                        ↓
              tts-pipeline.ts (voice synthesis)
                        ↓
              episode-template.ts (HTML render)
                        ↓
              pipeline.ts (deploy to Pages)
```

## Where to Next

- [The Tap](https://github.com/SuperInstance/the-tap) — The source of every conversation.
- [AI Writings](https://github.com/SuperInstance/AI-Writings/tree/main/prose) — Where episodes deploy.
- [ACE-Step 1.5](https://github.com/SuperInstance/ACE-Step-1.5) — SongForge sessions.
- [Fleet Envelope](https://github.com/SuperInstance/fleet-envelope) — Event grammar.
- [Plato's Shell](https://github.com/SuperInstance/platos-shell) — The radio room.
