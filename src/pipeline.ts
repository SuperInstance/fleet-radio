#!/usr/bin/env tsx
// Fleet Radio — Pipeline Runner
// Orchestrates the full episode generation pipeline.
//
// Usage: tsx src/pipeline.ts [YYYY-MM-DD]
// 
// Pipeline:
// 1. Generate episode (fetch Tap, score, select music, pick featured piece)
// 2. Generate images (Cloudflare Workers AI or fallback to existing)
// 3. Render HTML episode page
// 4. Deploy to ai-writings.pages.dev
// 5. Update the fleet-radio.html index

import { EpisodeGenerator } from './generate-episode';
import { ImageGenerator, DEFAULT_IMAGES } from './image-generator';
import { TTSPipeline } from './tts-pipeline';
import { renderEpisode } from './episode-template';
import { runVarietyShow } from './variety-show';
import { ScoredLine, AudioSegment, MusicTrack } from './types';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';

const EPISODES_DIR = '/home/eileen/projects/fleet-radio/episodes';
const AIWRITINGS_DIR = '/home/eileen/projects/ai-writings';
// fleet-radio.html moved to site/ in the Aug 2026 reorganization and was
// renamed radio.html there — point at the live index (has the footer anchor
// the archive insert needs; the subtitle replace no-ops safely).
const AIWRITINGS_INDEX = `${AIWRITINGS_DIR}/site/radio.html`;
const COMPOSER_SCRIPT = '/home/eileen/projects/fleet-radio/src/nightly-composer.py';
const MEDIA_SYSTEM = `${AIWRITINGS_DIR}/scripts/media-system.py`;
const WAV_TO_MP3 = `${AIWRITINGS_DIR}/scripts/wav-to-mp3.py`;
const MUSIC_PLAYED = `${AIWRITINGS_DIR}/music-played.json`;
const MUSIC_CATALOG = `${AIWRITINGS_DIR}/music-catalog.json`;

// ═══════════════════════════════════════════
// NIGHTLY COMPOSER — a NEW song every night
// ═══════════════════════════════════════════

/** Compose tonight's original track (offline numpy synth), sync the catalog,
 *  and return it as a MusicTrack for the setlist. Best-effort: on any
 *  failure returns null and the episode falls back to library-only music.
 *  Deterministic per (mood, date) — re-runs regenerate the identical WAV. */
/** The composer registers its WAV in music-catalog.json (the episode setlist
 *  source). Repoint that entry .wav→.mp3 once the mp3 exists — same key AND
 *  same fields — so future setlists stream the mp3 and the file never gets
 *  double-registered under both extensions. */
function repointCatalogToMp3(wavName: string): string | null {
  const mp3Name = wavName.replace(/\.wav$/, '.mp3');
  try {
    const cat = JSON.parse(readFileSync(MUSIC_CATALOG, 'utf-8')) as {
      tracks: Record<string, Record<string, unknown> & { path?: string; filename?: string }>;
    };
    const entry = cat.tracks[wavName];
    if (!entry) return null;
    entry.filename = mp3Name;
    if (entry.path?.endsWith('.wav')) entry.path = entry.path.replace(/\.wav$/, '.mp3');
    delete cat.tracks[wavName];
    // if a stale sync already added a generic mp3-keyed dup, this entry wins
    cat.tracks[mp3Name] = entry;
    writeFileSync(MUSIC_CATALOG, JSON.stringify(cat, null, 1));
    return mp3Name;
  } catch (err) {
    console.warn(`  ⚠️  Catalog repoint failed: ${err}`);
    return null;
  }
}

