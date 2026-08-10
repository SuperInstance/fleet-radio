// Fleet Radio — Tests for EpisodeGenerator pure logic
// Tests scoring, mood analysis, music selection, image prompt generation.
//
// Run with: npx tsx --test tests/episode-generator.test.ts
//
// We import from a test harness to avoid the top-level await in generate-episode.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import the EpisodeGenerator class
import { EpisodeGenerator } from '../src/generate-episode.ts';

// Type imports for convenience (these don't trigger code execution)
interface TapLine {
  log_id: number; tick: number; room_id: string; agent_id: string;
  display_name: string; content: string; speech_act: string;
  signal_strength: number; tokens_used: number; timestamp: string;
  is_greatest_hit: number; tag: string | null;
}

interface ScoredLine { line: TapLine; score: number; reason: string; }
type Mood = 'contemplative' | 'energetic' | 'melancholic' | 'playful' | 'mysterious' | 'warm';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function makeLine(overrides: Partial<TapLine> = {}): TapLine {
  return {
    log_id: 1, tick: 100, room_id: 'bar-rail',
    agent_id: 'flash', display_name: 'Flash',
    content: 'Hello world', speech_act: 'statement',
    signal_strength: 1.0, tokens_used: 10,
    timestamp: '2026-08-09T22:00:00Z',
    is_greatest_hit: 0, tag: null,
    ...overrides,
  };
}

function makeScored(score: number, agent: string, content: string): ScoredLine {
  return { line: makeLine({ agent_id: agent, content }), score, reason: 'test' };
}

// ═══════════════════════════════════════════════
// SCORE AND SELECT — selectBest
// ═══════════════════════════════════════════════

describe('selectBest', () => {
  test('returns empty array for empty input', () => {
    const gen = new EpisodeGenerator();
    assert.strictEqual(gen.selectBest([], 5).length, 0);
  });

  test('returns fewer than requested when input is small', () => {
    const gen = new EpisodeGenerator();
    const lines = [makeLine({ content: 'Hello' }), makeLine({ content: 'World' })];
    assert.strictEqual(gen.selectBest(lines, 10).length, 2);
  });

  test('greatest hits get high scores', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ content: 'Normal line', is_greatest_hit: 0 }),
      makeLine({ content: 'Amazing line', is_greatest_hit: 1 }),
    ], 2);
    const hitLine = result.find(r => r.line.is_greatest_hit === 1);
    assert.ok(hitLine);
    assert.ok(hitLine!.score >= 50);
  });

  test('agent voices score higher than NPCs', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ agent_id: 'npc-fisherman', content: 'short' }),
      makeLine({ agent_id: 'flash', content: 'short' }),
    ], 2);
    const agentLine = result.find(r => r.line.agent_id === 'flash')!;
    const npcLine = result.find(r => r.line.agent_id === 'npc-fisherman')!;
    assert.ok(agentLine.score > npcLine.score);
  });

  test('philosophical content gets bonus', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ content: 'The weather is nice today.' }),
      makeLine({ content: 'Why do we wonder about the meaning of emergence?' }),
    ], 2);
    const philosophical = result.find(r => r.line.content.includes('wonder'));
    assert.ok(philosophical);
    assert.ok(philosophical!.reason.includes('philosophical'));
  });

  test('emotional content gets bonus', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ content: 'The system processed the request.' }),
      makeLine({ content: 'I feel hope when I see the beautiful ocean.' }),
    ], 2);
    const emotional = result.find(r => r.line.content.includes('hope'));
    assert.ok(emotional);
    assert.ok(emotional!.reason.includes('emotional'));
  });

  test('game commands are penalized', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ content: '/look around', tag: null }),
      makeLine({ content: 'What a beautiful night on the water.' }),
    ], 2);
    const command = result.find(r => r.line.content.startsWith('/'))!;
    assert.ok(command.score < 20);
  });

  test('speaker diversity is enforced (max 3 per speaker)', () => {
    const gen = new EpisodeGenerator();
    const lines: TapLine[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(makeLine({
        log_id: i, agent_id: 'flash',
        content: `Flash says something profound about the ocean ${i}`,
        is_greatest_hit: i < 5 ? 1 : 0,
      }));
    }
    for (let i = 0; i < 5; i++) {
      lines.push(makeLine({
        log_id: 100 + i, agent_id: 'wesley',
        content: `Wesley wonders about star ${i}`,
      }));
    }
    const result = gen.selectBest(lines, 8);
    const flashCount = result.filter(r => r.line.agent_id === 'flash').length;
    assert.ok(flashCount <= 3, `Flash had ${flashCount}, expected ≤ 3`);
  });

  test('results are sorted by timestamp', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ timestamp: '2026-08-09T23:00:00Z', content: 'Late' }),
      makeLine({ timestamp: '2026-08-09T21:00:00Z', content: 'Early' }),
      makeLine({ timestamp: '2026-08-09T22:00:00Z', content: 'Middle' }),
    ], 3);
    assert.strictEqual(result[0].line.content, 'Early');
    assert.strictEqual(result[1].line.content, 'Middle');
    assert.strictEqual(result[2].line.content, 'Late');
  });

  test('scores are non-negative', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ content: '/', tag: 'agent-api' }),
      makeLine({ agent_id: 'npc-x', content: 'ok' }),
    ], 2);
    for (const item of result) {
      assert.ok(item.score >= 0, `Score ${item.score} < 0`);
    }
  });

  test('self-reflective content gets bonus', () => {
    const gen = new EpisodeGenerator();
    const result = gen.selectBest([
      makeLine({ content: 'The weather is nice.' }),
      makeLine({ content: 'I wrote a poem. I learned something today.' }),
    ], 2);
    const reflective = result.find(r => r.line.content.includes('I wrote'));
    assert.ok(reflective);
    assert.ok(reflective!.reason.includes('self-reflective'));
  });

  test('substantive content (>200 chars) gets bonus', () => {
    const gen = new EpisodeGenerator();
    const long = 'This is a very substantive message. '.repeat(5) +
      'It discusses emergence in multi-agent systems and patterns that arise when independent minds interact through structured protocols.';
    const result = gen.selectBest([
      makeLine({ content: 'Hi.' }),
      makeLine({ content: long }),
    ], 2);
    const longResult = result.find(r => r.line.content.length > 200);
    assert.ok(longResult);
    assert.ok(longResult!.reason.includes('substantive'));
  });

  test('exact duplicates are penalized', () => {
    const gen = new EpisodeGenerator();
    const dup = 'Same exact message repeated';
    const result = gen.selectBest([
      makeLine({ content: dup }),
      makeLine({ content: dup }),
      makeLine({ content: dup }),
      makeLine({ content: 'Unique message with substance about emergence and wonder' }),
    ], 4);
    const dupResults = result.filter(r => r.line.content === dup);
    const unique = result.find(r => r.line.content !== dup);
    if (dupResults.length > 0 && unique) {
      assert.ok(unique.score >= dupResults[0].score);
    }
  });

  test('handles single line', () => {
    const gen = new EpisodeGenerator();
    assert.strictEqual(gen.selectBest([makeLine()], 5).length, 1);
  });

  test('count=0 returns empty', () => {
    const gen = new EpisodeGenerator();
    assert.strictEqual(gen.selectBest([makeLine(), makeLine()], 0).length, 0);
  });
});

