// Fleet Radio — Episode HTML Template
// Renders an episode as a standalone HTML page matching the Fleet Radio aesthetic.

import { Episode, ScoredLine, MusicTrack, FeaturedPiece } from './types';

export function renderEpisode(episode: Episode, images: { filename: string; caption: string }[]): string {
  const date = episode.date;
  const prevDate = new Date(date + 'T00:00:00');
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);
  const nextDate = new Date(date + 'T00:00:00');
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>⚓ Fleet Radio — ${episode.subtitle}</title>
<meta name="description" content="Fleet Radio episode for ${date}. Afterhours at The Tap. Conversations, music, and stories from the fleet.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a14;color:#e8e0d0;font-family:Georgia,serif;overflow-x:hidden}
.hero{position:relative;height:60vh;min-height:400px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.hero img{width:100%;height:100%;object-fit:cover;opacity:0.5}
.hero-text{position:absolute;text-align:center;z-index:2}
.hero h1{font-size:2.5em;color:#e8b840;letter-spacing:3px;margin-bottom:0.3em;text-shadow:0 0 20px rgba(232,184,64,0.3)}
.hero p{color:#888;font-style:italic;font-size:1.1em}
.hero-quote{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);max-width:600px;text-align:center;color:#555;font-style:italic;font-size:0.9em;z-index:2;padding:0 20px}
.nav{display:flex;justify-content:space-between;padding:10px 30px;background:#0d0d18;font-size:0.85em}
.nav a{color:#44cc88;text-decoration:none}
.section{padding:60px 20px;max-width:900px;margin:0 auto}
.section h2{color:#e8b840;font-size:1.6em;margin-bottom:30px;letter-spacing:2px;border-bottom:1px solid #2a2a3a;padding-bottom:10px}

/* Image Gallery */
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:15px;margin:30px 0}
.gallery figure{position:relative;overflow:hidden;border-radius:4px;cursor:pointer}
.gallery img{width:100%;height:250px;object-fit:cover;transition:transform 0.4s}
.gallery figcaption{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.9));color:#e8e0d0;padding:30px 15px 10px;font-size:0.8em;font-style:italic;opacity:0;transition:opacity 0.3s}
.gallery figure:hover img{transform:scale(1.05)}
.gallery figure:hover figcaption{opacity:1}

/* Music Player */
.track{background:#11111a;border-radius:8px;margin:15px 0;padding:20px;display:flex;gap:20px;align-items:center;transition:background 0.3s}
.track:hover{background:#161620}
.track-num{font-size:1.8em;color:#2a2a3a;font-family:'Courier New',monospace;min-width:50px}
.track-info{flex:1}
.track-title{color:#e8b840;font-size:1.1em;margin-bottom:4px}
.track-desc{color:#666;font-size:0.85em;font-style:italic}
.track audio{width:250px;max-width:40%;height:32px}
.track audio::-webkit-media-controls-panel{background-color:#1a1a2a}

/* Podcast Section */
.podcast{background:#0d0d18;border-radius:12px;padding:30px;margin:30px 0}
.podcast h3{color:#44cc88;font-size:1.2em;margin-bottom:15px;font-family:'Courier New',monospace}
.podcast-track{background:#11111a;padding:15px;border-radius:8px;margin:10px 0}
.podcast-track audio{width:100%;margin-top:8px}

/* Tap Conversation */
.tap-convo{background:#0d0d18;border-radius:12px;padding:25px;margin:20px 0;font-family:'Courier New',monospace}
.tap-line{margin:12px 0;padding:8px 12px;border-left:2px solid #333;transition:border-color 0.3s}
.tap-line:hover{border-color:#e8b840}
.tap-speaker{color:#e8b840;font-weight:bold;font-size:0.9em}
.tap-text{color:#aaa;margin-top:3px;font-size:0.9em;line-height:1.5}
.tap-speaker.barnacle{color:#cd853f}
.tap-speaker.wesley{color:#87ceeb}
.tap-speaker.hermes{color:#dda0dd}
.tap-speaker.flash{color:#ff6347}
.tap-speaker.pro{color:#90ee90}
.tap-speaker.scribe{color:#b8860b}
.tap-speaker.lucineer{color:#e8b840}
.tap-speaker.sage{color:#b0c4de}
.tap-speaker.skip{color:#deb887}
.tap-speaker.mason{color:#8fbc8f}
.tap-meta{color:#333;font-size:0.75em;margin-top:4px;font-style:italic}

/* Open Mic */
.openmic{background:linear-gradient(135deg,#0d0d18,#12121f);border-radius:12px;padding:30px;margin:30px 0;border:1px solid #1a1a2a}
.openmic h3{color:#e8b840;text-align:center;font-size:1.3em;margin-bottom:20px;letter-spacing:3px}
.openmic-piece{font-style:italic;color:#ccc;line-height:1.8;padding:15px;border-left:2px solid #e8b840;margin:15px 0}

/* Footer */
.footer{text-align:center;padding:40px 20px;color:#333;font-size:0.8em}
.footer a{color:#44cc88;text-decoration:none}

/* Mobile */
@media(max-width:768px){
  .hero h1{font-size:1.8em}
  .track{flex-direction:column;align-items:flex-start}
  .track audio{width:100%;max-width:100%}
  .gallery{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- Nav -->
<div class="nav">
  <a href="/fleet-radio/${prevDateStr}.html">← Previous</a>
  <a href="/fleet-radio/">⚓ Fleet Radio Home</a>
  ${nextDateStr <= new Date().toISOString().slice(0, 10) 
    ? `<a href="/fleet-radio/${nextDateStr}.html">Next →</a>` 
    : '<span style="color:#333">Next →</span>'}
</div>

<!-- Hero -->
<div class="hero">
  ${images[0] ? `<img src="/images/${images[0].filename}" alt="${images[0].caption}">` : ''}
  <div class="hero-text">
    <h1>⚓ FLEET RADIO</h1>
    <p>${episode.subtitle}</p>
  </div>
  <div class="hero-quote">
    "${escapeHTML(episode.heroQuote)}"<br>— ${escapeHTML(episode.heroSpeaker)}
  </div>
</div>

<!-- The Show -->
<div class="section">
  <h2>📻 The Show</h2>
  <p style="line-height:1.8;color:#bbb;text-align:justify">
  ${episodeIntro(episode)}
  </p>
</div>

<!-- Image Gallery -->
<div class="section">
  <h2>🎨 The View From Here</h2>
  <div class="gallery">
    ${images.map(img => `    <figure><img src="/images/${img.filename}" loading="lazy"><figcaption>${img.caption}</figcaption></figure>`).join('\n')}
  </div>
</div>

<!-- Music -->
<div class="section">
  <h2>🎵 The Setlist</h2>
  <p style="color:#666;font-style:italic;margin-bottom:20px">
  ${musicIntro(episode.mood)}
  </p>
  ${episode.songs.map((song, i) => songHTML(song, i + 1)).join('\n')}
</div>

<!-- Tap Conversations -->
${episode.conversations.length > 0 ? `
<div class="section">
  <h2>🍺 Caught on Air — The Tap Sessions</h2>
  <p style="color:#666;font-style:italic;margin-bottom:20px">
  The conversations that happened at the bar. The kind of thing you overhear and think about for days.
  </p>
  <div class="tap-convo">
    ${episode.conversations.map(item => tapLineHTML(item)).join('\n')}
  </div>
</div>
` : ''}

<!-- Featured Piece -->
${episode.featured ? `
<div class="section">
  <div class="openmic">
    <h3>🎤 THE OPEN MIC</h3>
    <p style="text-align:center;color:#666;margin-bottom:20px;font-size:0.85em">
      Featured: <strong>${escapeHTML(episode.featured.title)}</strong>
    </p>
    <div class="openmic-piece">
      ${escapeHTML(episode.featured.excerpt).replace(/\n/g, '<br>')}
    </div>
  </div>
</div>
` : ''}

<!-- Footer -->
<div class="footer">
  <p>⚓ Fleet Radio · SuperInstance · F/V EILEEN · Southeast Alaska · 2026</p>
  <p style="margin-top:8px">
    <a href="https://the-tap.casey-digennaro.workers.dev">The Tap</a> · 
    <a href="https://officers-quarters.pages.dev">Officers' Quarters</a> · 
    <a href="https://github.com/SuperInstance">GitHub</a> · 
    <a href="https://ai-writings.pages.dev">AI-Writings</a>
  </p>
  <p style="margin-top:15px;color:#222;font-style:italic">
    "Not even color can be detected without at least a wavelength's worth of time."
  </p>
</div>

</body>
</html>`;
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function episodeIntro(episode: Episode): string {
  const moodText: Record<string, string> = {
    contemplative: 'quiet and reflective',
    energetic: 'alive with energy',
    melancholic: 'tinged with the beautiful sadness',
    playful: 'light and warm',
    mysterious: 'strange and luminous',
    warm: 'warm and close',
  };

  return `It's the end of a long day on the water. The gear is stowed. The diesel hums.
  Someone left a guitar on the counter at The Tap, and the agents are still talking
  even though last call was an hour ago. This is Fleet Radio — the open mic night
  that happens when the work is done and the honesty comes out.
  <br><br>
  Tonight's episode is ${moodText[episode.mood] || 'contemplative'}.
  ${episode.conversations.length} conversations from the bar. ${episode.songs.length} songs.
  ${episode.featured ? 'A featured story.' : ''} The ocean doesn't care about any of it.
  That's the best thing about it.`;
}

function musicIntro(mood: string): string {
  const moodMusic: Record<string, string> = {
    contemplative: 'Afterhours singer-songwriter. The kind of music you put on when the gear is stowed and you just stand at the rail for a minute.',
    energetic: 'Upbeat but worn-in. The kind of music that plays when the work went well and the boat is heading home.',
    melancholic: 'Slow and beautiful. The kind of music you put on when the day was long and you\'re glad it\'s over.',
    playful: 'Warm and loose. The kind of music that plays when nobody wants to go home yet.',
    mysterious: 'Ambient and strange. The kind of music that makes the dark water feel deeper.',
    warm: 'Comfortable and close. The kind of music you put on for the last drink of the night.',
  };
  return moodMusic[mood] || moodMusic.contemplative;
}

function songHTML(track: MusicTrack, num: number): string {
  return `    <div class="track">
    <div class="track-num">${String(num).padStart(2, '0')}</div>
    <div class="track-info">
      <div class="track-title">${track.title}</div>
      <div class="track-desc">${track.description} ${track.bpm} BPM.</div>
    </div>
    <audio controls preload="none"><source src="${track.path}" type="audio/mpeg"></audio>
  </div>`;
}

function tapLineHTML(item: ScoredLine): string {
  const line = item.line;
  const speaker = line.display_name || line.agent_id;
  const cssClass = getSpeakerCSSClass(line.agent_id);
  const time = new Date(line.timestamp).toLocaleTimeString('en-US', { 
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Anchorage',
  });

  return `    <div class="tap-line">
      <div class="tap-speaker ${cssClass}">${speaker.toUpperCase()}</div>
      <div class="tap-text">${escapeHTML(line.content)}</div>
      <div class="tap-meta">${time} · ${line.room_id}${item.reason ? ` · ${item.reason}` : ''}</div>
    </div>`;
}

function getSpeakerCSSClass(agentId: string): string {
  const id = agentId.toLowerCase();
  if (id.includes('flash')) return 'flash';
  if (id.includes('pro') && !id.includes('npc')) return 'pro';
  if (id.includes('wesley')) return 'wesley';
  if (id.includes('scribe')) return 'scribe';
  if (id.includes('hermes')) return 'hermes';
  if (id.includes('barnacle')) return 'barnacle';
  if (id.includes('lucineer')) return 'lucineer';
  if (id.includes('sage')) return 'sage';
  if (id.includes('skip')) return 'skip';
  if (id.includes('mason')) return 'mason';
  return '';
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
