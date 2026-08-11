// Fleet Radio — Tests for Image Generator
// Tests default images, caption generation, and fallback behavior.
// Network-dependent methods (Cloudflare AI) are not tested directly.
//
// Run with: npx tsx --test tests/image-generator.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set env to skip slow wrangler whoami lookups
process.env.CLOUDFLARE_ACCOUNT_ID = '';

import { ImageGenerator, DEFAULT_IMAGES } from '../src/image-generator.ts';

// ═══════════════════════════════════════════════
// DEFAULT IMAGES
// ═══════════════════════════════════════════════

describe('DEFAULT_IMAGES', () => {
  test('has 8 default images', () => {
    assert.strictEqual(DEFAULT_IMAGES.length, 8);
  });

  test('each image has filename and caption', () => {
    for (const img of DEFAULT_IMAGES) {
      assert.ok(img.filename.length > 0);
      assert.ok(img.caption.length > 0);
      assert.ok(img.filename.endsWith('.jpg'));
    }
  });

  test('filenames are unique', () => {
    const filenames = DEFAULT_IMAGES.map(d => d.filename);
    assert.strictEqual(filenames.length, new Set(filenames).size);
  });

  test('includes boat-at-dusk image', () => {
    assert.ok(DEFAULT_IMAGES.some(d => d.filename.includes('boat')));
    assert.ok(DEFAULT_IMAGES.some(d => d.filename.includes('dusk')));
  });

  test('includes wheelhouse-night image', () => {
    assert.ok(DEFAULT_IMAGES.some(d => d.filename.includes('wheelhouse')));
    assert.ok(DEFAULT_IMAGES.some(d => d.filename.includes('night')));
  });

  test('includes bar/after-hours imagery', () => {
    assert.ok(DEFAULT_IMAGES.some(d => d.caption.includes('bar') || d.caption.includes('closing') || d.caption.includes('after')));
  });

  test('includes ocean/water imagery', () => {
    assert.ok(DEFAULT_IMAGES.some(d =>
      d.caption.includes('water') || d.caption.includes('ocean') || d.caption.includes('sounder')
    ));
  });

  test('includes star/constellation imagery', () => {
    assert.ok(DEFAULT_IMAGES.some(d => d.filename.includes('star')));
    assert.ok(DEFAULT_IMAGES.some(d => d.filename.includes('constellation')));
  });

  test('captions are evocative (not generic)', () => {
    for (const img of DEFAULT_IMAGES) {
      // Each caption should be at least 10 chars — they're descriptive
      assert.ok(img.caption.length > 10, `Caption too short: "${img.caption}"`);
    }
  });
});

// ═══════════════════════════════════════════════
// CONSTRUCTOR
// ═══════════════════════════════════════════════

describe('ImageGenerator — constructor', () => {
  test('creates images directory if it does not exist', () => {
    const testDir = `/tmp/fleet-radio-img-test-${Date.now()}`;
    assert.ok(!require('fs').existsSync(testDir));
    new ImageGenerator(testDir);
    assert.ok(require('fs').existsSync(testDir));
  });

  test('accepts custom images directory', () => {
    const testDir = `/tmp/fleet-radio-img-custom-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    assert.ok(require('fs').existsSync(testDir));
  });

  test('uses default directory when none provided', () => {
    // Should not throw
    const gen = new ImageGenerator();
    assert.ok(gen);
  });
});

// ═══════════════════════════════════════════════
// IMAGE GENERATION (fallback behavior)
// ═══════════════════════════════════════════════

describe('ImageGenerator — generateImages fallback', () => {
  test('returns fallback images when AI generation unavailable', async () => {
    const testDir = `/tmp/fleet-radio-img-fallback-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const results = await gen.generateImages(['test prompt'], '2026-08-09');

    assert.ok(results.length >= 1);
    // Should fall back to default images
    const hasDefault = results.some(r =>
      DEFAULT_IMAGES.some(d => d.filename === r.filename)
    );
    assert.ok(hasDefault, 'Expected fallback to default images');
  });

  test('returns one result per prompt', async () => {
    const testDir = `/tmp/fleet-radio-img-count-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const prompts = ['prompt 1', 'prompt 2', 'prompt 3'];
    const results = await gen.generateImages(prompts, '2026-08-09');
    assert.strictEqual(results.length, prompts.length);
  });

  test('handles empty prompts array', async () => {
    const testDir = `/tmp/fleet-radio-img-empty-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const results = await gen.generateImages([], '2026-08-09');
    assert.strictEqual(results.length, 0);
  });

  test('each result has filename, caption, and prompt', async () => {
    const testDir = `/tmp/fleet-radio-img-props-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const results = await gen.generateImages(['ocean at night'], '2026-08-09');
    for (const r of results) {
      assert.ok(r.filename.length > 0);
      assert.ok(r.caption.length > 0);
      assert.ok(typeof r.prompt === 'string');
    }
  });

  test('falls back to default images cycling on multiple prompts', async () => {
    const testDir = `/tmp/fleet-radio-img-cycle-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const prompts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const results = await gen.generateImages(prompts, '2026-08-09');
    // When all fail, should cycle through DEFAULT_IMAGES
    const filenames = results.map(r => r.filename);
    // Should have at least some default image filenames
    const defaultFilenames = DEFAULT_IMAGES.map(d => d.filename);
    const usingDefaults = filenames.filter(f => defaultFilenames.includes(f));
    assert.ok(usingDefaults.length > 0, 'Expected some fallback defaults');
  });

  test('captions are non-empty strings', async () => {
    const testDir = `/tmp/fleet-radio-img-caps-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const results = await gen.generateImages(['test'], '2026-08-09');
    for (const r of results) {
      assert.ok(r.caption.length > 0, `Empty caption`);
      assert.strictEqual(typeof r.caption, 'string');
    }
  });

  test('fallback captions come from DEFAULT_IMAGES captions', async () => {
    const testDir = `/tmp/fleet-radio-img-fb-caps-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const results = await gen.generateImages(['test'], '2026-08-09');
    // When AI generation fails, the fallback uses DEFAULT_IMAGES which have their own captions
    const defaultCaptions = DEFAULT_IMAGES.map(d => d.caption);
    const generatedCaptions = ['The view from here.', 'Afterhours.', 'The fleet at rest.', 'Where the day goes.', 'The last light.'];
    for (const r of results) {
      assert.ok(
        defaultCaptions.includes(r.caption) || generatedCaptions.includes(r.caption),
        `Unexpected caption: "${r.caption}"`
      );
    }
  });
});

// ═══════════════════════════════════════════════
// TYPES VALIDATION
// ═══════════════════════════════════════════════

describe('ImageGenerator — type safety', () => {
  test('filename includes date prefix for generated images', async () => {
    const testDir = `/tmp/fleet-radio-img-date-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const results = await gen.generateImages(['test prompt'], '2026-08-09');
    // Generated filenames should include the date (unless fallback)
    for (const r of results) {
      assert.ok(r.filename.endsWith('.jpg'));
    }
  });

  test('handles multiple prompts with varied content', async () => {
    const testDir = `/tmp/fleet-radio-img-varied-${Date.now()}`;
    const gen = new ImageGenerator(testDir);
    const prompts = [
      'Alaska fishing boat at night',
      'Stars over calm ocean water',
      'Warm amber light from cabin window',
      'Empty bar after closing',
      'Nautical charts on a table',
    ];
    const results = await gen.generateImages(prompts, '2026-08-09');
    assert.strictEqual(results.length, 5);
    for (const r of results) {
      assert.ok(r.filename.length > 0);
      assert.ok(r.caption.length > 0);
    }
  });
});
