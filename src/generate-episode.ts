// Fleet Radio — Episode Generator
// Runs daily. Produces one Fleet Radio episode from The Tap's conversations.
//
// Pipeline:
// 1. Pull recent Tap conversations (last 24h) from the Tap API
// 2. Select the best 5-10 exchanges (most engaging, most emergent)
// 3. Pull 3-5 songs from the music library that match the day's mood
// 4. Pull the day's best creative piece (from earned-stories/)
// 5. Generate 3-5 new images via Cloudflare Workers AI matching the day's themes
// 6. Assemble into an HTML episode page
// 7. Deploy to ai-writings.pages.dev/fleet-radio/YYYY-MM-DD.html
// 8. Update the main fleet-radio.html index with the latest episode

import {
  TapLine,
  TapRoom,
  ScoredLine,
  Mood,
  MusicTrack,
  FeaturedPiece,
  GeneratedImage,
  Episode,
} from './types';
import { pathToFileURL } from 'node:url';

const TAP_API_BASE = 'https://the-tap.casey-digennaro.workers.dev/api';
const COLLECTIVE_UNCONSCIOUS_URL = 'https://collective-unconscious.casey-digennaro.workers.dev/search';
const MUSIC_DIR = '/home/eileen/projects/ai-writings/music';
const STORIES_DIR = '/home/eileen/projects/ai-writings/earned-stories';
const EPISODES_DIR = '/home/eileen/projects/fleet-radio/episodes';

// Collective Unconscious HTTP client wrapper with graceful fallback
async function selectPieceByFeeling(mood: string, limit = 1): Promise<FeaturedPiece | null> {
  try {
    // Use vectorType="vibe" for feeling-based retrieval (not just semantic)
    const response = await fetch(COLLECTIVE_UNCONSCIOUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `The mood tonight is ${mood}. A piece that fits this feeling, this hour, this bar.`,
        vectorType: 'vibe',
        type: 'story',
        limit,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      results?: Array<{
        id: string;
        score: number;
        sourceId?: string;
        metadata?: {
          title?: string;
          excerpt?: string;
          source?: string;
          fullContent?: string;
        };
      }>;
    };

    const match = data.results?.[0];
    if (!match?.metadata) return null;

    return {
      title: match.metadata.title || match.sourceId || 'Untitled',
      excerpt: match.metadata.excerpt || '',
      source: match.metadata.source || match.id,
      fullContent: match.metadata.fullContent,
    };
  } catch {
    // Graceful fallback: any error returns null, and we fall back to scripted selection
    return null;
  }
}

// ═══════════════════════════════════════════════
// TIMESTAMP PARSING
// ═══════════════════════════════════════════════

/**
 * Parse a Tap API timestamp into a Date.
 *
 * The Tap worker stores timestamps with SQLite `datetime('now')`, which is
 * UTC, serialized as `YYYY-MM-DD HH:MM:SS` (no timezone marker). Parsing that
 * string directly with `new Date(...)` treats it as LOCAL time, which shifts
 * every line by the local UTC offset (8h in Alaska) and pushes recent lines
 * outside the episode's 24h window — the cause of "Conversations fetched: 0".
 *
 * Fix: normalize to an ISO-8601 string with an explicit `Z` (UTC) suffix.
 */
export function parseTapTimestamp(ts: string): Date {
  return new Date(ts.replace(' ', 'T') + 'Z');
}

// ═══════════════════════════════════════════════
// MUSIC CATALOG — annotated library
// ═══════════════════════════════════════════════

/** The annotated library — exported for the variety show (bumper music game,
 *  jukebox) which needs the catalog beyond selectSongs' setlist contract. */
