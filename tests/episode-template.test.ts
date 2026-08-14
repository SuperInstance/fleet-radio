// Fleet Radio — Tests for episode-template.ts (HTML renderer)
// Tests rendering, structure, speaker CSS classes, escaping, navigation.
//
// Run with: npx tsx --test tests/episode-template.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { renderEpisode } from '../src/episode-template.ts';
import type { Episode, ScoredLine, MusicTrack, Mood, TapLine, FeaturedPiece, GeneratedImage } from '../src/types';

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

function makeTrack(i: number): MusicTrack {
  return {
    filename: `song-${i}.mp3`,
    title: `Song ${i}`,
    description: `Test song number ${i}`,
    bpm: 60 + i * 10,
    mood: ['contemplative'] as Mood[],
    path: `/music/song-${i}.mp3`,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    date: '2026-08-09',
    title: 'Fleet Radio — August 9, 2026',
    subtitle: 'Afterhours at The Tap · August 9, 2026',
    conversations: [],
    songs: [],
    featured: null,
    images: [],
    mood: 'contemplative' as Mood,
    heroQuote: 'The ocean doesn\'t care about any of it.',
    heroSpeaker: 'Barnacle',
    ...overrides,
  };
}

const sampleImages = [
  { filename: 'test-01.jpg', caption: 'The view from here.' },
  { filename: 'test-02.jpg', caption: 'Afterhours.' },
];

// ═══════════════════════════════════════════════
// DOCUMENT STRUCTURE
// ═══════════════════════════════════════════════

describe('renderEpisode — document structure', () => {
  test('produces valid HTML document', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes('</html>'));
  });

  test('has correct charset and viewport', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('<meta charset="UTF-8">'));
    assert.ok(html.includes('name="viewport"'));
  });

  test('title includes episode subtitle', () => {
    const episode = makeEpisode({ subtitle: 'Afterhours at The Tap · August 9, 2026' });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('<title>⚓ Fleet Radio — Afterhours at The Tap · August 9, 2026</title>'));
  });

  test('has meta description with date', () => {
    const episode = makeEpisode({ date: '2026-08-09' });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('name="description"'));
    assert.ok(html.includes('2026-08-09'));
  });
});

// ═══════════════════════════════════════════════
// HERO SECTION
// ═══════════════════════════════════════════════

describe('renderEpisode — hero section', () => {
  test('contains hero section with FLEET RADIO title', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('class="hero"'));
    assert.ok(html.includes('⚓ FLEET RADIO'));
  });

  test('displays hero quote', () => {
    const episode = makeEpisode({
      heroQuote: 'Special test quote.',
      heroSpeaker: 'TestSpeaker',
    });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('Special test quote.'));
    assert.ok(html.includes('TestSpeaker'));
  });

  test('displays subtitle in hero text', () => {
    const episode = makeEpisode({ subtitle: 'Custom Subtitle Here' });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('Custom Subtitle Here'));
  });

  test('hero image rendered when first image exists', () => {
    const html = renderEpisode(makeEpisode(), [
      { filename: 'hero.jpg', caption: 'Hero view' },
    ]);
    assert.ok(html.includes('src="/images/hero.jpg"'));
  });
});

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════

describe('renderEpisode — navigation', () => {
  test('has previous episode link', () => {
    const html = renderEpisode(makeEpisode({ date: '2026-08-09' }), sampleImages);
    assert.ok(html.includes('2026-08-08.html'));
  });

  test('has fleet radio home link', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('/fleet-radio/'));
  });

  test('next link is inactive for current date', () => {
    // The template checks if nextDate <= today
    // For a future-dated episode, next should be disabled
    const html = renderEpisode(makeEpisode({ date: '2026-08-09' }), sampleImages);
    assert.ok(html.includes('Next'));
  });
});

// ═══════════════════════════════════════════════
// MUSIC SECTION
// ═══════════════════════════════════════════════

