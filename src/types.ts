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