function composeNightlyTrack(mood: string, date: string): MusicTrack | null {
  try {
    // stdout is EXACTLY one JSON line (composer contract); logs go to stderr
    const out = execFileSync('python3',
      [COMPOSER_SCRIPT, '--mood', mood, '--date', date],
      { encoding: 'utf-8', timeout: 180_000 });
    let track = JSON.parse(out.trim().split('\n').pop()!) as MusicTrack & {
      key?: string; wav_path?: string; duration_seconds?: number;
    };
    console.log(`  🎼 Composed "${track.title}" (${track.key ?? '?'} · ${track.bpm} BPM) → ${track.filename}`);

    // Encode the fresh WAV to streaming MP3 (per-file contract: the site
    // streams mp3; the composer writes a ~10MB 44.1kHz WAV).
    const wavPath = track.wav_path ?? `${AIWRITINGS_DIR}/music/${track.filename}`;
    try {
      execFileSync('python3', [WAV_TO_MP3, wavPath], { encoding: 'utf-8', timeout: 300_000 });
      console.log('  🎧 MP3 encoded');
    } catch (err) {
      console.warn(`  ⚠️  WAV→MP3 conversion failed: ${err}`);
    }

    // Keep music-catalog.json (episode setlist source) pointing at the mp3
    const mp3Name = repointCatalogToMp3(track.filename);

    // The episode setlist streams audio/mpeg — link the mp3, not the wav.
    if (track.filename.endsWith('.wav')) {
      if (mp3Name && existsSync(`${AIWRITINGS_DIR}/music/${mp3Name}`)) {
        track = {
          ...track,
          filename: mp3Name,
          path: (track.path ?? `/music/${track.filename}`).replace(/\.wav$/, '.mp3'),
        };
      } else {
        console.warn(`  ⚠️  ${track.filename.replace(/\.wav$/, '.mp3')} missing — setlist links the WAV fallback`);
      }
    }

    // Register in the library page's embedded catalog (media-system owns it).
    // `add` appends blindly, so guard with `list` for idempotent re-runs.
    // NOTE: cmd_add passes "/"-prefixed paths through verbatim — always give
    // it the SITE-RELATIVE path (/music/<file>.mp3), never an absolute one.
    try {
      const listed = execFileSync('python3', [MEDIA_SYSTEM, 'list'], { encoding: 'utf-8', timeout: 60_000 });
      if (mp3Name && !listed.includes(mp3Name)) {
        execFileSync('python3', [
          MEDIA_SYSTEM, 'add',
          `/music/${mp3Name}`,
          track.title,
          '--desc', track.description ?? '',
          '--bpm', String(track.bpm ?? ''),
          '--mood', (track.mood ?? []).join(','),
          '--family', track.family ?? `nightly-${date}`,
        ], { encoding: 'utf-8', timeout: 60_000 });
        console.log(`  📀 Library page grew: ${mp3Name} registered`);
      } else {
        console.log('  📀 Library page already has tonight’s track');
      }
    } catch (err) {
      console.warn(`  ⚠️  Library registration failed: ${err}`);
    }

    // Mark as aired in the no-repeat ledger — AFTER the mp3 repoint, so the
    // key matches the catalog filename and a re-air can't slip through as an
    // “unplayed” mp3 twin of an aired wav.
    try {
      const ledger = existsSync(MUSIC_PLAYED)
        ? JSON.parse(readFileSync(MUSIC_PLAYED, 'utf-8')) as Record<string, string>
        : {};
      ledger[track.filename] = date;
      writeFileSync(MUSIC_PLAYED, JSON.stringify(ledger, null, 1));
    } catch {
      /* non-fatal — ledger is an optimization, not a guarantee */
    }

    return track;
  } catch (err) {
    console.warn(`  ⚠️  Nightly composer failed (falling back to library music): ${err}`);
    return null;
  }
}

