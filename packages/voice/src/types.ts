export interface STTResult {
  text: string;
  confidence: number;
  language: string;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface VoiceProvider {
  readonly name: string;
  readonly isAvailable: boolean;
  stt(audioData?: ArrayBuffer): Promise<STTResult>;
  tts(text: string, options?: TTSOptions): Promise<void>;
}

export interface VoiceManagerOptions {
  provider?: VoiceProvider;
  onStateChange?: (state: VoiceState) => void;
  onTranscript?: (result: STTResult) => void;
  onError?: (error: Error) => void;
}

export interface VoiceManagerEvents {
  stateChange: (state: VoiceState) => void;
  transcript: (result: STTResult) => void;
  error: (error: Error) => void;
  speakStart: () => void;
  speakEnd: () => void;
}