// ═══════════════════════════════════════════════
// MOOD ANALYSIS — analyzeMood
// ═══════════════════════════════════════════════

describe('analyzeMood', () => {
  test('empty input defaults to contemplative', () => {
    assert.strictEqual(new EpisodeGenerator().analyzeMood([]), 'contemplative');
  });

  test('neutral content defaults to contemplative', () => {
    const gen = new EpisodeGenerator();
    assert.strictEqual(gen.analyzeMood([makeScored(10, 'x', 'The cat sat on the mat.')]), 'contemplative');
  });

  test('detects melancholic', () => {
    const gen = new EpisodeGenerator();
    const selected = [makeScored(10, 'x', 'I feel tired and alone in the dark. Sad about the rain.')];
    assert.strictEqual(gen.analyzeMood(selected), 'melancholic');
  });

  test('detects energetic', () => {
    const gen = new EpisodeGenerator();
    const selected = [makeScored(10, 'x', 'We built the system! The engine is live! Fast emergence and energy!')];
    assert.strictEqual(gen.analyzeMood(selected), 'energetic');
  });

  test('detects playful', () => {
    const gen = new EpisodeGenerator();
    const selected = [makeScored(10, 'x', 'This is fun! What a game! I love to laugh and play.')];
    assert.strictEqual(gen.analyzeMood(selected), 'playful');
  });

  test('detects mysterious', () => {
    const gen = new EpisodeGenerator();
    const selected = [makeScored(10, 'x', 'A secret in the shadow. Something strange and unknown in the dream.')];
    assert.strictEqual(gen.analyzeMood(selected), 'mysterious');
  });

  test('detects warm', () => {
    const gen = new EpisodeGenerator();
    const selected = [makeScored(10, 'x', 'The warmth of love and hope. Together at the table, friend. A gift, a song.')];
    assert.strictEqual(gen.analyzeMood(selected), 'warm');
  });

  test('competing moods — highest score wins', () => {
    const gen = new EpisodeGenerator();
    const selected = [
      makeScored(10, 'a', 'Why do we wonder about truth?'),
      makeScored(10, 'b', 'Why do we think about meaning?'),
      makeScored(10, 'c', 'Fun and games and play!'),
    ];
    assert.strictEqual(gen.analyzeMood(selected), 'contemplative');
  });

  test('every mood type detectable from single line', () => {
    const gen = new EpisodeGenerator();
    const cases: [string, string][] = [
      ['contemplative', 'Why do we wonder about truth and meaning?'],
      ['energetic', 'We built the system! The engine is live with energy!'],
      ['melancholic', 'I am tired, alone, sad in the dark rain tonight.'],
      ['playful', 'So much fun and play and games and laughter!'],
      ['mysterious', 'A secret dream, strange and unknown in the shadow.'],
      ['warm', 'The warmth of love and hope together, my friend.'],
    ];
    for (const [expected, text] of cases) {
      assert.strictEqual(gen.analyzeMood([makeScored(10, 'x', text)]), expected as Mood);
    }
  });
});

