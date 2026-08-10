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
import { ScoredLine, AudioSegment } from './types';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const EPISODES_DIR = '/home/eileen/projects/fleet-radio/episodes';
const AIWRITINGS_DIR = '/home/eileen/projects/ai-writings';
const AIWRITINGS_INDEX = `${AIWRITINGS_DIR}/fleet-radio.html`;

async function main() {
  const date = process.argv[2] || new Date().toLocaleDateString('en-CA', { 
    timeZone: 'America/Anchorage' 
  });
  
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  ⚓ FLEET RADIO — Pipeline Runner         ║`);
  console.log(`║  Episode: ${date}                   ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // ── 1. GENERATE EPISODE ──
  console.log('▶ Phase 1: Episode Generation');
  const generator = new EpisodeGenerator();
  const episode = await generator.generate(date);
  console.log(`  ✓ Episode assembled\n`);

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
  const html = renderEpisode(episode, images);
  
  // Save to episodes directory
  if (!existsSync(EPISODES_DIR)) {
    mkdirSync(EPISODES_DIR, { recursive: true });
  }
  const episodePath = `${EPISODES_DIR}/${date}.html`;
  writeFileSync(episodePath, html);
  console.log(`  ✓ Episode saved: ${episodePath}`);

  // Copy to ai-writings for deployment
  const deployPath = `${AIWRITINGS_DIR}/fleet-radio/${date}.html`;
  if (existsSync(`${AIWRITINGS_DIR}/fleet-radio`)) {
    writeFileSync(deployPath, html);
    console.log(`  ✓ Copied to ai-writings: ${deployPath}`);
  }
  console.log('');

  // ── 5. UPDATE INDEX ──
  console.log('▶ Phase 5: Update Index');
  await updateIndex(episode.date);
  console.log('');

  // ── 6. DEPLOY ──
  console.log('▶ Phase 6: Deploy');
  try {
    // Deploy ai-writings to Pages
    execSync(
      'wrangler pages deploy . --project-name=ai-writings --commit-dirty=true',
      { cwd: AIWRITINGS_DIR, stdio: 'inherit', timeout: 60000 }
    );
    console.log('  ✓ Deployed to ai-writings.pages.dev');
  } catch (err) {
    console.warn(`  ⚠️  Deploy failed: ${err}`);
    console.warn('  Episode is saved locally — deploy manually if needed.');
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  ⚓ FLEET RADIO — Complete!                ║`);
  console.log(`║  Episode: https://ai-writings.pages.dev/  ║`);
  console.log(`║           fleet-radio/${date}.html        ║`);
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

  // Replace the subtitle line
  html = html.replace(
    /Afterhours at The Tap · Open Mic Series · [A-Za-z]+ \d+, \d{4}/,
    `Afterhours at The Tap · Open Mic Series · ${dateFormatted}`
  );

  // Add episode archive link if not present
  const archiveLink = `fleet-radio/${latestDate}.html`;
  if (!html.includes(archiveLink)) {
    // Add an archive section before the footer
    const archiveSection = `
<!-- Episode Archive -->
<div class="section">
  <h2>📡 Episode Archive</h2>
  <div class="tap-convo">
    <div class="tap-line">
      <div class="tap-speaker lucineer">LATEST EPISODE</div>
      <div class="tap-text">
        <a href="${archiveLink}" style="color:#44cc88">${dateFormatted}</a>
        — The latest conversations, music, and stories from The Tap.
      </div>
    </div>
  </div>
</div>

`;
    // Insert before the footer
    html = html.replace(/<!-- Footer -->/, `${archiveSection}<!-- Footer -->`);
  }

  writeFileSync(indexPath, html);
  console.log(`  ✓ Index updated: ${indexPath}`);
}

// Run
main().catch(err => {
  console.error('❌ Pipeline failed:', err);
  process.exit(1);
});