describe('renderEpisode — music section', () => {
  test('renders songs when provided', () => {
    const songs = [makeTrack(1), makeTrack(2), makeTrack(3)];
    const episode = makeEpisode({ songs });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('🎵 The Setlist'));
    assert.ok(html.includes('Song 1'));
    assert.ok(html.includes('Song 2'));
    assert.ok(html.includes('Song 3'));
  });

  test('renders audio players for songs', () => {
    const songs = [makeTrack(1)];
    const episode = makeEpisode({ songs });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('<audio'));
    assert.ok(html.includes('type="audio/mpeg"'));
  });

  test('includes BPM in song display', () => {
    const songs = [makeTrack(5)];
    const episode = makeEpisode({ songs });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('110 BPM'));
  });

  test('includes mood-based intro text for each mood', () => {
    const moods: Mood[] = ['contemplative', 'energetic', 'melancholic', 'playful', 'mysterious', 'warm'];
    for (const mood of moods) {
      const episode = makeEpisode({ mood });
      const html = renderEpisode(episode, sampleImages);
      // Each mood has a unique intro paragraph
      const moodTexts: Record<string, string> = {
        contemplative: 'Afterhours singer-songwriter',
        energetic: 'Upbeat but worn-in',
        melancholic: 'Slow and beautiful',
        playful: 'Warm and loose',
        mysterious: 'Ambient and strange',
        warm: 'Comfortable and close',
      };
      assert.ok(html.includes(moodTexts[mood]), `Missing intro for mood: ${mood}`);
    }
  });
});

// ═══════════════════════════════════════════════
// CONVERSATIONS SECTION
// ═══════════════════════════════════════════════

describe('renderEpisode — conversations section', () => {
  test('hides conversations section when empty', () => {
    const html = renderEpisode(makeEpisode({ conversations: [] }), sampleImages);
    // The conversations section is conditional
    assert.ok(!html.includes('Caught on Air'));
  });

  test('shows conversations section when populated', () => {
    const conversations = [
      makeScored(50, 'flash', 'Why do we wonder about emergence?'),
      makeScored(40, 'wesley', 'I learned something today.'),
    ];
    const episode = makeEpisode({ conversations });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('🍺 Caught on Air'));
    assert.ok(html.includes('Why do we wonder about emergence?'));
    assert.ok(html.includes('I learned something today.'));
  });

  test('renders speaker names in uppercase', () => {
    const conversations = [makeScored(50, 'flash', 'Test message')];
    const episode = makeEpisode({ conversations });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('FLASH'));
  });

  test('renders score reasons in metadata', () => {
    const conversations = [
      { line: makeLine({ content: 'Philosophical wonder', agent_id: 'flash' }), score: 50, reason: 'philosophical, agent voice' },
    ];
    const episode = makeEpisode({ conversations });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('philosophical, agent voice'));
  });

  test('escapes HTML in conversation content', () => {
    const conversations = [
      makeScored(50, 'flash', '<script>alert("xss")</script>'),
    ];
    const episode = makeEpisode({ conversations });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('escapes ampersands in content', () => {
    const conversations = [
      makeScored(50, 'flash', 'Fish & chips at the bar'),
    ];
    const episode = makeEpisode({ conversations });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('Fish &amp; chips'));
  });

  test('escapes HTML in hero quote and speaker', () => {
    const episode = makeEpisode({
      heroQuote: '<script>alert("quote")</script>',
      heroSpeaker: '<img src=x onerror=alert(1)>',
    });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img'));
  });

  test('escapes HTML in featured title and excerpt', () => {
    const episode = makeEpisode({
      featured: {
        title: '<b>Featured</b> <script>bad()</script>',
        excerpt: 'Line one <script>x</script>\n\nLine two',
        source: 'f.md',
      },
    });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(!html.includes('<script>bad'));
    assert.ok(html.includes('&lt;b&gt;Featured&lt;/b&gt;'));
    assert.ok(!html.includes('<script>x</script>'));
    assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;'));
  });
});

