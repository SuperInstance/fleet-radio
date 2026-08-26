// Fleet Radio — TTS Pipeline
// Converts Tap conversations into audio segments with distinct voices per agent.
//
// Voice assignments:
// - Flash:     warm male tenor, fast-paced
// - Pro:       measured male baritone, deliberate
// - Wesley:    young, earnest, slightly higher pitch
// - Scribe:    mysterious, slow, deliberate
// - Hermes:    calm female, measured, oceanic
// - Barnacle:  gruff old male, slow
// - Lucineer:  steady narrator voice
//
// TTS providers (in priority order):
// 1. MMX (mmx speech synthesize) — when quota is available
// 2. Cloudflare Workers AI TTS — @cf/myshell-ai/mptts
// 3. Fallback: provide text only, no audio

import { VoiceProfile, AudioSegment } from './types';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

const OUTPUT_DIR = '/home/eileen/projects/fleet-radio/episodes/audio';
const FFMPEG = '/home/eileen/.local/bin/ffmpeg';
const FFPROBE = '/home/eileen/.local/bin/ffprobe';

// ═══════════════════════════════════════════════
// VOICE PROFILES
// ═══════════════════════════════════════════════

const VOICE_MAP: VoiceProfile[] = [
  { speakerId: 'flash', displayName: 'Flash', voiceId: 'male_tenor_warm', description: 'Warm male tenor, fast-paced, energetic', cssClass: 'flash' },
  { speakerId: 'pro', displayName: 'Pro', voiceId: 'male_baritone_measured', description: 'Measured male baritone, deliberate', cssClass: 'pro' },
  { speakerId: 'wesley', displayName: 'Wesley', voiceId: 'young_earnest', description: 'Young, earnest, slightly higher pitch', cssClass: 'wesley' },
  { speakerId: 'scribe', displayName: 'Scribe', voiceId: 'mysterious_slow', description: 'Mysterious, slow, deliberate', cssClass: 'scribe' },
  { speakerId: 'hermes', displayName: 'Hermes', voiceId: 'calm_female_oceanic', description: 'Calm female, measured, oceanic', cssClass: 'hermes' },
  { speakerId: 'npc-barnacle', displayName: 'Barnacle', voiceId: 'gruff_old_male', description: 'Gruff old male, slow', cssClass: 'barnacle' },
  { speakerId: 'lucineer', displayName: 'Lucineer', voiceId: 'steady_narrator', description: 'Steady narrator voice', cssClass: 'lucineer' },
];

export class TTSPipeline {
  private outputDir: string;
  private mmxAvailable: boolean | null = null;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || OUTPUT_DIR;
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a single TTS segment for a speaker.
   */
  async generateSegment(speaker: string, text: string, episodeDate: string, segmentNum: number): Promise<AudioSegment> {
    const voice = this.getVoiceForSpeaker(speaker);
    const filename = `${episodeDate}-seg-${String(segmentNum).padStart(2, '0')}-${voice.speakerId}.mp3`;
    const filepath = `${this.outputDir}/${filename}`;

    // Clean text for TTS — remove markdown, stage directions
    const cleanText = this.cleanText(text);

    // Try MMX first
    if (this.isMmxAvailable()) {
      const success = await this.generateWithMMX(cleanText, voice, filepath);
      if (success) {
        return {
          speaker: voice.displayName,
          text: cleanText,
          audioFile: filename,
          duration: this.getAudioDuration(filepath),
        };
      }
    }

    // Try Cloudflare Workers AI TTS
    const cfSuccess = await this.generateWithCloudflareTTS(cleanText, voice, filepath);
    if (cfSuccess) {
      return {
        speaker: voice.displayName,
        text: cleanText,
        audioFile: filename,
        duration: this.getAudioDuration(filepath),
      };
    }

    // Fallback: text only, no audio
    console.warn(`  ⚠️  TTS failed for ${speaker}, providing text-only segment`);
    return {
      speaker: voice.displayName,
      text: cleanText,
      audioFile: null,
      duration: 0,
    };
  }

  /**
   * Assemble a complete podcast from segments and songs.
   * Order: intro music → conversation segments → songs between → outro
   */
  async assemblePodcast(
    segments: AudioSegment[], 
    songs: string[], 
    outputPath: string
  ): Promise<string | null> {
    if (!existsSync(FFMPEG)) {
      console.warn('  ⚠️  ffmpeg not available, skipping podcast assembly');
      return null;
    }

    try {
      // Build a concat list for ffmpeg
      const concatList: string[] = [];
      
      // Intro: first song (short snippet)
      if (songs.length > 0) {
        concatList.push(`file '${songs[0]}'`);
        // Trim intro to 30 seconds
        // (We'll handle this in the ffmpeg command)
      }

      // Interleave segments with songs
      let songIdx = 1;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.audioFile) {
          concatList.push(`file '${this.outputDir}/${seg.audioFile}'`);
        }
        // Insert a song between every 3 segments
        if ((i + 1) % 3 === 0 && songIdx < songs.length) {
          concatList.push(`file '${songs[songIdx]}'`);
          songIdx++;
        }
      }

      // Outro: last song
      if (songIdx < songs.length) {
        concatList.push(`file '${songs[songs.length - 1]}'`);
      }

      const concatFile = `${this.outputDir}/concat-list.txt`;
      const { writeFileSync } = await import('fs');
      writeFileSync(concatFile, concatList.join('\n'));

