// ⚓ Fleet Radio — Variety Show HTML Template
// Renders THE TAP VARIETY HOUR as a standalone HTML page.
// Same aesthetic language as the daily episode template (gold #e8b840,
// teal #44cc88, dark #0a0a14, Georgia serif + Courier for radio script).
// Audio hooks: VoiceLine.audioFile renders an <audio> element when a TTS
// file exists; while TTS is auth-blocked the hook renders as a script-only
// tag so the structure is visible and the audio slot is present.

import { VarietyEpisode, VoiceLine, MusicTrack, BumperRound, ListenerLetter, WeatherReport, TriviaQuestion } from './types';

export function renderVarietyEpisode(episode: VarietyEpisode, images: { filename: string; caption: string }[]): string {
  const date = episode.date;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎪 ${episode.title} — ${episode.subtitle}</title>
<meta name="description" content="The Tap Variety Hour for ${date}. Bumper music game, letters to the lighthouse, weather buoy, jukebox request line, and the bar bet — one hour of the fleet, sourced from real files.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a14;color:#e8e0d0;font-family:Georgia,serif;overflow-x:hidden}
.hero{position:relative;height:60vh;min-height:400px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.hero img{width:100%;height:100%;object-fit:cover;opacity:0.5}
.hero-text{position:absolute;text-align:center;z-index:2}
.hero h1{font-size:2.2em;color:#e8b840;letter-spacing:4px;margin-bottom:0.3em;text-shadow:0 0 20px rgba(232,184,64,0.3)}
.hero p{color:#888;font-style:italic;font-size:1.1em}
.hero-tag{position:absolute;top:90px;left:50%;transform:translateX(-50%);color:#44cc88;font-family:'Courier New',monospace;font-size:0.75em;letter-spacing:3px;z-index:2}
.hero-quote{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);max-width:640px;text-align:center;color:#555;font-style:italic;font-size:0.9em;z-index:2;padding:0 20px}
.nav{display:flex;justify-content:space-between;padding:10px 30px;background:#0d0d18;font-size:0.85em}
.nav a{color:#44cc88;text-decoration:none}
.section{padding:60px 20px;max-width:900px;margin:0 auto}
.section h2{color:#e8b840;font-size:1.6em;margin-bottom:30px;letter-spacing:2px;border-bottom:1px solid #2a2a3a;padding-bottom:10px}
.section .seg-note{color:#666;font-style:italic;font-size:0.9em;margin-top:-18px;margin-bottom:30px}

/* Radio script — host / co-host lines */
.script{background:#0d0d18;border-radius:12px;padding:25px;margin:20px 0;font-family:'Courier New',monospace}
.script-line{margin:14px 0;padding:10px 14px;border-left:2px solid #333;transition:border-color 0.3s}
.script-line:hover{border-color:#e8b840}
.script-speaker{font-weight:bold;font-size:0.85em;letter-spacing:1px}
.script-speaker.host{color:#e8b840}
.script-speaker.cohost{color:#dda0dd}
.script-text{color:#bbb;margin-top:4px;font-size:0.92em;line-height:1.6}
.tts-off{display:inline-block;margin-top:6px;font-size:0.7em;color:#444;letter-spacing:1px;border:1px dashed #2a2a3a;padding:2px 8px;border-radius:3px}
.script-line audio{width:100%;margin-top:8px;height:32px}

/* Bumper music game */
.game-round{background:linear-gradient(135deg,#0d0d18,#12121f);border-radius:12px;padding:25px;margin:20px 0;border:1px solid #1a1a2a}
.game-clue{color:#ccc;font-style:italic;line-height:1.7;padding:12px 15px;background:#11111a;border-left:2px solid #44cc88;border-radius:0 6px 6px 0}
.game-clue .label{color:#44cc88;font-style:normal;font-weight:bold;letter-spacing:2px;font-size:0.8em;display:block;margin-bottom:6px}
.game-answer{margin-top:14px;color:#e8b840;font-weight:bold;font-size:1.05em}
.game-answer .bpm{color:#666;font-weight:normal;font-size:0.8em;margin-left:8px}

/* Letters */
.letter{background:#0d0d18;border-radius:12px;padding:25px;margin:20px 0}
.letter-from{color:#44cc88;font-size:0.85em;letter-spacing:1px;margin-bottom:10px;font-family:'Courier New',monospace}
.letter-quote{font-style:italic;color:#ccc;line-height:1.8;padding:12px 16px;border-left:2px solid #e8b840;margin:12px 0;background:#11111a;border-radius:0 6px 6px 0}
.letter-quote .label{color:#e8b840;font-style:normal;font-weight:bold;letter-spacing:2px;font-size:0.8em;display:block;margin-bottom:6px}
.letter-reply{color:#aaa;line-height:1.7;padding:10px 16px;border-left:2px solid #dda0dd;margin:12px 0}
.letter-src{color:#333;font-size:0.7em;font-family:'Courier New',monospace;margin-top:6px}

/* Weather buoy */
.weather-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:15px;margin:20px 0}
.weather-card{background:#0d0d18;border-radius:10px;padding:18px;border:1px solid #1a1a2a;transition:border-color 0.3s}
.weather-card:hover{border-color:#e8b840}
.weather-region{color:#e8b840;font-weight:bold;font-size:0.95em;margin-bottom:6px}
.weather-condition{color:#44cc88;font-size:0.85em;font-style:italic;margin-bottom:10px}
.weather-detail{color:#999;font-size:0.8em;line-height:1.5;font-family:'Courier New',monospace}
.weather-meta{color:#444;font-size:0.7em;margin-top:8px;font-family:'Courier New',monospace}

/* Jukebox tracks */
.track{background:#11111a;border-radius:8px;margin:15px 0;padding:20px;display:flex;gap:20px;align-items:center;transition:background 0.3s}
.track:hover{background:#161620}
.track-num{font-size:1.8em;color:#2a2a3a;font-family:'Courier New',monospace;min-width:50px}
.track-info{flex:1}
.track-title{color:#e8b840;font-size:1.1em;margin-bottom:4px}
.track-desc{color:#666;font-size:0.85em;font-style:italic}
.track audio{width:250px;max-width:40%;height:32px}
.track audio::-webkit-media-controls-panel{background-color:#1a1a2a}

/* Bar bet trivia */
.trivia{background:linear-gradient(135deg,#0d0d18,#12121f);border-radius:12px;padding:25px;margin:20px 0;border:1px solid #1a1a2a}
.trivia-q{color:#e8e0d0;font-size:1em;line-height:1.6;font-weight:bold}
.trivia-a{margin-top:10px;color:#44cc88;font-size:0.95em}
.trivia-a .label{color:#888;font-weight:normal;font-size:0.8em;letter-spacing:2px;display:block;margin-bottom:4px}
.trivia-fact{margin-top:8px;color:#444;font-size:0.75em;font-family:'Courier New',monospace}

/* Show rundown */
.rundown{background:#0d0d18;border-radius:12px;padding:25px;margin:20px 0;font-family:'Courier New',monospace}
.rundown-line{margin:8px 0;color:#aaa;font-size:0.9em}
.rundown-line .time{color:#44cc88;margin-right:12px}

/* Footer */
.footer{text-align:center;padding:40px 20px;color:#333;font-size:0.8em}
.footer a{color:#44cc88;text-decoration:none}

@media(max-width:768px){
  .hero h1{font-size:1.5em}
  .track{flex-direction:column;align-items:flex-start}
  .track audio{width:100%;max-width:100%}
  .weather-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- Nav -->
<div class="nav">
  <a href="/fleet-radio/2026-08-20.html">← Daily Episode</a>
  <a href="/fleet-radio/">⚓ Fleet Radio Home</a>
  <span style="color:#333">Weekly Variety</span>
</div>

<!-- Hero -->
<div class="hero">
  ${images[0] ? `<img src="/images/${images[0].filename}" alt="${escapeHTML(images[0].caption)}">` : ''}
  <div class="hero-text">
    <h1>🎪 THE TAP VARIETY HOUR</h1>
    <p>${escapeHTML(episode.subtitle)}</p>
  </div>
  <div class="hero-tag">FLEET RADIO · SEVEN SEGMENTS · NO FILLER</div>
  <div class="hero-quote">
    "${escapeHTML(episode.heroQuote)}"<br>— ${escapeHTML(episode.heroSpeaker)}
  </div>
</div>

<!-- Rundown -->
<div class="section">
  <h2>📋 Tonight's Rundown</h2>
  <div class="rundown">
    <div class="rundown-line"><span class="time">00:00</span> Cold Open — the theme, the table</div>
    <div class="rundown-line"><span class="time">06:00</span> 🎶 The Bumper Music Game — three clues, three answers</div>
    <div class="rundown-line"><span class="time">18:00</span> 💌 Letters to the Lighthouse — listener mail, answered</div>
    <div class="rundown-line"><span class="time">30:00</span> 🌦 The Weather Buoy — the fleet's actual state</div>
    <div class="rundown-line"><span class="time">38:00</span> 🎵 Jukebox Request Line — five requests, family-deduped</div>
    <div class="rundown-line"><span class="time">50:00</span> 🎲 The Bar Bet — real numbers from the actual logs</div>
    <div class="rundown-line"><span class="time">58:00</span> Sign-off — the just-so one-liner</div>
  </div>
</div>

<!-- Segment 1: Cold Open -->
<div class="section">
  <h2>🎙 Cold Open</h2>
  <p class="seg-note">The host and the co-host set the table. Real fleet material only — everything you're about to hear happened.</p>
  <div class="script">
    ${episode.coldOpen.map(voiceLineHTML).join('\n')}
  </div>
</div>

<!-- Segment 2: Bumper Music Game -->
<div class="section">
  <h2>🎶 The Bumper Music Game</h2>
  <p class="seg-note">Three songs from the library. The host gives you the track's own catalog description — name that tune before the answer drops.</p>
  ${episode.bumperRounds.map((round, i) => bumperRoundHTML(round, i + 1)).join('\n')}
</div>

<!-- Segment 3: Letters to the Lighthouse -->
${episode.letters.length > 0 ? `
<div class="section">
  <h2>💌 Letters to the Lighthouse</h2>
  <p class="seg-note">Real mail from real fleet files — model portraits, earned stories, chronicle pages. Quoted verbatim, answered in fleet voice.</p>
  ${episode.letters.map(letterHTML).join('\n')}
</div>
` : ''}

<!-- Segment 4: Weather Buoy -->
${episode.weather.length > 0 ? `
<div class="section">
  <h2>🌦 The Weather Buoy</h2>
  <p class="seg-note">The fleet's actual state as weather — from real commits pushed in the last day.</p>
  <div class="weather-grid">
    ${episode.weather.map(weatherHTML).join('\n')}
  </div>
</div>
` : ''}

<!-- Segment 5: Jukebox Request Line -->
<div class="section">
  <h2>🎵 Jukebox Request Line</h2>
  <p class="seg-note">Five requests, mood-matched, at most one per family — the fixed setlist contract.</p>
  ${episode.jukebox.map((song, i) => songHTML(song, i + 1)).join('\n')}
</div>

<!-- Segment 6: Bar Bet -->
<div class="section">
  <h2>🎲 The Bar Bet</h2>
  <p class="seg-note">Trivia with real fleet numbers behind every answer. No invented facts — the answers are in the logs.</p>
  ${episode.trivia.map(triviaHTML).join('\n')}
</div>

<!-- Segment 7: Sign-off -->
<div class="section">
  <h2>🌊 Sign-off</h2>
  <div class="script">
    ${episode.signoff.map(voiceLineHTML).join('\n')}
  </div>
</div>

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

function voiceLineHTML(vl: VoiceLine): string {
  const audio = vl.audioFile
    ? `<audio controls preload="none"><source src="/audio/${escapeHTML(vl.audioFile)}" type="audio/mpeg"></audio>`
    : `<span class="tts-off">🔇 TTS OFFLINE — SCRIPT ONLY (AUDIO HOOK PRESENT)</span>`;
  return `    <div class="script-line">
      <div class="script-speaker ${vl.cssClass}">${escapeHTML(vl.speaker.toUpperCase())}</div>
      <div class="script-text">${escapeHTML(vl.text)}</div>
      ${audio}
    </div>`;
}

function bumperRoundHTML(round: BumperRound, num: number): string {
  return `    <div class="game-round">
      <div class="game-clue"><span class="label">ROUND ${num} — THE CLUE</span>"${escapeHTML(round.clue)}"</div>
      <div class="game-answer">The answer: "${escapeHTML(round.song.title)}"<span class="bpm">${round.song.bpm} BPM</span></div>
    </div>`;
}

function letterHTML(letter: ListenerLetter): string {
  return `    <div class="letter">
      <div class="letter-from">✉ ${escapeHTML(letter.from.toUpperCase())}</div>
      <div class="letter-quote"><span class="label">THE LETTER</span>"${escapeHTML(letter.excerpt).replace(/\n/g, '<br>')}"</div>
      <div class="letter-reply"><strong style="color:#dda0dd">Reply from the lighthouse:</strong> ${escapeHTML(letter.reply)}</div>
      <div class="letter-src">source: ${escapeHTML(letter.source)}</div>
    </div>`;
}

function weatherHTML(w: WeatherReport): string {
  return `    <div class="weather-card">
      <div class="weather-region">${escapeHTML(w.region)}</div>
      <div class="weather-condition">${escapeHTML(w.condition)}</div>
      <div class="weather-detail">${escapeHTML(w.detail)}</div>
      <div class="weather-meta">${escapeHTML(w.repo)} @ ${escapeHTML(w.commit)}</div>
    </div>`;
}

function songHTML(track: MusicTrack, num: number): string {
  return `    <div class="track">
    <div class="track-num">${String(num).padStart(2, '0')}</div>
    <div class="track-info">
      <div class="track-title">${escapeHTML(track.title)}</div>
      <div class="track-desc">${escapeHTML(track.description)} ${track.bpm} BPM.</div>
    </div>
    <audio controls preload="none"><source src="${escapeHTML(track.path)}" type="audio/mpeg"></audio>
  </div>`;
}

function triviaHTML(q: TriviaQuestion): string {
  return `    <div class="trivia">
      <div class="trivia-q">${escapeHTML(q.question)}</div>
      <div class="trivia-a"><span class="label">THE BET</span>${escapeHTML(q.answer)}</div>
      <div class="trivia-fact">fact: ${escapeHTML(q.fact)}</div>
    </div>`;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
