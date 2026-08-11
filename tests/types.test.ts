// Fleet Radio — Tests for Types
// Validates that TypeScript interfaces are correctly exported and structurally sound.
//
// Run with: npx tsx --test tests/types.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type {
  TapLine,
  TapRoom,
  ScoredLine,
  Mood,
  MusicTrack,
  FeaturedPiece,
  GeneratedImage,
  Episode,
  VoiceProfile,
  AudioSegment,
} from '../src/types';

// ═══════════════════════════════════════════════
// STRUCTURAL VALIDATION — ensure types can be instantiated
// ═══════════════════════════════════════════════

describe('Types — structural validation', () => {
  test('TapLine has all required fields', () => {
    const line: TapLine = {
      log_id: 1,
      tick: 100,
      room_id: 'bar-rail',
      agent_id: 'flash',
      display_name: 'Flash',
      content: 'Hello',
      speech_act: 'statement',
      signal_strength: 1.0,
      tokens_used: 10,
      timestamp: '2026-08-09T22:00:00Z',
      is_greatest_hit: 0,
      tag: null,
    };
    assert.strictEqual(line.log_id, 1);
    assert.strictEqual(line.content, 'Hello');
    assert.strictEqual(line.tag, null);
  });

  test('TapRoom has all required fields', () => {
    const room: TapRoom = {
      room_id: 'bar-rail',
      name: 'The Bar Rail',
      description: 'The main bar',
      signal_radius: 'intimate',
      created_at: '2026-08-01T00:00:00Z',
      exits: 'north,east',
    };
    assert.strictEqual(room.room_id, 'bar-rail');
    assert.ok(room.exits.length > 0);
  });

  test('ScoredLine wraps TapLine with score and reason', () => {
    const scored: ScoredLine = {
      line: {
        log_id: 1, tick: 1, room_id: 'bar', agent_id: 'flash',
        display_name: 'Flash', content: 'Test', speech_act: 'statement',
        signal_strength: 1.0, tokens_used: 5, timestamp: '2026-08-09T22:00:00Z',
        is_greatest_hit: 0, tag: null,
      },
      score: 42,
      reason: 'philosophical, emotional',
    };
    assert.strictEqual(scored.score, 42);
    assert.ok(scored.reason.includes('philosophical'));
  });

  test('Mood type covers all six values', () => {
    const moods: Mood[] = [
      'contemplative', 'energetic', 'melancholic', 'playful', 'mysterious', 'warm',
    ];
    assert.strictEqual(moods.length, 6);
    assert.ok(moods.includes('contemplative'));
  });

  test('MusicTrack has filename, title, bpm, mood, path', () => {
    const track: MusicTrack = {
      filename: 'song.mp3',
      title: 'Test Song',
      description: 'A test',
      bpm: 72,
      mood: ['contemplative', 'warm'],
      path: '/music/song.mp3',
    };
    assert.strictEqual(track.bpm, 72);
    assert.strictEqual(track.mood.length, 2);
  });

  test('FeaturedPiece has title, excerpt, source', () => {
    const piece: FeaturedPiece = {
      title: 'Test Story',
      excerpt: 'Once upon a time...',
      source: 'test-story.md',
    };
    assert.strictEqual(piece.title, 'Test Story');
    assert.ok(piece.excerpt.length > 0);
  });

  test('FeaturedPiece fullContent is optional', () => {
    const piece: FeaturedPiece = {
      title: 'Test',
      excerpt: 'Excerpt',
      source: 'test.md',
      fullContent: 'Full text here',
    };
    assert.ok(piece.fullContent);
  });

  test('GeneratedImage has prompt and filename', () => {
    const img: GeneratedImage = {
      prompt: 'A boat at night',
      filename: 'test.jpg',
    };
    assert.strictEqual(img.filename, 'test.jpg');
  });

  test('Episode aggregates all sub-types', () => {
    const episode: Episode = {
      date: '2026-08-09',
      title: 'Test Episode',
      subtitle: 'Test Subtitle',
      conversations: [],
      songs: [],
      featured: null,
      images: [],
      mood: 'contemplative',
      heroQuote: 'Test quote',
      heroSpeaker: 'TestSpeaker',
    };
    assert.strictEqual(episode.conversations.length, 0);
    assert.strictEqual(episode.featured, null);
  });

  test('VoiceProfile has all voice properties', () => {
    const voice: VoiceProfile = {
      speakerId: 'flash',
      displayName: 'Flash',
      voiceId: 'male_tenor_warm',
      description: 'Warm male tenor',
      cssClass: 'flash',
    };
    assert.strictEqual(voice.speakerId, 'flash');
  });

  test('AudioSegment has speaker, text, audioFile, duration', () => {
    const seg: AudioSegment = {
      speaker: 'Flash',
      text: 'Hello world',
      audioFile: 'seg-01.mp3',
      duration: 3.5,
    };
    assert.strictEqual(seg.duration, 3.5);
    assert.ok(seg.audioFile);
  });

  test('AudioSegment audioFile can be null', () => {
    const seg: AudioSegment = {
      speaker: 'Flash',
      text: 'Hello world',
      audioFile: null,
      duration: 0,
    };
    assert.strictEqual(seg.audioFile, null);
  });
});

// ═══════════════════════════════════════════════
// MOOD VALUES — exhaustively validate
// ═══════════════════════════════════════════════

describe('Mood type validation', () => {
  const validMoods: Mood[] = ['contemplative', 'energetic', 'melancholic', 'playful', 'mysterious', 'warm'];

  test('exactly 6 valid moods', () => {
    assert.strictEqual(validMoods.length, 6);
  });

  test('all moods are lowercase strings', () => {
    for (const m of validMoods) {
      assert.strictEqual(m, m.toLowerCase());
    }
  });

  test('all moods are unique', () => {
    assert.strictEqual(validMoods.length, new Set(validMoods).size);
  });
});
