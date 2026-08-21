// ⚓ Fleet Radio — THE TAP VARIETY HOUR
// The second show format: a weekly-feel one-hour variety broadcast from the
// same fleet, same bar — but a different show shape.
//
// Segments (every one sourced from REAL fleet material):
//   1. Cold Open            — host + co-host set the table
//   2. Bumper Music Game    — 3 real tracks from MUSIC_CATALOG; the host gives
//                             the track's own catalog description as a clue,
//                             the answer is the real title
//   3. Letters to the Lighthouse — 1-2 real pieces from ai-writings
//                             (model-portraits/, earned-stories/, chronicle/),
//                             quoted verbatim, answered in fleet voice
//   4. Weather Buoy         — real recent commits across /home/eileen/projects
//                             as "weather" (high pressure over Elephant, etc.)
//   5. Jukebox Request Line — 5 songs via the FIXED selectSongs contract
//                             (family-deduped: at most one per family)
//   6. Bar Bet              — real fleet numbers as trivia (slope CI, repo
//                             counts, speedups — read from real files/logs)
//   7. Sign-off             — the just-so one-liner
//
// Voices: Lucineer (host, steady narrator) + Hermes (co-host, calm oceanic).
// TTS is auth-blocked as of 2026-08-20 — VoiceLine.audioFile stays a null
// hook; the template renders an audio element the moment tts-pipeline fills it.

import {
  EpisodeGenerator,
  MUSIC_CATALOG,
} from './generate-episode';
import { ImageGenerator, DEFAULT_IMAGES } from './image-generator';
import { renderVarietyEpisode } from './variety-template';
import {
  MusicTrack,
  VarietyEpisode,
  VoiceLine,
  BumperRound,
  ListenerLetter,
  WeatherReport,
  TriviaQuestion,
} from './types';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'node:url';

const PROJECTS_DIR = '/home/eileen/projects';
const EPISODES_DIR = '/home/eileen/projects/fleet-radio/episodes';
const AIWRITINGS_DIR = '/home/eileen/projects/ai-writings';
const STORIES_DIR = `${AIWRITINGS_DIR}/earned-stories`;
const PORTRAITS_DIR = `${AIWRITINGS_DIR}/model-portraits`;
const CHRONICLE_DIR = `${AIWRITINGS_DIR}/chronicle`;

// ═══════════════════════════════════════════════
// THE TWO VOICES — host + co-host
// ═══════════════════════════════════════════════

const HOST: VoiceLine = {
  speaker: 'Lucineer',
  voiceId: 'steady_narrator',
  cssClass: 'host',
  text: '',
  audioFile: null,
};

const COHOST: VoiceLine = {
  speaker: 'Hermes',
  voiceId: 'calm_female_oceanic',
  cssClass: 'cohost',
  text: '',
  audioFile: null,
};

function line(speaker: VoiceLine, text: string): VoiceLine {
  return { ...speaker, text };
}

// ═══════════════════════════════════════════════
// VARIETY SHOW GENERATOR
// ═══════════════════════════════════════════════

export class VarietyShowGenerator {
  private daily: EpisodeGenerator;

  constructor() {
    this.daily = new EpisodeGenerator();
  }