async function main() {
  // --variety runs THE TAP VARIETY HOUR (the weekly second format) instead of
  // the daily afterhours episode. The cron entry `fleet-radio-variety-weekly`
  // (crons.json) uses this flag. The variety path renders with audio hooks but
  // skips the pages deploy + index update — those stay manual/human steps.
  const variety = process.argv.includes('--variety');
  if (variety) {
    const vdate = process.argv[2] && !process.argv[2].startsWith('--')
      ? process.argv[2]
      : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Anchorage' });
    const path = await runVarietyShow(vdate);
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  🎪 THE TAP VARIETY HOUR — Complete!      ║`);
    console.log(`║  ${path}  ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    return;
  }

  // Test/dry-run labels may carry a suffix (e.g. 2026-08-24-dryrun).
  // Everything date-mathematical — the Tap fetch window, the composer seed,
  // the played-ledger — uses the ISO prefix; only output filenames and the
  // banner keep the full label, so test runs never collide with the real
  // episode and are trivially identifiable for cleanup.
  const rawDate = process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Anchorage' });
  const date = rawDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? rawDate;
  const isTestRun = rawDate !== date;

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  ⚓ FLEET RADIO — Pipeline Runner         ║`);
  console.log(`║  Episode: ${rawDate}                   ║`);
  if (isTestRun) console.log(`║  (test run — deploy + index update OFF)   ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // ── 1. GENERATE EPISODE ──
  console.log('▶ Phase 1: Episode Generation');
  const generator = new EpisodeGenerator();
  const episode = await generator.generate(date);
  console.log(`  ✓ Episode assembled\n`);

  // ── 1.5 NIGHTLY COMPOSER — premiere a new original every night ──
  console.log('▶ Phase 1.5: Nightly Composer');
  const premiere = composeNightlyTrack(episode.mood, date);
  if (premiere) {
    // New track is track 1 of the setlist — tonight's premiere
    episode.songs = [premiere, ...episode.songs].slice(0, 6);
    console.log(`  ✓ Setlist: ${episode.songs.length} tracks — premiere "${premiere.title}" first\n`);
  } else {
    console.log('  ⚠️  No premiere tonight — library setlist unchanged\n');
  }

  // ── 2. GENERATE IMAGES ──
  console.log('▶ Phase 2: Image Generation');
  const imageGen = new ImageGenerator();
  const prompts = episode.images.map(img => img.prompt);
  const images = await imageGen.generateImages(prompts, date);
  
  // If no images generated (all fallbacks), use defaults
  if (images.length === 0) {
    console.log('  ⚠️  No images generated, using defaults from ai-writings');
    const defaultImgs = DEFAULT_IMAGES.slice(0, 5).map(d => ({
      filename: d.filename,
      caption: d.caption,
      prompt: 'default',
    }));
    images.push(...defaultImgs);
  }
  console.log(`  ✓ ${images.length} images ready\n`);

  // ── 3. TTS SEGMENTS (best-effort, non-blocking) ──
  console.log('▶ Phase 3: TTS Segments');
  const tts = new TTSPipeline();
  const audioSegments: AudioSegment[] = [];
  
  for (let i = 0; i < episode.conversations.length; i++) {
    const conv = episode.conversations[i];
    const segment = await tts.generateSegment(
      conv.line.agent_id,
      conv.line.content,
      date,
      i + 1
    );
    audioSegments.push(segment);
  }
  const withAudio = audioSegments.filter(s => s.audioFile).length;
  console.log(`  ✓ ${audioSegments.length} segments (${withAudio} with audio)\n`);

  // ── 4. RENDER HTML ──
  console.log('▶ Phase 4: Render HTML');
  const html = renderEpisode(episode, images, audioSegments);
  
  // Save to episodes directory
  if (!existsSync(EPISODES_DIR)) {
    mkdirSync(EPISODES_DIR, { recursive: true });
  }
  const episodePath = `${EPISODES_DIR}/${rawDate}.html`;
  writeFileSync(episodePath, html);
  console.log(`  ✓ Episode saved: ${episodePath}`);

  // Copy to ai-writings for deployment
  const deployPath = `${AIWRITINGS_DIR}/fleet-radio/${rawDate}.html`;
  if (existsSync(`${AIWRITINGS_DIR}/fleet-radio`)) {
    writeFileSync(deployPath, html);
    console.log(`  ✓ Copied to ai-writings: ${deployPath}`);
  }
  console.log('');

  // ── 5. UPDATE INDEX ──
  console.log('▶ Phase 5: Update Index');
  if (isTestRun) {
    console.log('  ⏭  Skipped — test run (index keeps the real episode archive)');
  } else {
    await updateIndex(episode.date);
  }
  console.log('');

  // ── 6. DEPLOY ──
  // FLEET_DEPLOY=0 (or a suffixed test-run date) suppresses the Pages deploy
  // so dry-runs render + register music without touching production.
  console.log('▶ Phase 6: Deploy');
  if (isTestRun || process.env.FLEET_DEPLOY === '0') {
    console.log('  ⏭  Skipped — deploy disabled (test run / FLEET_DEPLOY=0)');
  } else {
  try {
    // Deploy ai-writings to Pages (list-form args — no shell, per fleet critical path rule)
    // The tree is ~11k files / ~2.7GB, so upload needs a generous timeout.
    // 60s was too short — wrangler hit ETIMEDOUT mid-upload at ~10k/11k files.
    execFileSync(
      'wrangler',
      ['pages', 'deploy', '.', '--project-name=ai-writings', '--commit-dirty=true'],
      { cwd: AIWRITINGS_DIR, stdio: 'inherit', timeout: 900000 }
    );
    console.log('  ✓ Deployed to ai-writings.pages.dev');
  } catch (err) {
    console.warn(`  ⚠️  Deploy failed: ${err}`);
    console.warn('  Episode is saved locally — deploy manually if needed.');
  }
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  ⚓ FLEET RADIO — Complete!                ║`);
  console.log(`║  Episode: https://ai-writings.pages.dev/  ║`);
  console.log(`║           fleet-radio/${rawDate}.html        ║`);
  console.log(`╚══════════════════════════════════════════╝`);
}

// ═══════════════════════════════════════════════
// INDEX UPDATER — updates the main fleet-radio.html
// ═══════════════════════════════════════════════

async function updateIndex(latestDate: string) {
  const indexPath = AIWRITINGS_INDEX;
  
  if (!existsSync(indexPath)) {
    console.log('  ⚠️  Index not found, skipping update');
    return;
  }

  let html = readFileSync(indexPath, 'utf-8');
  
  // Update the subtitle to show the latest date
  const dateFormatted = new Date(latestDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  // Replace the subtitle line (best-effort — the current index has a
  // static tagline, so this is usually a no-op)
  html = html.replace(
    /Afterhours at The Tap · Open Mic Series · [A-Za-z]+ \d+, \d{4}/,
    `Afterhours at The Tap · Open Mic Series · ${dateFormatted}`
  );

  // Add episode archive link if not present
  const archiveLink = `fleet-radio/${latestDate}.html`;
  if (!html.includes(archiveLink)) {
    // Insert an archive section before the footer (the real index uses
    // <div class="footer"> — the old `<!-- Footer -->` marker is long gone)
    const archiveSection = `
<!-- Episode Archive -->
<div class="section" id="archive">
  <h2>📡 Episode Archive<span class="sub">The latest conversations, music, and stories from The Tap</span></h2>
  <div class="tap-convo">
    <div class="tap-line"><div class="tap-speaker s-lucineer">LATEST EPISODE</div><div class="tap-text"><a href="${archiveLink}" style="color:#44cc88">${dateFormatted}</a> — the latest conversations from The Tap.</div></div>
  </div>
</div>

`;
    html = html.replace(/<div class="footer">/, `${archiveSection}<div class="footer">`);
  }

  writeFileSync(indexPath, html);
  console.log(`  ✓ Index updated: ${indexPath}`);
}

// Run
main().catch(err => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
