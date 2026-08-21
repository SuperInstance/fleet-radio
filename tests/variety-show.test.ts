// Fleet Radio — Tests for THE TAP VARIETY HOUR (second show format)
// Covers: music family contract reuse, bumper game exclusion, quote
// extraction (frontmatter-safe), weather buoy sourcing, template rendering.
//
// Run with: npx tsx --test tests/variety-show.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EpisodeGenerator, MUSIC_CATALOG } from '../src/generate-episode.ts';
import { VarietyShowGenerator } from '../src/variety-show.ts';
import { renderVarietyEpisode } from '../src/variety-template.ts';
import { VarietyEpisode, VoiceLine, BumperRound, ListenerLetter, WeatherReport, TriviaQuestion, MusicTrack } from '../src/types.ts';

// ═══════════════════════════════════════════════
// MUSIC FAMILY CONTRACT (the FIXED selectSongs contract)
// ═══════════════════════════════════════════════

describe('selectSongs family contract', () => {
  test('every catalog track has a family', () => {
    assert.ok(MUSIC_CATALOG.length >= 14);
    for (const t of MUSIC_CATALOG) {
      assert.ok(t.family, `track ${t.filename} missing family`);
    }
  });

  test('at most one track per family in any setlist', () => {
    const gen = new EpisodeGenerator();
    for (const mood of ['contemplative', 'energetic', 'melancholic', 'playful', 'mysterious', 'warm'] as const) {
      const songs = gen.selectSongs(mood, 50);
      const families = songs.map(s => s.family);
      assert.strictEqual(new Set(families).size, families.length, `family dup in ${mood} setlist`);
    }
  });

  test('known sibling families collide correctly', () => {
    const unplayed = MUSIC_CATALOG.filter(t => t.family === 'unplayed');
    assert.ok(unplayed.length >= 2, 'unplayed family has the indie-folk + ambient pair');
    const tapSings = MUSIC_CATALOG.filter(t => t.family === 'tap-sings');
    assert.ok(tapSings.length >= 2, 'tap-sings family has the cover pair');
  });
});

// ═══════════════════════════════════════════════
// BUMPER MUSIC GAME
// ═══════════════════════════════════════════════

describe('bumper music game', () => {
  test('rounds are real catalog tracks, not invented', () => {
    const gen = new VarietyShowGenerator();
    const jukebox = new EpisodeGenerator().selectSongs('warm', 5);
    const rounds = (gen as unknown as { buildBumperRounds(songs: MusicTrack[]): BumperRound[] })
      .buildBumperRounds(jukebox, 3);

    assert.strictEqual(rounds.length, 3);
    for (const round of rounds) {
      const known = MUSIC_CATALOG.find(t => t.filename === round.song.filename);
      assert.ok(known, `round song ${round.song.filename} is a real catalog track`);
      // Clue is the track's own description — real data
      assert.strictEqual(round.clue, known.description);
      // Bumper families never overlap the jukebox families
      assert.ok(!jukebox.some(j => j.family === round.song.family));
    }
  });
});

// ═══════════════════════════════════════════════
// LETTERS — quote extraction must skip frontmatter
// ═══════════════════════════════════════════════

describe('letter quote extraction', () => {
  test('skips frontmatter/studio-note paragraphs', () => {
    const gen = new VarietyShowGenerator() as unknown as {
      extractQuote(content: string, pattern: RegExp): string | null;
    };
    const content = [
      '**Date:** 2026-08-20',
      '**Prompt:** "A lighthouse keeper discovers the light has been writing letters in her name."',
      '',
      '> I am but a lighthouse. Yet in this strange correspondence, I have become something more — a bearer of hopes, a keeper of tales.',
      '',
      '## The fingerprint',
      'Roleplay-first epistemology.',
    ].join('\n\n');

    const quote = gen.extractQuote(content, /lighthouse|light/);
    assert.ok(quote);
    assert.ok(quote!.includes('I am but a lighthouse'), 'picks the response, not the prompt');
    assert.ok(!quote!.includes('**Prompt:**'), 'never quotes the studio notes');
    assert.ok(!quote!.includes('**Date:**'), 'never quotes frontmatter');
  });
});

