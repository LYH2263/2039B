const STORAGE_KEYS = {
  VOICE: 'tts_preferred_voice',
  RATE: 'tts_preferred_rate'
};

const DEFAULT_RATE = 1.0;
const MIN_RATE = 0.5;
const MAX_RATE = 2.0;

class TextToSpeech {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.utterance = null;
    this.currentSentenceIndex = -1;
    this.sentences = [];
    this.isPlaying = false;
    this.isPaused = false;
    this.onBoundary = null;
    this.onEnd = null;
    this.onVoicesChanged = null;
    this._boundVoicesChanged = this._loadVoices.bind(this);
    this._initialized = false;
  }

  isSupported() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  async init() {
    if (!this.isSupported()) {
      return false;
    }
    this.synth.onvoiceschanged = this._boundVoicesChanged;
    await this._loadVoices();
    this._initialized = true;
    return true;
  }

  async _loadVoices() {
    return new Promise((resolve) => {
      const loadVoices = () => {
        this.voices = this.synth.getVoices() || [];
        if (this.voices.length > 0) {
          resolve(this.voices);
          if (this.onVoicesChanged) {
            this.onVoicesChanged(this.voices);
          }
        } else {
          setTimeout(loadVoices, 100);
        }
      };
      loadVoices();
    });
  }

  getVoices() {
    return this.voices;
  }

  getVoicesByLang(lang) {
    if (!lang) return this.voices;
    return this.voices.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  }

  getPreferredVoice() {
    const stored = localStorage.getItem(STORAGE_KEYS.VOICE);
    if (stored) {
      const voice = this.voices.find(v => v.name === stored);
      if (voice) return voice;
    }
    
    const zhVoices = this.getVoicesByLang('zh');
    if (zhVoices.length > 0) return zhVoices[0];
    
    const enVoices = this.getVoicesByLang('en');
    if (enVoices.length > 0) return enVoices[0];
    
    return this.voices[0] || null;
  }

  setPreferredVoice(voiceName) {
    localStorage.setItem(STORAGE_KEYS.VOICE, voiceName);
  }

  getPreferredRate() {
    const stored = localStorage.getItem(STORAGE_KEYS.RATE);
    if (stored) {
      const rate = parseFloat(stored);
      if (!isNaN(rate) && rate >= MIN_RATE && rate <= MAX_RATE) {
        return rate;
      }
    }
    return DEFAULT_RATE;
  }

  setPreferredRate(rate) {
    const clamped = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
    localStorage.setItem(STORAGE_KEYS.RATE, clamped.toString());
    return clamped;
  }

  splitSentences(text) {
    if (!text) return [];
    
    const sentences = [];
    const zhSentences = [];
    const regex = /([^。！？!?]+[。！？!?]+|[^.!?]+$)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence) {
        zhSentences.push(sentence);
      }
    }
    
    if (zhSentences.length > 0) {
      zhSentences.forEach(s => {
        const hasChinese = /[\u4e00-\u9fa5]/.test(s);
        if (hasChinese) {
          sentences.push(s);
        } else {
          const enParts = s.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [s];
          enParts.forEach(p => {
            const trimmed = p.trim();
            if (trimmed) sentences.push(trimmed);
          });
        }
      });
    } else {
      const enSentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
      enSentences.forEach(s => {
        const trimmed = s.trim();
        if (trimmed) sentences.push(trimmed);
      });
    }
    
    return sentences.filter(s => s.length > 0);
  }

  speak(text, options = {}) {
    this.stop();
    
    this.sentences = this.splitSentences(text);
    this.currentSentenceIndex = -1;
    
    if (this.sentences.length === 0) {
      return false;
    }
    
    const voice = options.voice || this.getPreferredVoice();
    const rate = options.rate || this.getPreferredRate();
    
    this.onBoundary = options.onBoundary || null;
    this.onEnd = options.onEnd || null;
    
    this._speakNextSentence(voice, rate);
    
    this.isPlaying = true;
    this.isPaused = false;
    
    return true;
  }

  _speakNextSentence(voice, rate) {
    this.currentSentenceIndex++;
    
    if (this.currentSentenceIndex >= this.sentences.length) {
      this._handleEnd();
      return;
    }
    
    const sentence = this.sentences[this.currentSentenceIndex];
    
    if (this.onBoundary) {
      this.onBoundary({
        type: 'sentencestart',
        sentenceIndex: this.currentSentenceIndex,
        charIndex: 0,
        charLength: sentence.length
      });
    }
    
    this.utterance = new SpeechSynthesisUtterance(sentence);
    this.utterance.voice = voice;
    this.utterance.rate = rate;
    this.utterance.pitch = 1.0;
    this.utterance.volume = 1.0;
    
    const lang = this._detectLanguage(sentence);
    if (lang) {
      this.utterance.lang = lang;
    }
    
    this.utterance.onboundary = (event) => {
      if (this.onBoundary) {
        this.onBoundary({
          type: 'boundary',
          sentenceIndex: this.currentSentenceIndex,
          charIndex: event.charIndex,
          charLength: event.charLength || 1
        });
      }
    };
    
    this.utterance.onend = () => {
      this._speakNextSentence(voice, rate);
    };
    
    this.utterance.onerror = (event) => {
      console.error('TTS error:', event.error);
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        this._speakNextSentence(voice, rate);
      }
    };
    
    this.synth.speak(this.utterance);
  }

  _detectLanguage(text) {
    const zhCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const enCount = (text.match(/[a-zA-Z]/g) || []).length;
    
    if (zhCount > enCount) {
      return 'zh-CN';
    } else if (enCount > zhCount) {
      return 'en-US';
    }
    return null;
  }

  pause() {
    if (this.synth && this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  resume() {
    if (this.synth && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentSentenceIndex = -1;
    this.sentences = [];
  }

  setRate(rate) {
    const clamped = this.setPreferredRate(rate);
    if (this.isPlaying && this.utterance) {
      this.utterance.rate = clamped;
    }
    return clamped;
  }

  setVoice(voiceName) {
    this.setPreferredVoice(voiceName);
  }

  _handleEnd() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentSentenceIndex = -1;
    if (this.onEnd) {
      this.onEnd();
    }
  }

  destroy() {
    this.stop();
    if (this.synth) {
      this.synth.onvoiceschanged = null;
    }
    this.onBoundary = null;
    this.onEnd = null;
  }
}

const tts = new TextToSpeech();

export {
  tts,
  TextToSpeech,
  MIN_RATE,
  MAX_RATE,
  DEFAULT_RATE
};