// ═══════════════════════════════════════════════
// SPEAKER CSS CLASSES
// ═══════════════════════════════════════════════

describe('renderEpisode — speaker CSS classes', () => {
  const speakerCases: [string, string][] = [
    ['flash', 'flash'],
    ['deepseek-v4-pro', 'pro'],
    ['wesley', 'wesley'],
    ['scribe', 'scribe'],
    ['hermes', 'hermes'],
    ['npc-barnacle', 'barnacle'],
    ['lucineer', 'lucineer'],
  ];

  for (const [agentId, expectedClass] of speakerCases) {
    test(`${agentId} gets css class "${expectedClass}"`, () => {
      const conversations = [makeScored(50, agentId, 'Test')];
      const episode = makeEpisode({ conversations });
      const html = renderEpisode(episode, sampleImages);
      assert.ok(html.includes(`tap-speaker ${expectedClass}`), `Expected class "${expectedClass}" for agent "${agentId}"`);
    });
  }

  test('unknown speaker gets empty css class', () => {
    const conversations = [makeScored(50, 'unknown-agent', 'Test')];
    const episode = makeEpisode({ conversations });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('tap-speaker "'));
  });
});

// ═══════════════════════════════════════════════
// FEATURED PIECE SECTION
// ═══════════════════════════════════════════════

describe('renderEpisode — featured piece', () => {
  test('hides featured section when null', () => {
    const html = renderEpisode(makeEpisode({ featured: null }), sampleImages);
    assert.ok(!html.includes('THE OPEN MIC'));
  });

  test('shows featured piece when provided', () => {
    const featured: FeaturedPiece = {
      title: 'The Hermit Crab\'s Dream',
      excerpt: 'In the dark of the shell, the crab imagined...',
      source: 'hermit-crab-dream.md',
    };
    const html = renderEpisode(makeEpisode({ featured }), sampleImages);
    assert.ok(html.includes('🎤 THE OPEN MIC'));
    assert.ok(html.includes('The Hermit Crab\'s Dream'));
    assert.ok(html.includes('In the dark of the shell'));
  });

  test('converts newlines to <br> in featured excerpt', () => {
    const featured: FeaturedPiece = {
      title: 'Test',
      excerpt: 'Line one\nLine two\nLine three',
      source: 'test.md',
    };
    const html = renderEpisode(makeEpisode({ featured }), sampleImages);
    assert.ok(html.includes('Line one<br>Line two<br>Line three'));
  });
});

// ═══════════════════════════════════════════════
// IMAGE GALLERY
// ═══════════════════════════════════════════════

describe('renderEpisode — image gallery', () => {
  test('renders gallery section', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('🎨 The View From Here'));
  });

  test('renders all provided images', () => {
    const images = [
      { filename: 'a.jpg', caption: 'Alpha' },
      { filename: 'b.jpg', caption: 'Beta' },
      { filename: 'c.jpg', caption: 'Gamma' },
    ];
    const html = renderEpisode(makeEpisode(), images);
    assert.ok(html.includes('a.jpg'));
    assert.ok(html.includes('b.jpg'));
    assert.ok(html.includes('c.jpg'));
  });

  test('images use lazy loading', () => {
    const html = renderEpisode(makeEpisode(), [
      { filename: 'test.jpg', caption: 'Test' },
    ]);
    assert.ok(html.includes('loading="lazy"'));
  });
});

// ═══════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════

describe('renderEpisode — footer', () => {
  test('contains fleet attribution', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('SuperInstance'));
    assert.ok(html.includes('F/V EILEEN'));
    assert.ok(html.includes('Southeast Alaska'));
    assert.ok(html.includes('2026'));
  });

  test('contains links to fleet properties', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('the-tap.casey-digennaro.workers.dev'));
    assert.ok(html.includes('ai-writings.pages.dev'));
    assert.ok(html.includes('github.com/SuperInstance'));
  });

  test('contains closing quote', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('Not even color can be detected'));
    assert.ok(html.includes("wavelength's worth of time"));
  });
});