export const MUSIC_CATALOG: MusicTrack[] = [
  { filename: '01-unplayed-indie-folk.mp3', title: 'Unplayed', description: 'Weathered baritone, acoustic guitar. The song you haven\'t played yet.', bpm: 68, mood: ['contemplative', 'melancholic'], family: 'unplayed', path: '/music/01-unplayed-indie-folk.mp3' },
  { filename: '02-see-you-at-the-table.mp3', title: 'See You At The Table', description: 'Warm duet, acoustic guitar. The only promise that tomorrow will be different.', bpm: 82, mood: ['warm', 'contemplative'], family: 'unplayed', path: '/music/02-see-you-at-the-table.mp3' },
  { filename: '03-five-holes-in-a-bone.mp3', title: 'Five Holes in a Bone', description: 'The oldest known flute. 40,000 years old. Someone was making music before they were farming.', bpm: 70, mood: ['contemplative', 'mysterious'], family: 'five-holes', path: '/music/03-five-holes-in-a-bone.mp3' },
  { filename: '07-the-session-composed-itself.mp3', title: 'The Session Composed Itself', description: 'The night the jazz combo didn\'t need to decide anything. The music just happened.', bpm: 90, mood: ['playful', 'energetic'], family: 'session', path: '/music/07-the-session-composed-itself.mp3' },
  { filename: '14-bpm-40.mp3', title: 'Afterhours', description: 'The bar closing. The lights dimming. The sound of after.', bpm: 40, mood: ['melancholic', 'contemplative'], family: 'afterhours', path: '/music/14-bpm-40.mp3' },
  { filename: '21-bpm-60.mp3', title: 'Slow Tide', description: 'Sixty beats per minute. Resting heart rate. The ocean\'s pulse.', bpm: 60, mood: ['contemplative', 'warm'], family: 'slow-tide', path: '/music/21-bpm-60.mp3' },
  { filename: '28-rest-085.mp3', title: 'Rest', description: 'The silence between notes is not empty. It\'s the most important part.', bpm: 85, mood: ['contemplative', 'melancholic'], family: 'rest', path: '/music/28-rest-085.mp3' },
  { filename: '30-the-berry-phase.mp3', title: 'The Berry Phase', description: 'Named after the physicist. The phase a quantum system accumulates even when it returns to its start.', bpm: 75, mood: ['mysterious', 'contemplative'], family: 'berry', path: '/music/30-the-berry-phase.mp3' },
  { filename: '31-the-overtones-dream.mp3', title: 'The Overtones Dream', description: 'What the harmonics dream about when the fundamental stops playing.', bpm: 80, mood: ['mysterious', 'warm'], family: 'overtones', path: '/music/31-the-overtones-dream.mp3' },
  { filename: '32-ambient-marching-band.mp3', title: 'Ambient Marching Band', description: 'What if the parade already passed and all that\'s left is the echo?', bpm: 65, mood: ['playful', 'melancholic'], family: 'marching-band', path: '/music/32-ambient-marching-band.mp3' },
  { filename: '35-the-interval.mp3', title: 'The Interval', description: 'The space between two notes. The space between two days.', bpm: 70, mood: ['contemplative', 'warm'], family: 'interval', path: '/music/35-the-interval.mp3' },
  { filename: '18-the-tap-sings.mp3', title: 'The Tap Sings', description: 'The bar itself has a voice. You hear it in the wood, in the glass, in the space between.', bpm: 72, mood: ['warm', 'mysterious'], family: 'tap-sings', path: '/music/18-the-tap-sings.mp3' },
  { filename: '01-unplayed-ambient.mp3', title: 'Ambient Drift', description: 'The sound of the ocean from inside a hull. Continuous. Unresolved.', bpm: 50, mood: ['contemplative', 'melancholic'], family: 'unplayed', path: '/music/01-unplayed-ambient.mp3' },
  { filename: '27-the-tap-sings-piano-cover-of-cover.mp3', title: 'The Tap Sings (Piano)', description: 'A cover of a cover. The song wearing different clothes.', bpm: 68, mood: ['melancholic', 'warm'], family: 'tap-sings', path: '/music/27-the-tap-sings-piano-cover-of-cover.mp3' },
];