      // Run ffmpeg concat
      execFileSync(
        FFMPEG,
        ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', outputPath],
        { stdio: 'pipe', timeout: 60000 }
      );

      console.log(`  🎙️  Podcast assembled: ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.warn(`  ⚠️  Podcast assembly failed: ${err}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // TTS PROVIDERS
  // ──────────────────────────────────────────────

  private isMmxAvailable(): boolean {
    // MMX FROZEN by captain's order 2026-08-26 11:47 AKDT — "don't use mmx
    // until further notice." Set MMX_ENABLED=1 to re-arm when the freeze lifts.
    if (process.env.MMX_ENABLED === '1') return this.checkMmxBinary();
    return false;
  }

  private checkMmxBinary(): boolean {
    if (this.mmxAvailable !== null) return this.mmxAvailable;
    try {
      // (Previously an unimported execSync call: a latent ReferenceError made MMX silently unavailable on every run.)
      execFileSync('which', ['mmx'], { stdio: 'pipe' });
      this.mmxAvailable = true;
    } catch {
      this.mmxAvailable = false;
    }
    return this.mmxAvailable;
  }

  private async generateWithMMX(
    text: string, 
    voice: VoiceProfile, 
    outputPath: string
  ): Promise<boolean> {
    try {
      // MMX voice synthesis
      // Map our voice descriptions to MMX voice parameters
      const voiceParams = this.getMmxVoiceParams(voice.voiceId);
      
      execFileSync(
        'mmx',
        ['speech', 'synthesize', '--text', text, '--voice', voiceParams, '--out', outputPath],
        { stdio: 'pipe', timeout: 60000 }
      );
      
      if (existsSync(outputPath)) {
        console.log(`  🎤 MMX TTS: ${voice.displayName} → ${outputPath}`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async generateWithCloudflareTTS(
    text: string,
    voice: VoiceProfile,
    outputPath: string
  ): Promise<boolean> {
    try {
      // Cloudflare Workers AI TTS via wrangler
      // Using @cf/myshell-ai/mptts or similar model
      // For now, we'll use the Workers AI API directly
      
      const prompt = `${voice.description}. Speaking: "${text.slice(0, 500)}"`;
      
      // Use wrangler to call Workers AI
      // This is a simplified version — in production, deploy a dedicated Worker
      const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
      const scriptPath = `/tmp/fleet-radio-tts-${Date.now()}.js`;
      
      writeFileSync(scriptPath, `
        export default {
          async fetch(request, env) {
            const resp = await env.AI.run('@cf/myshell-ai/mptts', {
              text: ${JSON.stringify(text.slice(0, 1000))},
              voice: ${JSON.stringify(voice.voiceId)},
            });
            return new Response(resp.audio, {
              headers: { 'Content-Type': 'audio/mpeg' }
            });
          }
        };
      `);

      // For now, we mark as unavailable if MMX fails — CF Workers AI TTS 
      // requires a deployed Worker endpoint. This is a placeholder for when
      // that infrastructure is set up.
      unlinkSync(scriptPath);
      return false;
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  getVoiceForSpeaker(speakerId: string): VoiceProfile {
    const normalized = speakerId.toLowerCase();
    
    // Direct match
    const direct = VOICE_MAP.find(v => v.speakerId === normalized);
    if (direct) return direct;

    // Partial match
    const partial = VOICE_MAP.find(v => 
      normalized.includes(v.speakerId) || v.speakerId.includes(normalized)
    );
    if (partial) return partial;

    // Default: Lucineer narrator voice
    return VOICE_MAP.find(v => v.speakerId === 'lucineer')!;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\*[^*]*\*/g, '')     // Remove stage directions *like this*
      .replace(/\/\w+/g, '')          // Remove slash commands
      .replace(/#{1,6}\s/g, '')       // Remove markdown headers
      .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold markers
      .replace(/`([^`]+)`/g, '$1')    // Remove code formatting
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getMmxVoiceParams(voiceId: string): string {
    // Map our voice IDs to MMX voice parameters
    // Real MMX voice IDs (verified via `mmx speech voices` 2026-08-26).
    // The old IDs (male_warm etc.) never existed — "voice id not exist" on
    // every nightly run since 2026-08-20. These are the actual system voices.
    const voiceMap: Record<string, string> = {
      male_tenor_warm: 'English_magnetic_voiced_man',      // Flash
      male_baritone_measured: 'English_ManWithDeepVoice',   // Pro
      young_earnest: 'English_DecentYoungMan',              // Wesley
      mysterious_slow: 'English_CaptivatingStoryteller',    // Scribe
      calm_female_oceanic: 'English_SereneWoman',           // Hermes
      gruff_old_male: 'English_MaturePartner',              // Barnacle
      steady_narrator: 'English_expressive_narrator',       // Lucineer
    };
    return voiceMap[voiceId] || 'English_expressive_narrator';
  }

  private getAudioDuration(filepath: string): number {
    try {
      // Use ffprobe with JSON output — no shell, no pipes, no parsing grep
      const output = execFileSync(
        FFPROBE,
        ['-v', 'quiet', '-print_format', 'json', '-show_format', filepath],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const info = JSON.parse(output) as { format?: { duration?: string } };
      const duration = parseFloat(info.format?.duration || '0');
      return Number.isFinite(duration) ? duration : 0;
    } catch {
      return 0;
    }
  }
}
