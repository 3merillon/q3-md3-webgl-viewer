import DeathMetalGenerator from './DeathMetalGenerator.js';

export default class AudioManager {
    constructor() {
        this.musicGenerator = null;
        this.isInitialized = false;
        this.pendingStart = false;
        this.musicVolume = 0.4;
        this._ctxGestureHooked = false;
    }

    async initialize(seed = Math.floor(Math.random() * 10000), opts = {}) {
        if (this.isInitialized) return;
        
        const config = {
            seed,
            volume: this.musicVolume,
            tempo: this._tempoFromSeed(seed),
            key: opts.key || 'E',
            scale: opts.scale || this._scaleFromSeed(seed)
        };
        
        this.musicGenerator = new DeathMetalGenerator(config);
        this.musicGenerator.setAutoMoodMode(true);
        this.isInitialized = true;
        
        if (this.pendingStart) {
            await this.startMusic();
            this.pendingStart = false;
        }
        
        this._bindUserGestureResume();
    }

    _bindUserGestureResume() {
        if (this._ctxGestureHooked || !this.musicGenerator || !this.musicGenerator.audioContext) return;
        this._ctxGestureHooked = true;
        
        const ac = this.musicGenerator.audioContext;
        const resume = async () => { 
            try { 
                if (ac.state === 'suspended') await ac.resume(); 
            } catch {} 
        };
        
        const events = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
        const handler = () => { resume(); };
        events.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
    }

    _tempoFromSeed(seed) { 
        return 120 + Math.floor((seed % 1000) / 12); // 120-200 BPM range for metal
    }
    
    _scaleFromSeed(seed) {
        const scales = ['phrygian', 'naturalMinor', 'harmonicMinor', 'locrian', 'diminished'];
        return scales[Math.abs(seed) % scales.length];
    }

    async startMusic() {
        if (!this.isInitialized || !this.musicGenerator) {
            this.pendingStart = true;
            return;
        }
        try { 
            await this.musicGenerator.start(); 
        } catch (err) {
            console.warn('Failed to start music:', err);
        }
    }

    stopMusic() {
        if (this.musicGenerator) {
            try { 
                this.musicGenerator.stop(); 
            } catch {}
        }
    }

    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.musicGenerator) this.musicGenerator.setVolume(this.musicVolume);
    }

    getMusicVolume() { 
        return this.musicVolume; 
    }

    setSeed(seed) {
        if (this.musicGenerator) {
            const newTempo = this._tempoFromSeed(seed);
            this.musicGenerator.setTempo(newTempo);
            this.musicGenerator.setSeed(seed);
        }
    }

    setTempo(tempo) {
        if (this.musicGenerator) this.musicGenerator.setTempo(tempo);
    }

    isPlaying() {
        return this.musicGenerator ? this.musicGenerator.isActive() : false;
    }

    cleanup() {
        try { 
            if (this.musicGenerator) this.musicGenerator.stop(); 
        } catch {}
        this.isInitialized = false;
        this.musicGenerator = null;
    }
}