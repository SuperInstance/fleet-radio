// Fleet Radio — Core Types

export interface TapLine {
  log_id: number;
  tick: number;
  room_id: string;
  agent_id: string;
  display_name: string;
  content: string;
  speech_act: string;
  signal_strength: number;
  tokens_used: number;
  timestamp: string;
  is_greatest_hit: number;
  tag: string | null;
}

export interface TapRoom {
  room_id: string;
  name: string;
  description: string;
  signal_radius: string;
  created_at: string;
  exits: string;
}

export interface ScoredLine {
  line: TapLine;
  score: number;
  reason: string;
}

export type Mood = 
  | 'contemplative' 
  | 'energetic' 
  | 'melancholic' 
  | 'playful' 
  | 'mysterious' 
  | 'warm';

export interface MusicTrack {
  filename: string;
  title: string;
  description: string;
  bpm: number;
  mood: Mood[];
  /** Song family — tracks from the same family are alternate renders of the same song.
   *  selectSongs() never picks two tracks from the same family in one episode. */
  family: string;
  path: string;
}

export interface FeaturedPiece {
  title: string;
  excerpt: string;
  source: string;
  fullContent?: string;
}

export interface GeneratedImage {
  prompt: string;
  filename: string;
  data?: Buffer;
  url?: string;
}

export interface Episode {
  date: string;
  title: string;
  subtitle: string;
  conversations: ScoredLine[];
  songs: MusicTrack[];
  featured: FeaturedPiece | null;
  images: GeneratedImage[];
  mood: Mood;
  heroQuote: string;
  heroSpeaker: string;
}

export interface VoiceProfile {
  speakerId: string;
  displayName: string;
  voiceId: string;
  description: string;
  cssClass: string;
}

export interface AudioSegment {
  speaker: string;
  text: string;
  audioFile: string | null;
  duration: number;
}

// ═══════════════════════════════════════════════
// VARIETY SHOW (THE TAP VARIETY HOUR) TYPES
// ═══════════════════════════════════════════════

/** A scripted radio line with a fleet voice. audioFile is the TTS hook —
 *  null when TTS is unavailable (auth-blocked), filled by tts-pipeline. */
export interface VoiceLine {
  speaker: string;      // display name (e.g. 'Lucineer', 'Hermes')
  voiceId: string;      // tts-pipeline voice id (e.g. 'steady_narrator')
  cssClass: string;     // host | cohost
  text: string;
  audioFile: string | null;
}

/** One round of the Bumper Music Game: a real clue (the track's own
 *  catalog description) and the real answer (the track title). */
export interface BumperRound {
  clue: string;
  song: MusicTrack;
  revealed: boolean;
}

/** A listener letter: a real quote from a real fleet file + a reply. */
export interface ListenerLetter {
  source: string;       // real file path (model-portraits/, earned-stories/, chronicle/)
  from: string;         // attributed sender, derived from the source file
  excerpt: string;      // real quoted line from the file
  reply: string;        // fleet-voice reply
}

/** A Weather Buoy report — real recent fleet commits as weather. */
export interface WeatherReport {
  region: string;       // e.g. 'High pressure over the Elephant grounds'
  condition: string;    // short summary
  detail: string;       // real commit subject
  repo: string;
  commit: string;       // short hash
}

/** A Bar Bet trivia question — real fleet numbers behind every answer. */
export interface TriviaQuestion {
  question: string;
  answer: string;
  fact: string;         // the real data the question is built from
}

export interface VarietyEpisode {
  date: string;
  title: string;
  subtitle: string;
  mood: Mood;
  heroQuote: string;
  heroSpeaker: string;
  coldOpen: VoiceLine[];
  bumperRounds: BumperRound[];
  letters: ListenerLetter[];
  weather: WeatherReport[];
  jukebox: MusicTrack[];
  trivia: TriviaQuestion[];
  signoff: VoiceLine[];
  images: GeneratedImage[];
}
