import type { STTResult, VoiceProvider } from './types.js';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export class WebSpeechProvider implements VoiceProvider {
  readonly name = 'web-speech';
  private recognition: SpeechRecognition | null = null;
  private resolvePromise: ((result: STTResult) => void) | null = null;
  private rejectPromise: ((error: Error) => void) | null = null;

  get isAvailable(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }

  async stt(): Promise<STTResult> {
    if (!this.isAvailable) {
      throw new Error('Web Speech API is not available in this environment');
    }

    return new Promise<STTResult>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      const SpeechRecognitionConstructor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionConstructor();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        const result = event.results[event.resultIndex];
        if (result && result[0]) {
          const sttResult: STTResult = {
            text: result[0].transcript,
            confidence: result[0].confidence,
            language: this.recognition?.lang ?? 'en-US',
          };
          this.resolvePromise?.(sttResult);
          this.cleanup();
        }
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        this.rejectPromise?.(new Error(`Speech recognition error: ${event.error} - ${event.message}`));
        this.cleanup();
      };

      this.recognition.onend = () => {
        if (this.resolvePromise) {
          this.rejectPromise?.(new Error('Speech recognition ended without result'));
          this.cleanup();
        }
      };

      this.recognition.start();
    });
  }

  async tts(_text: string, _options?: import('./types.js').TTSOptions): Promise<void> {
    throw new Error('WebSpeechProvider does not support TTS. Use WebTTSProvider instead.');
  }

  abort(): void {
    this.recognition?.abort();
    this.cleanup();
  }

  private cleanup(): void {
    this.recognition = null;
    this.resolvePromise = null;
    this.rejectPromise = null;
  }
}

export class ConsoleSTT implements VoiceProvider {
  readonly name = 'console-stt';

  get isAvailable(): boolean {
    return true;
  }

  async stt(): Promise<STTResult> {
    return {
      text: '',
      confidence: 0,
      language: 'en-US',
    };
  }

  async tts(_text: string, _options?: import('./types.js').TTSOptions): Promise<void> {
    throw new Error('ConsoleSTT does not support TTS. Use ConsoleTTS instead.');
  }
}