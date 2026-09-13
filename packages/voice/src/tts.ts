import type { TTSOptions, VoiceProvider } from './types.js';

interface SpeechSynthesisUtterance extends EventTarget {
  text: string;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
}

interface SpeechSynthesisVoice {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

interface SpeechSynthesis extends EventTarget {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): SpeechSynthesisVoice[];
  readonly speaking: boolean;
  readonly paused: boolean;
}

declare global {
  interface Window {
    SpeechSynthesisUtterance: new (text?: string) => SpeechSynthesisUtterance;
    speechSynthesis: SpeechSynthesis;
  }
}

export class WebTTSProvider implements VoiceProvider {
  readonly name = 'web-tts';
  private synthesis: SpeechSynthesis | null = null;

  get isAvailable(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    );
  }

  constructor() {
    if (this.isAvailable) {
      this.synthesis = window.speechSynthesis;
    }
  }

  async stt(): Promise<import('./types.js').STTResult> {
    throw new Error('WebTTSProvider does not support STT. Use WebSpeechProvider instead.');
  }

  async tts(text: string, options?: TTSOptions): Promise<void> {
    if (!this.synthesis) {
      throw new Error('Speech synthesis is not available');
    }

    return new Promise<void>((resolve, reject) => {
      const utterance = new window.SpeechSynthesisUtterance(text);

      if (options?.voice) {
        const voices = this.synthesis.getVoices();
        const selectedVoice = voices.find(
          (v) => v.name === options.voice || v.lang === options.voice
        );
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      if (options?.speed !== undefined) {
        utterance.rate = options.speed;
      }
      if (options?.pitch !== undefined) {
        utterance.pitch = options.pitch;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        const error = event instanceof ErrorEvent ? event.message : 'Speech synthesis error';
        reject(new Error(error));
      };

      this.synthesis.speak(utterance);
    });
  }

  cancel(): void {
    this.synthesis?.cancel();
  }

  getVoices(): Array<{ name: string; lang: string; default: boolean }> {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices().map((v) => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
    }));
  }
}

export class ConsoleTTS implements VoiceProvider {
  readonly name = 'console-tts';

  get isAvailable(): boolean {
    return true;
  }

  async stt(): Promise<import('./types.js').STTResult> {
    throw new Error('ConsoleTTS does not support STT. Use ConsoleSTT instead.');
  }

  async tts(text: string, _options?: TTSOptions): Promise<void> {
    console.log(`[TTS] ${text}`);
  }
}