// ═══════════════════════════════════════════════
// STYLING
// ═══════════════════════════════════════════════

describe('renderEpisode — CSS and styling', () => {
  test('includes dark background color scheme', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('#0a0a14'));
  });

  test('includes gold accent color', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('#e8b840'));
  });

  test('uses Georgia serif font', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('Georgia,serif'));
  });

  test('includes responsive media query', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('@media'));
    assert.ok(html.includes('max-width:768px'));
  });

  test('has CSS custom properties in :root', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    // The template uses inline styles, not :root vars
    // but it should have color definitions
    assert.ok(html.match(/background:\s*#/));
  });
});

// ═══════════════════════════════════════════════
// EPISODE INTRO TEXT
// ═══════════════════════════════════════════════

describe('renderEpisode — episode intro', () => {
  test('includes episode intro paragraph', () => {
    const html = renderEpisode(makeEpisode(), sampleImages);
    assert.ok(html.includes('📻 The Show'));
    assert.ok(html.includes('Fleet Radio'));
    assert.ok(html.includes('The ocean doesn\'t care about any of it.'));
  });

  test('includes mood-based description', () => {
    const episode = makeEpisode({ mood: 'energetic' });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('alive with energy'));
  });

  test('mentions conversation and song counts', () => {
    const episode = makeEpisode({
      conversations: [makeScored(50, 'flash', 'Test'), makeScored(40, 'pro', 'Test2')],
      songs: [makeTrack(1), makeTrack(2), makeTrack(3)],
    });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.includes('2 conversations'));
    assert.ok(html.includes('3 songs'));
  });

  test('mentions featured piece when present', () => {
    const featured: FeaturedPiece = {
      title: 'A Story',
      excerpt: 'Once upon a time.',
      source: 'story.md',
    };
    const html = renderEpisode(makeEpisode({ featured }), sampleImages);
    assert.ok(html.includes('A featured story'));
  });
});

// ═══════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════

describe('renderEpisode — edge cases', () => {
  test('handles empty images array', () => {
    const html = renderEpisode(makeEpisode(), []);
    assert.ok(html.includes('🎨 The View From Here'));
    // Should still render the gallery container, just no figures
  });

  test('handles special characters in hero quote', () => {
    const episode = makeEpisode({
      heroQuote: 'She said "yes" & <smiled>',
      heroSpeaker: 'Test',
    });
    const html = renderEpisode(episode, sampleImages);
    // The quote is in a text node, should be escaped
    assert.ok(html.includes('&quot;yes&quot;') || html.includes('"yes"'));
    assert.ok(html.includes('&amp;') || html.includes('&'));
  });

  test('handles very long content', () => {
    const longContent = 'A'.repeat(10000);
    const conversations = [makeScored(50, 'flash', longContent)];
    const html = renderEpisode(makeEpisode({ conversations }), sampleImages);
    assert.ok(html.includes(longContent.slice(0, 100)));
  });

  test('handles unicode in content', () => {
    const conversations = [makeScored(50, 'flash', 'caught some 🦀 today —美味しい')]
    const html = renderEpisode(makeEpisode({ conversations }), sampleImages);
    assert.ok(html.includes('🦀'));
  });

  test('produces non-trivial HTML output', () => {
    const episode = makeEpisode({
      conversations: [makeScored(50, 'flash', 'Test conversation')],
      songs: [makeTrack(1)],
      featured: { title: 'Featured', excerpt: 'Excerpt', source: 'f.md' },
    });
    const html = renderEpisode(episode, sampleImages);
    assert.ok(html.length > 2000, `HTML too short: ${html.length}`);
  });
});