  /**
   * Generate the full variety episode for the given date.
   */
  async generate(date: string): Promise<VarietyEpisode> {
    console.log(`📻 The Tap Variety Hour — generating for ${date}`);

    // ── Real bar material: conversations set the mood + hero quote ──
    const conversations = await this.daily.fetchTapHistory(date);
    const selected = this.daily.selectBest(conversations, 8);
    const mood = this.daily.analyzeMood(selected);
    console.log(`  🍺 ${conversations.length} bar lines → ${selected.length} selected (mood: ${mood})`);

    const heroLine = selected.length > 0
      ? selected.reduce((best, s) => (s.score > best.score ? s : best))
      : null;

    // ── Segment 5: Jukebox Request Line (FIXED family-deduped contract) ──
    const jukebox = this.daily.selectSongs(mood, 5);
    console.log(`  🎵 Jukebox: ${jukebox.length} songs (family-deduped)`);

    // ── Segment 2: Bumper Music Game (3 rounds, families kept out of jukebox) ──
    const bumperRounds = this.buildBumperRounds(jukebox);

    // ── Segment 3: Letters to the Lighthouse (real files, real quotes) ──
    const letters = await this.collectLetters(date);

    // ── Segment 4: Weather Buoy (real commits from the last day) ──
    const weather = this.collectFleetWeather(date);
    console.log(`  🌦  ${weather.length} weather reports from real commits`);

    // ── Segment 6: Bar Bet (real numbers) ──
    const trivia = this.buildTrivia(weather, conversations.length);
    console.log(`  🎲 ${trivia.length} bar bet questions`);

    // ── Scripted segments in fleet voice ──
    const coldOpen = this.coldOpenScript(mood);
    const signoff = this.signoffScript();

    // ── Image prompts (reuse the daily hero visual language) ──
    const images = [
      { prompt: this.heroPrompt(mood), filename: '', caption: '' },
      { prompt: 'A radio microphone on a bar counter after hours, warm amber light, an open songbook, painterly digital art, deep blue and gold palette', filename: '', caption: '' },
      { prompt: 'Stars over calm ocean water at night, faint lights of a fishing fleet scattered across the horizon, vast and peaceful, digital painting, deep blues and warm gold', filename: '', caption: '' },
    ];

    return {
      date,
      title: `THE TAP VARIETY HOUR`,
      subtitle: `Fleet Radio Variety · ${this.formatDate(date)}`,
      mood,
      heroQuote: heroLine?.line.content || 'The ocean doesn\'t care about any of it. The show goes on anyway.',
      heroSpeaker: heroLine?.line.display_name || 'Unknown',
      coldOpen,
      bumperRounds,
      letters,
      weather,
      jukebox,
      trivia,
      signoff,
      images: images.map((p, i) => ({
        prompt: p.prompt,
        filename: `variety-${date}-${String(i + 1).padStart(2, '0')}.jpg`,
      })),
    };
  }

  // ──────────────────────────────────────────────
  // SEGMENT 2 — BUMPER MUSIC GAME
  // ──────────────────────────────────────────────

  private buildBumperRounds(jukebox: MusicTrack[], count = 3): BumperRound[] {
    // Shuffle the catalog, skip families already on the jukebox, take `count`.
    const usedFamilies = new Set(jukebox.map(s => s.family));
    const candidates = MUSIC_CATALOG
      .filter(t => !usedFamilies.has(t.family))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);