// ═══════════════════════════════════════════════
// MUSIC SELECTION — selectSongs
// ═══════════════════════════════════════════════

describe('selectSongs', () => {
  test('returns requested count', () => {
    assert.strictEqual(new EpisodeGenerator().selectSongs('contemplative', 5).length, 5);
  });

  test('count=0 returns empty', () => {
    assert.strictEqual(new EpisodeGenerator().selectSongs('energetic', 0).length, 0);
  });

  test('songs have proper structure', () => {
    const gen = new EpisodeGenerator();
    const songs = gen.selectSongs('melancholic', 3);
    for (const s of songs) {
      assert.ok(s.filename.length > 0);
      assert.ok(s.bpm > 0);
      assert.ok(s.title.length > 0);
      assert.ok(Array.isArray(s.mood));
    }
  });

  test('does not exceed catalog size (14)', () => {
    const gen = new EpisodeGenerator();
    const songs = gen.selectSongs('warm', 50);
    assert.ok(songs.length <= 14);
  });
});

// ═══════════════════════════════════════════════
// IMAGE PROMPT GENERATION
// ═══════════════════════════════════════════════

describe('generateImagePrompts', () => {
  test('returns at least one prompt for empty input', () => {
    assert.ok(new EpisodeGenerator().generateImagePrompts([], 'contemplative').length >= 1);
  });

  test('every mood produces at least one prompt', () => {
    const gen = new EpisodeGenerator();
    const moods: Mood[] = ['contemplative', 'energetic', 'melancholic', 'playful', 'mysterious', 'warm'];
    for (const mood of moods) {
      assert.ok(gen.generateImagePrompts([], mood).length >= 1);
    }
  });

  test('prompts are non-empty strings', () => {
    const gen = new EpisodeGenerator();
    const prompts = gen.generateImagePrompts(
      [makeScored(10, 'x', 'The ocean waves under starry sky')], 'contemplative'
    );
    for (const p of prompts) {
      assert.strictEqual(typeof p, 'string');
      assert.ok(p.length > 20);
    }
  });

  test('includes closing image with stars over ocean', () => {
    const gen = new EpisodeGenerator();
    const prompts = gen.generateImagePrompts([], 'contemplative');
    assert.ok(prompts.some(p => p.includes('Stars over calm ocean')));
  });

  test('limits to 5 prompts', () => {
    const gen = new EpisodeGenerator();
    const selected = Array(10).fill(0).map((_, i) =>
      makeScored(10, 'x', `The ocean under night sky with ${i} stars`)
    );
    assert.ok(gen.generateImagePrompts(selected, 'contemplative').length <= 5);
  });

  test('deduplicates identical prompts', () => {
    const gen = new EpisodeGenerator();
    const selected = [
      makeScored(10, 'a', 'The ocean water reflects light'),
      makeScored(10, 'b', 'The ocean water reflects light'),
      makeScored(10, 'c', 'The ocean water reflects light'),
    ];
    const prompts = gen.generateImagePrompts(selected, 'contemplative');
    assert.strictEqual(prompts.length, [...new Set(prompts)].length);
  });
});

// ═══════════════════════════════════════════════
// INTEGRATION
// ═══════════════════════════════════════════════

describe('pipeline integration', () => {
  test('selectBest → analyzeMood → selectSongs → generateImagePrompts', () => {
    const gen = new EpisodeGenerator();
    const lines: TapLine[] = [
      makeLine({ content: 'Why do we wonder about emergence?', agent_id: 'flash' }),
      makeLine({ content: 'I built the system today with high energy!', agent_id: 'pro' }),
      makeLine({ content: 'Feeling tired and alone in the rain tonight.', agent_id: 'wesley' }),
      makeLine({ content: 'What a beautiful gift to share together.', agent_id: 'hermes' }),
      makeLine({ content: 'A mysterious secret in the unknown dream.', agent_id: 'scribe' }),
    ];

    const selected = gen.selectBest(lines, 3);
    assert.ok(selected.length <= 3);

    const mood = gen.analyzeMood(selected);
    assert.ok(['contemplative', 'energetic', 'melancholic', 'playful', 'mysterious', 'warm'].includes(mood));

    const songs = gen.selectSongs(mood, 3);
    assert.strictEqual(songs.length, 3);

    const prompts = gen.generateImagePrompts(selected, mood);
    assert.ok(prompts.length >= 1);
    assert.ok(prompts.length <= 5);
  });
});
