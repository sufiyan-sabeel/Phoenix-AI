import type {
  VoiceProvider,
  VoiceState,
  STTResult,
  TTSOptions,
  VoiceManagerOptions,
  VoiceManagerEvents,
} from './types.js';

type VoiceEventListener<K extends keyof VoiceManagerEvents> = VoiceManagerEvents[K];

export class VoiceManager {
  private provider: VoiceProvider | null = null;
  private _state: VoiceState = 'idle';
  private listeners = new Map<string, Set<VoiceEventListener<any>>>();
  private abortControllers = new Set<AbortController>();

  constructor(options?: VoiceManagerOptions) {
    if (options?.provider) {
      this.provider = options.provider;
    }
    if (options?.onStateChange) {
      this.on('stateChange', options.onStateChange);
    }
    if (options?.onTranscript) {
      this.on('transcript', options.onTranscript);
    }
    if (options?.onError) {
      this.on('error', options.onError);
    }
  }

  get state(): VoiceState {
    return this._state;
  }

  get isAvailable(): boolean {
    return this.provider?.isAvailable ?? false;
  }

  initialize(provider: VoiceProvider): void {
    this.provider = provider;
  }

  async startListening(): Promise<STTResult> {
    if (!this.provider) {
      throw new Error('No voice provider initialized');
    }
    if (!this.provider.isAvailable) {
      throw new Error(`Voice provider "${this.provider.name}" is not available`);
    }
    if (this._state !== 'idle') {
      throw new Error(`Cannot start listening in state: ${this._state}`);
    }

    this.setState('listening');

    try {
      const result = await this.provider.stt();
      this.setState('idle');
      this.emit('transcript', result);
      return result;
    } catch (error) {
      this.setState('error');
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);

      setTimeout(() => {
        if (this._state === 'error') {
          this.setState('idle');
        }
      }, 2000);

      throw err;
    }
  }

  stopListening(): void {
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();

    if (this._state === 'listening') {
      this.setState('idle');
    }
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.provider) {
      throw new Error('No voice provider initialized');
    }
    if (!this.provider.isAvailable) {
      throw new Error(`Voice provider "${this.provider.name}" is not available`);
    }
    if (this._state !== 'idle') {
      throw new Error(`Cannot speak in state: ${this._state}`);
    }

    this.setState('speaking');
    this.emit('speakStart');

    try {
      await this.provider.tts(text, options);
      this.setState('idle');
      this.emit('speakEnd');
    } catch (error) {
      this.setState('error');
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);

      setTimeout(() => {
        if (this._state === 'error') {
          this.setState('idle');
        }
      }, 2000);

      throw err;
    }
  }

  reset(): void {
    this.stopListening();
    this.setState('idle');
  }

  on<K extends keyof VoiceManagerEvents>(event: K, listener: VoiceEventListener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  off<K extends keyof VoiceManagerEvents>(event: K, listener: VoiceEventListener<K>): void {
    this.listeners.get(event)?.delete(listener);
  }

  private setState(state: VoiceState): void {
    if (this._state === state) return;
    const previous = this._state;
    this._state = state;
    this.emit('stateChange', state, previous);
  }

  private emit<K extends keyof VoiceManagerEvents>(
    event: K,
    ...args: Parameters<VoiceManagerEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as (...a: unknown[]) => void)(...args);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }
}