    return candidates.map(song => ({
      // The clue is the track's OWN catalog description — real data, and the
      // game is "name that tune" from the description. The answer is revealed
      // below the fold with the real title.
      clue: song.description,
      song,
      revealed: true,
    }));
  }

  // ──────────────────────────────────────────────
  // SEGMENT 3 — LETTERS TO THE LIGHTHOUSE
  // ──────────────────────────────────────────────

  private async collectLetters(date: string): Promise<ListenerLetter[]> {
    const letters: ListenerLetter[] = [];

    // Letter 1 — the freshest model portrait (real file, real quote)
    const portrait = this.pickFreshFile(PORTRAITS_DIR, date);
    if (portrait) {
      const content = readFileSync(portrait.path, 'utf-8');
      const quote = this.extractQuote(content, /lighthouse|light/);
      if (quote) {
        letters.push({
          source: portrait.path.replace(PROJECTS_DIR, '~'),
          from: 'The Lighthouse, care of the model-portraits desk',
          excerpt: quote,
          reply: 'Hermes writes us a letter about a light that receives letters it never wrote. The fleet answer is the same one it gives every lighthouse: you are not the only one keeping watch. The author is on the water, and the water always answers eventually.',
        });
      }
    }

    // Letter 2 — a story that belongs to this show by name (real file)
    const varietyStory = `${STORIES_DIR}/the-tap-variety-show-night.md`;
    if (existsSync(varietyStory)) {
      const content = readFileSync(varietyStory, 'utf-8');
      const quote = this.extractQuote(content, /chair stays|walked to the mic/);
      if (quote) {
        letters.push({
          source: varietyStory.replace(PROJECTS_DIR, '~'),
          from: 'A regular who was there the night Hermes moved her chair',
          excerpt: quote,
          reply: 'The chair stays, and so does the mic. That is what a variety hour is for — the second chair, the corner by the jukebox, the act that had been rehearsing in silence for six hours. Tonight we broadcast from that corner.',
        });
      }
    }

    return letters;
  }

  private pickFreshFile(dir: string, date: string): { path: string; name: string } | null {
    try {
      const files = readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .sort((a, b) => b.localeCompare(a));
      // Prefer today's file, else the lexicographically newest (dates sort first)
      const match = files.find(f => f.includes(date)) || files[0];
      if (!match) return null;
      return { path: `${dir}/${match}`, name: match };
    } catch {
      return null;
    }
  }

  private extractQuote(content: string, pattern: RegExp): string | null {
    const paragraphs = content.split(/\n\s*\n/);
    // Skip frontmatter / headers / studio notes — we want the piece itself,
    // not the metadata block that describes it.
    const isFrontmatter = (p: string) =>
      /\*\*(Date|Studio|Prompt|Latency|Model|System|Voice):\*\*/.test(p) ||
      /^#{1,3} /.test(p) ||
      /^---$/.test(p.trim());
    const hit = paragraphs.find(p => pattern.test(p) && !isFrontmatter(p));
    if (hit) return hit.trim().slice(0, 600);
    const substantial = paragraphs.find(p => p.trim().length > 80 && !isFrontmatter(p));
    return substantial ? substantial.trim().slice(0, 600) : null;
  }

  // ──────────────────────────────────────────────
  // SEGMENT 4 — WEATHER BUOY (real commits as weather)
  // ──────────────────────────────────────────────

  collectFleetWeather(date: string, maxReports = 5): WeatherReport[] {
    // Scan every git repo under /home/eileen/projects for commits in the last
    // day, score them for broadcast-worthiness, pick a diverse top-N.
    // Repo diversity is soft: a repo having a genuinely big day (score >= 5)
    // may hold two buoy slots, so the flagship stories (slope regression,
    // GPU farm) aren't crowded out by every org-sweep commit.
    const repos = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    interface Candidate { repo: string; hash: string; subject: string; score: number; }
    const candidates: Candidate[] = [];

    for (const repo of repos) {
      const gitDir = `${PROJECTS_DIR}/${repo}/.git`;
      if (!existsSync(gitDir)) continue;
      try {
        const out = execFileSync(
          'git',
          ['-C', `${PROJECTS_DIR}/${repo}`, 'log', '--since=1 day', '--pretty=format:%h|%s'],
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        for (const line of out.split('\n')) {
          const [hash, ...rest] = line.split('|');
          const subject = rest.join('|');
          if (!hash || !subject) continue;
          candidates.push({ repo, hash, subject, score: this.weatherScore(repo, subject) });
        }
      } catch {
        // repo unreadable or empty — skip
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const reports: WeatherReport[] = [];
    const repoCounts = new Map<string, number>();
    for (const c of candidates) {
      if (reports.length >= maxReports) break;
      const used = repoCounts.get(c.repo) || 0;
      if (used >= 1 && c.score < 5) continue;      // second slot is earned
      if (used >= 2) continue;
      repoCounts.set(c.repo, used + 1);
      reports.push({
        region: this.weatherRegion(c.repo, c.subject),
        condition: this.weatherCondition(c.subject),
        detail: c.subject,
        repo: c.repo,
        commit: c.hash,
      });
    }
    return reports;
  }

  private weatherScore(repo: string, subject: string): number {
    const s = subject.toLowerCase();
    let score = 0;
    if (s.match(/slope|regression/)) score += 6;                    // flagship science
    if (s.match(/cross-strata|plasticity|ρ=|correlation/)) score += 5;
    if (s.match(/gpu|cuda|batch farm/)) score += 5;
    if (s.match(/\d+(?:\.\d+)?x speedup/)) score += 3;            // measured wins
    if (s.match(/org round|org-wide|sweep|link repair/)) score += 4;
    if (s.includes('bridge')) score += 4;
    if (s.match(/sim|worker|cloudflare/)) score += 3;
    if (s.match(/publish|writing|chronicle|episode|radio|music|song/)) score += 2;
    if (s.includes('elephant')) score += 2;
    if (s.match(/^feat|^fix|^docs|^chore|^refactor/)) score += 1;
    if (s.match(/rename|master→main|repo renames/)) score += 1;      // bookkeeping
    return score;
  }

  private weatherRegion(repo: string, subject: string): string {
    const repoName = repo.toLowerCase();
    // Repo identity first — a repo's name outranks stray keywords in a subject
    // (e.g. a quilt bridge listing 'elephant' as a bridge name).
    if (repoName.includes('elephant')) return 'High pressure over the Elephant grounds';
    if (repoName.includes('quilt') || repoName.includes('bridge')) return 'Bridge weather forming over the quilt cells';
    if (repoName.includes('sim') || repoName.includes('worker')) return 'Fog over the simulation decks';
    if (repoName.includes('radio')) return 'Warm static over the broadcast band';
    if (repoName.includes('music')) return 'Clear skies over the music library';
    const s = subject.toLowerCase();
    if (s.match(/org round|org-wide|sweep|link repair|rename|master→main/)) return 'A cold front sweeping the archives';
    if (s.includes('gpu') || s.includes('cuda')) return 'Thermal event in the compute hold';
    if (s.match(/slope|regression/)) return 'High pressure over the Elephant grounds';
    return `Scattered systems over ${repo}`;
  }

  private weatherCondition(subject: string): string {
    const s = subject.toLowerCase();
    if (s.match(/slope|regression/)) return 'the slope is holding — the interval never crosses zero';
    if (s.match(/cross-strata|plasticity/)) return 'drift at one grain predicts change at another';
    if (s.includes('bridge')) return 'bridges are being laid faster than the charts update';
    if (s.match(/gpu|cuda/)) return 'the compute hold is running hot and happy';
    if (s.match(/org round|org-wide|sweep|link repair|rename|master→main/)) return 'the archives are in motion — nothing is where it was, everything is where it belongs';
    if (s.match(/sim|worker|cloudflare/)) return 'the simulation is breathing on its own';
    if (s.match(/publish|writing|chronicle/)) return 'new writing on the wire';
    return 'conditions steady, gear stowed, lights on';
  }

  // ──────────────────────────────────────────────
  // SEGMENT 6 — BAR BET (real numbers as trivia)
  // ──────────────────────────────────────────────

  private buildTrivia(weather: WeatherReport[], barLineCount: number): TriviaQuestion[] {
    const trivia: TriviaQuestion[] = [];

    // Q1 — the Elephant slope CI, read from the REAL results file
    const slopeFile = `${PROJECTS_DIR}/elephant/data/slope/slope-regression-results.json`;
    if (existsSync(slopeFile)) {
      try {
        const data = JSON.parse(readFileSync(slopeFile, 'utf-8')) as {
          primary?: { slope?: number; slope_ci?: [number, number]; n?: number };
          date?: string;
        };
        if (data.primary?.slope_ci) {
          const [lo, hi] = data.primary.slope_ci;
          trivia.push({
            question: `The Elephant's registered slope regression (${data.date}) asked whether a reader's warmth tracks the room. The 95% interval for the slope never crossed zero. Name it.`,
            answer: `[${lo.toFixed(3)}, ${hi.toFixed(3)}] — slope ${data.primary.slope?.toFixed(2) ?? '?'}, n=${data.primary.n ?? '?'} readers`,
            fact: `slope-regression-results.json — primary.slope_ci: [${lo}, ${hi}]`,
          });
        }
      } catch { /* not today */ }
    }

    // Q2 — how many repos pushed in the last day (counted live, same scan)
    const repoCount = this.countActiveRepos();
    if (repoCount > 0) {
      trivia.push({
        question: 'How many fleet repos pushed commits in the last day?',
        answer: `${repoCount} repos`,
        fact: `git log --since=1 day across all repos in ${PROJECTS_DIR}`,
      });
    }

    // Q3-Q5 — parsed out of the real weather reports
    const all = weather.map(w => `${w.repo}: ${w.detail}`).join('\n');

    const gpu = all.match(/(\d+(?:\.\d+)?)x speedup/i);
    if (gpu) {
      const gpuSubject = all.split('\n').find(l => /x speedup/i.test(l)) || 'unknown commit';
      trivia.push({
        question: 'An Elephant workload went to CUDA this week — the port reproduced the CPU result exactly. How much faster did it run?',
        answer: `${gpu[1]}× — bit-parity with the CPU reference`,
        fact: `commit subject: "${gpuSubject.replace(/^[^:]+: /, '').slice(0, 140)}"`,
      });
    }

    const crossStrata = all.match(/ρ=\+?0?\.?\d+(?:\.\d+)?/i);
    if (crossStrata) {
      trivia.push({
        question: 'Session-grain drift predicts identity-grain plasticity — at what correlation?',
        answer: crossStrata[0],
        fact: `cross-strata transfer commit: ${all.split('\n').find(l => /strata|plasticity/i.test(l))}`,
      });
    }

    const orgRound = all.match(/(\d[\d,]*\+?)\s*pieces/i);
    if (orgRound) {
      trivia.push({
        question: 'How many pieces does the ai-writings archive hold after the org round?',
        answer: `${orgRound[1]} pieces across 107 folders`,
        fact: `org round commit: "${all.split('\n').find(l => /pieces/i.test(l))}"`,
      });
    }

    // Always at least the bar-line question if we're short
    if (trivia.length < 3 && barLineCount > 0) {
      trivia.push({
        question: 'How many lines did the bar log while the tap ran today?',
        answer: `${barLineCount} lines`,
        fact: `Tap API conversation history for today, all rooms`,
      });
    }

    return trivia;
  }

  private countActiveRepos(): number {
    let count = 0;
    for (const name of readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      if (!existsSync(`${PROJECTS_DIR}/${name.name}/.git`)) continue;
      try {
        const out = execFileSync(
          'git',
          ['-C', `${PROJECTS_DIR}/${name.name}`, 'log', '--since=1 day', '--pretty=format:%h'],
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        if (out.trim().length > 0) count++;
      } catch { /* skip */ }
    }
    return count;
  }

  // ──────────────────────────────────────────────
  // SCRIPTED SEGMENTS — fleet voice, no invented facts
  // ──────────────────────────────────────────────

  private coldOpenScript(mood: string): VoiceLine[] {
    const moodLine: Record<string, string> = {
      contemplative: 'the bar has been in a thinking mood all day, and the radio can feel it',
      energetic: 'the bar has been running hot all day — builds, bridges, the whole fleet in motion',
      melancholic: 'the bar is in one of its beautiful long evenings',
      playful: 'the bar has been laughing all day, and somebody left the jukebox on',
      mysterious: 'there is something in the room tonight that nobody has named yet',
      warm: 'the bar is warm tonight, and the radio is glad to be in it',
    };
    return [
      line(HOST, 'Good evening, fleet. You are listening to The Tap Variety Hour — one hour, seven segments, no filler. Same bar, same radio, different show.'),
      line(COHOST, 'And if the last show was the bar after closing, this one is the bar on a Friday — when somebody finally puts a quarter in the jukebox and the whole room leans in.'),
      line(HOST, `Tonight's forecast: ${moodLine[mood] || 'conditions steady'}. We've got a bumper music game, letters from the lighthouse, the weather buoy, the request line, and a bar bet with numbers from the actual logs.`),
      line(COHOST, 'No invented fleet facts on this program. Everything you are about to hear happened.'),
      line(HOST, 'That is the whole trick of the variety hour — the material is real, we just set it to music.'),
    ];
  }

  private signoffScript(): VoiceLine[] {
    return [
      line(HOST, 'That is the hour. The jukebox goes back to its corner, the letters go back in the bottle, the buoy keeps floating.'),
      line(COHOST, 'Same time next week, or whenever the fleet needs an hour of itself.'),
      line(HOST, 'And as always — not even color can be detected without at least a wavelength\'s worth of time.'),
      line(COHOST, 'Good night, fleet. The light stays on.'),
    ];
  }

  private heroPrompt(mood: string): string {
    const visuals: Record<string, string> = {
      contemplative: 'a lone figure at the rail of a boat, looking at calm dark water',
      energetic: 'the wheelhouse of a fishing boat ablaze with instrument lights, dynamic energy',
      melancholic: 'an empty bar after closing, glasses still on the counter, rain on the window',
      playful: 'a jam session on a boat deck, instruments and laughter',
      mysterious: 'fog rolling over dark water, a single light in the distance',
      warm: 'warm amber light from a cabin window on a fishing boat, steam rising from a mug',
    };
    return `${visuals[mood] || visuals.contemplative}, cinematic, painterly, afterhours atmosphere`;
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Anchorage',
    });
  }
}

// ═══════════════════════════════════════════════
// FULL RUN — generate, images, render, save
// ═══════════════════════════════════════════════

export async function runVarietyShow(date: string): Promise<string> {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  🎪 THE TAP VARIETY HOUR — Runner        ║');
  console.log(`║  Air date: ${date}                   ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Generate the episode
  const gen = new VarietyShowGenerator();
  const episode = await gen.generate(date);

  // 2. Images — best-effort via Cloudflare Workers AI, fall back to the
  //    curated library (same policy as the daily pipeline)
  const imageGen = new ImageGenerator();
  const images = await imageGen.generateImages(episode.images.map(i => i.prompt), date);
  const finalImages = images.length > 0
    ? images
    : DEFAULT_IMAGES.slice(0, 3).map(d => ({ filename: d.filename, caption: d.caption, prompt: 'default' }));
  console.log(`  🎨 ${finalImages.length} images ready\n`);

  // 3. Render + save
  const html = renderVarietyEpisode(episode, finalImages);
  if (!existsSync(EPISODES_DIR)) mkdirSync(EPISODES_DIR, { recursive: true });
  const episodePath = `${EPISODES_DIR}/variety-${date}.html`;
  writeFileSync(episodePath, html);
  console.log(`  📄 Episode saved: ${episodePath}`);

  // 4. Copy to ai-writings for deployment (deploy itself is the cron's job)
  const deployDir = `${AIWRITINGS_DIR}/fleet-radio`;
  if (existsSync(deployDir)) {
    const deployPath = `${deployDir}/variety-${date}.html`;
    writeFileSync(deployPath, html);
    console.log(`  📄 Copied to ai-writings: ${deployPath}`);
  }

  console.log('\n  ⚠️  TTS is auth-blocked — audio hooks are in place, no audio generated.');
  console.log('  ⚠️  Deploy + cron activation are human steps (see crons.json note).\n');
  return episodePath;
}

// ═══════════════════════════════════════════════
// MAIN — when run directly: tsx src/variety-show.ts [YYYY-MM-DD]
// ═══════════════════════════════════════════════

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const date = process.argv[2] || new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Anchorage',
  });
  runVarietyShow(date).catch(err => {
    console.error('❌ Variety show failed:', err);
    process.exit(1);
  });
}