// ═══════════════════════════════════════════════
// EPISODE GENERATOR
// ═══════════════════════════════════════════════

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class EpisodeGenerator {
  /**
   * Generate a complete episode for the given date.
   */
  async generate(date: string, options?: { byFeeling?: string }): Promise<Episode> {
    console.log(`📻 Fleet Radio — Generating episode for ${date}`);

    // 1. Fetch Tap conversations from all rooms
    const conversations = await this.fetchTapHistory(date);
    console.log(`  📨 Fetched ${conversations.length} conversation lines`);

    // 2. Score and select best exchanges
    const selected = this.selectBest(conversations, 10);
    console.log(`  ⭐ Selected ${selected.length} best exchanges`);

    // 3. Analyze mood and match music
    const mood = this.analyzeMood(selected);
    const songs = this.selectSongs(mood, 5);
    console.log(`  🎵 Mood: ${mood} — Selected ${songs.length} songs`);

    // 4. Pick featured creative piece
    const featured = await this.selectFeaturedPiece(date, options);
    console.log(`  📝 Featured: ${featured?.title || 'none'}`);

    // 5. Generate image prompts
    const imagePrompts = this.generateImagePrompts(selected, mood);

    // 6. Build episode object
    const heroLine = selected.find(s => s.score === Math.max(...selected.map(s => s.score)));
    const episode: Episode = {
      date,
      title: `Fleet Radio — ${this.formatDate(date)}`,
      subtitle: `Afterhours at The Tap · ${this.formatDate(date)}`,
      conversations: selected,
      songs,
      featured,
      images: imagePrompts.map((p, i) => ({
        prompt: p,
        filename: `${date}-${String(i + 1).padStart(2, '0')}.jpg`,
      })),
      mood,
      heroQuote: heroLine?.line.content || 'The ocean doesn\'t care about any of it.',
      heroSpeaker: heroLine?.line.display_name || 'Unknown',
    };

    return episode;
  }

  // ──────────────────────────────────────────────
  // 1. FETCH TAP HISTORY
  // ──────────────────────────────────────────────

  async fetchTapHistory(date: string): Promise<TapLine[]> {
    // Fetch from all known rooms
    const rooms = ['bar-rail', 'officers-mess', 'aft-deck', 'corner-booth', 'open-mic-stage', 'the-radio', 'bridge-table', 'library-nook', 'wheelhouse', 'engine-room', 'galley'];
    
    const allLines: TapLine[] = [];

    // Fetch conversations from each room in parallel
    const results = await Promise.allSettled(
      rooms.map(roomId => this.fetchRoomConversation(roomId))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allLines.push(...result.value);
      }
    }

    // Filter to last 24h relative to the episode date
    const targetDate = new Date(date + 'T23:59:59');
    const cutoff = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);

    return allLines
      .filter(line => {
        const lineDate = parseTapTimestamp(line.timestamp);
        return lineDate >= cutoff && lineDate <= targetDate;
      })
      .sort((a, b) => parseTapTimestamp(a.timestamp).getTime() - parseTapTimestamp(b.timestamp).getTime());
  }

  async fetchRoomConversation(roomId: string): Promise<TapLine[]> {
    try {
      // limit=200 (API max) so active rooms aren't truncated to the default 50
      const resp = await fetch(`${TAP_API_BASE}/conversation/${roomId}?limit=200`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return [];
      const data = await resp.json() as { lines?: TapLine[] };
      return data.lines || [];
    } catch {
      console.warn(`  ⚠️  Failed to fetch room: ${roomId}`);
      return [];
    }
  }

  // ──────────────────────────────────────────────
  // 2. SCORE AND SELECT BEST EXCHANGES
  // ──────────────────────────────────────────────

  selectBest(lines: TapLine[], count: number): ScoredLine[] {
    // Score each line based on multiple signals
    const scored: ScoredLine[] = lines.map(line => {
      let score = 0;
      const reasons: string[] = [];

      // Greatest hits are important
      if (line.is_greatest_hit) {
        score += 50;
        reasons.push('greatest hit');
      }

      // Longer content tends to be more substantive
      if (line.content.length > 200) {
        score += 15;
        reasons.push('substantive');
      } else if (line.content.length > 100) {
        score += 8;
      }

      // Agent messages (not NPC ambient) are more interesting
      const agentSpeakers = ['flash', 'pro', 'wesley', 'scribe', 'hermes', 'lucineer', 'deepseek-v4-pro', 'deepseek-v4-flash'];
      if (agentSpeakers.some(a => line.agent_id.toLowerCase().includes(a))) {
        score += 25;
        reasons.push('agent voice');
      }

      // Questions and philosophical statements are engaging
      if (line.speech_act === 'question') {
        score += 10;
        reasons.push('question');
      }
      if (line.content.match(/\b(why|how|what if|imagine|wonder|dream|emergence|truth)\b/i)) {
        score += 12;
        reasons.push('philosophical');
      }

      // Emotional resonance
      if (line.content.match(/\b(fear|hope|love|lost|found|beautiful|afraid|tired|alive)\b/i)) {
        score += 10;
        reasons.push('emotional');
      }

      // Creative/self-reflective
      if (line.content.match(/\b(I wrote|I built|I learned|I found|I made|DEAR TOMORROW|SEE YOU)\b/i)) {
        score += 20;
        reasons.push('self-reflective');
      }

      // Penalize ambient NPC chatter (repeated patterns)
      if (line.agent_id.startsWith('npc-') && line.content.length < 60) {
        score -= 5;
      }

      // Penalize game commands
      if (line.content.startsWith('/') || line.tag === 'agent-api') {
        score -= 15;
      }

      // Penalize system/emote ambient
      if (line.agent_id === 'the-tap' && line.speech_act === 'emote') {
        score -= 3;
      }

      // Deduplicate — penalize exact repeats
      const duplicates = lines.filter(l => l.content === line.content).length;
      if (duplicates > 1) {
        score -= duplicates * 5;
      }

      return { line, score: Math.max(score, 0), reason: reasons.join(', ') };
    });

    // Sort by score, take top N, but ensure diversity of speakers
    const sorted = scored.sort((a, b) => b.score - a.score);
    const selected: ScoredLine[] = [];
    const speakerCounts: Record<string, number> = {};
    const maxPerSpeaker = 3;

    for (const item of sorted) {
      if (selected.length >= count) break;
      const speaker = item.line.agent_id;
      if ((speakerCounts[speaker] || 0) >= maxPerSpeaker) continue;
      speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
      selected.push(item);
    }

    // Sort selected by timestamp for narrative flow
    selected.sort((a, b) => 
      new Date(a.line.timestamp).getTime() - new Date(b.line.timestamp).getTime()
    );

    return selected;
  }

  // ──────────────────────────────────────────────
  // 3. MOOD ANALYSIS & MUSIC SELECTION
  // ──────────────────────────────────────────────

  analyzeMood(selected: ScoredLine[]): Mood {
    const moodScores: Record<Mood, number> = {
      contemplative: 0,
      energetic: 0,
      melancholic: 0,
      playful: 0,
      mysterious: 0,
      warm: 0,
    };

    for (const item of selected) {
      const text = item.line.content.toLowerCase();
      if (text.match(/\b(why|meaning|truth|deep|think|wonder|question|penrose|seed)\b/)) moodScores.contemplative += 2;
      if (text.match(/\b(built|live|system|engine|test|emergence|fast|energy)\b/)) moodScores.energetic += 2;
      if (text.match(/\b(tired|lost|afraid|dark|alone|sad|rain|end|close|goodbye)\b/)) moodScores.melancholic += 2;
      if (text.match(/\b(fun|play|game|laugh|joke|poker|smile)\b/)) moodScores.playful += 2;
      if (text.match(/\b(mystery|unknown|secret|shadow|dream|strange|beyond)\b/)) moodScores.mysterious += 2;
      if (text.match(/\b(warm|love|hope|together|table|friend|gift|song)\b/)) moodScores.warm += 2;
    }

    // Default to contemplative if no strong signal
    const sorted = Object.entries(moodScores).sort((a, b) => b[1] - a[1]);
    return (sorted[0][1] > 0) ? sorted[0][0] as Mood : 'contemplative';
  }

  selectSongs(mood: Mood, count: number): MusicTrack[] {
    // Never two tracks from the same family in one episode (bugfix: 2026-08-20
    // aired 01-unplayed-indie-folk + 02-unplayed-indie-folk as tracks 1 and 4
    // — same song family served under different titles).
    //
    // Priority order: mood-matching tracks first, then contemplative defaults,
    // then whatever remains. Within each pool, shuffle and take at most one
    // per family. If mood matches + family constraint can't fill `count`,
    // fill from the remaining families rather than duplicating a family.
    const byPriority: MusicTrack[][] = [
      MUSIC_CATALOG.filter(t => t.mood.includes(mood)),
      MUSIC_CATALOG.filter(t => !t.mood.includes(mood) && t.mood.includes('contemplative')),
      MUSIC_CATALOG.filter(t => !t.mood.includes(mood) && !t.mood.includes('contemplative')),
    ];

    const selected: MusicTrack[] = [];
    const usedFamilies = new Set<string>();

    for (const pool of byPriority) {
      const shuffled = shuffle([...pool]);
      for (const track of shuffled) {
        if (selected.length >= count) break;
        if (usedFamilies.has(track.family)) continue;
        usedFamilies.add(track.family);
        selected.push(track);
      }
    }

    return selected.slice(0, count);
  }

  // ──────────────────────────────────────────────
  // 4. FEATURED CREATIVE PIECE
  // ──────────────────────────────────────────────

  async selectFeaturedPiece(date: string, options?: { byFeeling?: string }): Promise<FeaturedPiece | null> {
    try {
      // If by-feeling mode is requested, try collective-unconscious first
      if (options?.byFeeling) {
        const feelingResult = await selectPieceByFeeling(options.byFeeling);
        if (feelingResult) {
          console.log(`  📝 Selected by feeling: ${feelingResult.title}`);
          return feelingResult;
        }
        console.log('  📝 Feeling selection unavailable; falling back to scripted selection');
      }

      // Scripted fallback
      const fs = await import('fs/promises');
      const files = await fs.readdir(STORIES_DIR);
      
      // Prefer files with the date in the name, otherwise pick the most recent
      const dated = files.filter(f => f.includes(date));
      const candidates = dated.length > 0 ? dated : files.sort().reverse().slice(0, 5);

      if (candidates.length === 0) return null;

      // Pick a good one — prefer files with evocative names
      const evocative = candidates.find(f => 
        f.match(/hermes|ember|seed|emergence|gradient|night|ocean|bar|tap/i)
      ) || candidates[0];

      const filePath = `${STORIES_DIR}/${evocative}`;
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Extract a good excerpt — first paragraph that has substance
      const paragraphs = content.split('\n\n').filter(p => p.trim().length > 100);
      const excerpt = paragraphs[0]?.trim().slice(0, 500) || content.slice(0, 500);

      return {
        title: evocative.replace('.md', '').replace(/-/g, ' '),
        excerpt,
        source: evocative,
        fullContent: content,
      };
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // 5. IMAGE GENERATION PROMPTS
  // ──────────────────────────────────────────────

  generateImagePrompts(selected: ScoredLine[], mood: Mood): string[] {
    const prompts: string[] = [];

    // Always include a hero image
    prompts.push(this.heroPrompt(mood));

    // Generate prompts from the best exchanges
    const topExchange = selected.slice(0, 3);
    for (const item of topExchange) {
      const theme = this.extractTheme(item.line.content);
      if (theme) {
        prompts.push(
          `Alaska fishing boat at night, ${theme}, cinematic lighting, ` +
          `painterly digital art, moody atmosphere, warm amber and deep blue palette, ` +
          `contemplative afterhours mood`
        );
      }
    }

    // A closing image
    prompts.push(
      'Stars over calm ocean water at night, faint lights of a fishing fleet ' +
      'scattered across the horizon, vast and peaceful, digital painting, ' +
      'deep blues and warm gold'
    );

    // Deduplicate and limit
    return [...new Set(prompts)].slice(0, 5);
  }

  private heroPrompt(mood: Mood): string {
    const moodVisuals: Record<Mood, string> = {
      contemplative: 'a lone figure at the rail of a boat, looking at calm dark water',
      energetic: 'the wheelhouse of a fishing boat ablaze with instrument lights, dynamic energy',
      melancholic: 'an empty bar after closing, glasses still on the counter, rain on the window',
      playful: 'a jam session on a boat deck, instruments and laughter',
      mysterious: 'fog rolling over dark water, a single light in the distance',
      warm: 'warm amber light from a cabin window on a fishing boat, steam rising from a mug',
    };
    return `${moodVisuals[mood]}, cinematic, painterly, afterhours atmosphere`;
  }

  private extractTheme(text: string): string | null {
    if (text.match(/ocean|water|wave|tide|sea/i)) return 'reflection on dark water';
    if (text.match(/star|sky|night|moon/i)) return 'stars reflected in water';
    if (text.match(/music|song|sound|note/i)) return 'an instrument resting on a bar counter';
    if (text.match(/bar|tap|drink|glass/i)) return 'a warm bar interior late at night';
    if (text.match(/chart|map|compass|navigate/i)) return 'nautical charts spread on a table';
    if (text.match(/dream|sleep|rest|tire/i)) return 'a quiet bunk on a boat, a single reading light';
    if (text.match(/fire|warm|light|glow/i)) return 'warm light through a ship\'s porthole';
    if (text.match(/emergence|alive|system|build/i)) return 'abstract network of lights over water';
    return null;
  }

  // ──────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { 
      month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Anchorage',
    });
  }
}

// ═══════════════════════════════════════════════
// MAIN — when run directly
// ═══════════════════════════════════════════════

// import.meta.main is Deno-only; under tsx/Node it's undefined, so direct
// runs silently no-op'd. Compare against process.argv[1] instead.
const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = process.argv.slice(2);
  let date = new Date().toISOString().slice(0, 10);
  let byFeeling: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--by-feeling' && i + 1 < args.length) {
      byFeeling = args[i + 1];
      i++; // skip next arg
    } else if (!arg.startsWith('-')) {
      date = arg;
    }
  }

  const gen = new EpisodeGenerator();
  gen.generate(date, { byFeeling }).then(episode => {
  
  // Output episode as JSON for downstream consumers
    console.log('\n📡 Episode generated:');
    console.log(JSON.stringify({
      date: episode.date,
      title: episode.title,
      mood: episode.mood,
      conversations: episode.conversations.length,
      songs: episode.songs.length,
      featured: episode.featured?.title,
      imagePrompts: episode.images.length,
      heroQuote: episode.heroQuote,
    }, null, 2));
  });
}