// ═══════════════════════════════════════════════
// WEATHER BUOY — sourced from real repos
// ═══════════════════════════════════════════════

describe('weather buoy', () => {
  test('reports come from real git repos with real hashes', () => {
    const gen = new VarietyShowGenerator();
    const weather = gen.collectFleetWeather('2026-08-20', 5);

    assert.ok(weather.length >= 3, `expected at least 3 reports, got ${weather.length}`);
    for (const w of weather) {
      assert.match(w.commit, /^[0-9a-f]{7}$/, `commit ${w.commit} is a real short hash`);
      assert.ok(w.detail.length > 10, 'detail is a real commit subject');
      assert.ok(w.region.length > 0);
    }
  });

  test('fleet is alive — the buoy has something to report', () => {
    const gen = new VarietyShowGenerator();
    const weather = gen.collectFleetWeather('2026-08-20', 5);
    const reports = weather.map(w => w.detail.toLowerCase().split(' ').slice(0, 4).join(' '));
    assert.ok(weather.length > 0, 'fleet committed something in the last day');
    assert.ok(reports.every(r => r.length > 0));
  });
});

// ═══════════════════════════════════════════════
// TEMPLATE — renders every segment
// ═══════════════════════════════════════════════

describe('renderVarietyEpisode', () => {
  const voice = (speaker: string, css: string): VoiceLine => ({
    speaker, voiceId: 'steady_narrator', cssClass: css, text: 'Hello fleet.', audioFile: null,
  });
  const episode: VarietyEpisode = {
    date: '2026-08-20',
    title: 'THE TAP VARIETY HOUR',
    subtitle: 'Fleet Radio Variety · August 20, 2026',
    mood: 'warm',
    heroQuote: 'A real line.',
    heroSpeaker: 'Flash',
    coldOpen: [voice('Lucineer', 'host'), voice('Hermes', 'cohost')],
    bumperRounds: [{
      clue: MUSIC_CATALOG[0].description,
      song: MUSIC_CATALOG[0],
      revealed: true,
    }],
    letters: [{
      source: '~/ai-writings/earned-stories/the-tap-variety-show-night.md',
      from: 'A regular',
      excerpt: 'The chair stays.',
      reply: 'The mic stays too.',
    }],
    weather: [{
      region: 'High pressure over the Elephant grounds',
      condition: 'the slope is holding',
      detail: 'field: slope regression',
      repo: 'elephant',
      commit: '0430bdc',
    }],
    jukebox: MUSIC_CATALOG.slice(0, 3),
    trivia: [{
      question: 'Name the interval.',
      answer: '[-6.373, -0.107]',
      fact: 'slope-regression-results.json',
    }],
    signoff: [voice('Hermes', 'cohost')],
    images: [{ prompt: 'x', filename: 'variety-2026-08-20-01.jpg' }],
  };

  test('renders every segment heading', () => {
    const html = renderVarietyEpisode(episode, [{ filename: '01-boat-at-dusk.jpg', caption: 'The boat at dusk.' }]);
    for (const heading of [
      'Cold Open', 'The Bumper Music Game', 'Letters to the Lighthouse',
      'The Weather Buoy', 'Jukebox Request Line', 'The Bar Bet', 'Sign-off',
    ]) {
      assert.ok(html.includes(heading), `missing section: ${heading}`);
    }
  });

  test('renders TTS hook when audio is missing (auth-blocked)', () => {
    const html = renderVarietyEpisode(episode, []);
    assert.ok(html.includes('TTS OFFLINE — SCRIPT ONLY (AUDIO HOOK PRESENT)'));
    // And the hook structure is there for when tts-pipeline fills audioFile
    assert.ok(html.includes('audio-hook') || html.includes('tts-off'));
  });

  test('escapes user-sourced content (no XSS regression)', () => {
    const evil: VarietyEpisode = {
      ...episode,
      heroQuote: '<script>alert(1)</script>',
      letters: [{
        source: 'x',
        from: '<img src=x onerror=alert(1)>',
        excerpt: '<b>bold</b>',
        reply: '<i>italic</i>',
      }],
    };
    const html = renderVarietyEpisode(evil, []);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
