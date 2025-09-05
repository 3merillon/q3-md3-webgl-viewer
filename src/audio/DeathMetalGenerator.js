export default class DeathMetalGenerator {
    constructor(config) {
        // Core audio graph
        this.audioContext = null;
        this.masterGain = null;
        this.compressor = null;
        this.reverb = null;
        this.delay = null;
        this.delayFeedback = null;
        this.delayWet = null;
        this.distortion = null;
        this.filter = null;
        this.filter2 = null;
        this.chorus = null;
        this.chorusLFO = null;
        this.chorusGain = null;
        this._lfoStarted = false; // NEW: delay LFO start until user gesture/resume

        // Runtime state
        this.isPlaying = false;
        this.config = { volume: 0.4, tempo: 140, seed: 1, ...(config || {}) };
        this.oscillators = [];
        this.envelopes = [];
        this.sequencePosition = 0;
        this.nextNoteTime = 0;
        this.lookahead = 25.0;
        this.scheduleAheadTime = 0.1;
        this.timerID = 0;

        // Music system state
        this.rng = null;
        this.currentKey = 0;
        this.currentScale = [];
        this.harmonicProgression = [];
        this.sectionLength = 32;
        this.currentSection = 0;
        this.currentMood = 'aggressive';
        this.moodIntensity = 0.8;
        this.targetIntensity = 0.8;
        this.layerStates = new Map();
        this.currentInstruments = new Map();
        this.autoMoodMode = false;
        this.nextMoodChange = 0;

        // Metal-specific
        this.riffPatterns = [];
        this.currentRiff = null;
        this.drumPattern = 0;
        this.beatPosition = 0;
        this.measurePosition = 0;
        this.lastChord = null;

        // Death metal scales and progressions
        this.scales = {
            naturalMinor:     [0, 2, 3, 5, 7, 8, 10],
            harmonicMinor:    [0, 2, 3, 5, 7, 8, 11],
            phrygian:         [0, 1, 3, 5, 7, 8, 10],
            locrian:          [0, 1, 3, 5, 6, 8, 10],
            diminished:       [0, 2, 3, 5, 6, 8, 9, 11],
            chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        };

        this.metalProgressions = {
            aggressive:  [[0, 3, 6, 2], [0, 5, 1, 4], [0, 6, 4, 5], [0, 2, 5, 0]],
            brutal:      [[0, 1, 4, 5], [0, 6, 2, 5], [0, 3, 4, 5], [0, 4, 1, 5]],
            epic:        [[0, 5, 6, 4], [0, 3, 4, 0], [0, 6, 3, 5], [0, 4, 5, 0]],
            dark:        [[0, 6, 4, 0], [0, 3, 6, 5], [0, 4, 6, 5], [0, 2, 5, 0]]
        };

        // Drum patterns (kick, snare, hihat)
        this.drumPatterns = {
            blast:     [[1,0,1], [0,1,1], [1,0,1], [0,1,1], [1,0,1], [0,1,1], [1,0,1], [0,1,1]],
            groove:    [[1,0,1], [0,0,1], [0,1,1], [0,0,1], [1,0,1], [0,0,1], [0,1,1], [1,0,1]],
            breakdown: [[1,0,0], [0,0,0], [1,1,0], [0,0,0], [1,0,0], [0,0,0], [1,1,1], [0,0,1]],
            chaos:     [[1,1,1], [1,0,1], [0,1,1], [1,1,0], [1,0,1], [0,1,1], [1,1,1], [0,0,1]]
        };

        // Riff templates (scale degree intervals)
        this.riffTemplates = {
            powerChord:   [0, 7, 0, 7],
            chromatic:    [0, 1, 0, -1, 2],
            tritone:      [0, 6, 0, 6],
            octave:       [0, 12, 0, 12],
            diminished:   [0, 3, 6, 9],
            brutal:       [0, 1, 3, 2, 0],
            tremolo:      [0, 0, 0, 0, 1, 1, 1, 1]
        };

        this.setupSeededRandom(this.config.seed || 1);
        this.initializeMusicalSystem();
        this.initializeAudioContext();
    }

    setupSeededRandom(seed) {
        let s = seed || 1;
        this.rng = () => { s = Math.sin(s) * 10000; return s - Math.floor(s); };
    }

    initializeMusicalSystem() {
        this.currentKey = -12; // Lower tuning for death metal
        this.currentScale = [...this.scales.phrygian];
        this.harmonicProgression = [...this.metalProgressions.aggressive[0]];
        this.sectionLength = 16;
        this.currentSection = 0;

        this.initializeInstruments();
        this.initializeLayerStates();
        this.generateRiffs();
        this.drumPattern = 0;
    }

    generateRiffs() {
        this.riffPatterns = [];
        const templates = Object.keys(this.riffTemplates);
        
        for (let i = 0; i < 4; i++) {
            const template = templates[Math.floor(this.rng() * templates.length)];
            const intervals = [...this.riffTemplates[template]];
            const rootNote = Math.floor(this.rng() * 3); // Low notes for metal
            
            const riff = {
                intervals,
                rootNote,
                template,
                variations: this.generateRiffVariations(intervals)
            };
            this.riffPatterns.push(riff);
        }
        this.currentRiff = this.riffPatterns[0];
    }

    generateRiffVariations(baseIntervals) {
        const variations = [];
        variations.push(baseIntervals.map(n => n + 12)); // octave up
        variations.push(baseIntervals.map(n => -n));     // inversion
        variations.push([...baseIntervals, ...baseIntervals]); // repetition
        variations.push(baseIntervals.reverse());        // retrograde
        return variations;
    }

    initializeAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.config.volume || 0.4;
        this.setupEffectsChain();
        this.masterGain.connect(this.audioContext.destination);
    }

    setupEffectsChain() {
        // Heavy compression for metal
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 16;
        this.compressor.attack.value = 0.001;
        this.compressor.release.value = 0.1;

        // Distortion using waveshaper
        this.distortion = this.audioContext.createWaveShaper();
        this.distortion.curve = this.createDistortionCurve(50);
        this.distortion.oversample = '4x';

        // Aggressive filtering
        this.filter = this.audioContext.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 4000;
        this.filter.Q.value = 2;

        this.filter2 = this.audioContext.createBiquadFilter();
        this.filter2.type = 'highpass';
        this.filter2.frequency.value = 80;
        this.filter2.Q.value = 1;

        // Chorus for width
        this.chorus = this.audioContext.createDelay(0.1);
        this.chorus.delayTime.value = 0.02;

        this.chorusLFO = this.audioContext.createOscillator();
        this.chorusLFO.type = 'sine';
        this.chorusLFO.frequency.value = 0.5;

        this.chorusGain = this.audioContext.createGain();
        this.chorusGain.gain.value = 0.008;
        this.chorusLFO.connect(this.chorusGain);
        this.chorusGain.connect(this.chorus.delayTime);
        // IMPORTANT: do not start the LFO yet; wait for a user gesture resume
        // this.chorusLFO.start(); // moved to resumeContext/ensureInteractiveReady

        // Dark reverb
        this.reverb = this.audioContext.createConvolver();
        this.createMetalReverb();

        // Delay for atmosphere
        this.delay = this.audioContext.createDelay(2.0);
        this.delay.delayTime.value = 0.25;

        this.delayFeedback = this.audioContext.createGain();
        this.delayFeedback.gain.value = 0.3;

        this.delayWet = this.audioContext.createGain();
        this.delayWet.gain.value = 0.15;

        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay);
        this.delay.connect(this.delayWet);

        // Chain: distortion -> filters -> chorus -> compression -> reverb
        this.distortion.connect(this.filter);
        this.filter.connect(this.filter2);
        this.filter2.connect(this.chorus);
        this.chorus.connect(this.compressor);
        this.compressor.connect(this.reverb);
        this.reverb.connect(this.masterGain);
        this.delayWet.connect(this.masterGain);
    }

    createDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    createMetalReverb() {
        const length = this.audioContext.sampleRate * 3;
        const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const decay = Math.pow(1 - i / length, 3);
                data[i] = (this.rng() * 2 - 1) * decay * 0.2;
            }
        }
        this.reverb.buffer = impulse;
    }

    initializeInstruments() {
        this.currentInstruments.clear();

        // Heavy rhythm guitar
        this.currentInstruments.set('rhythmGuitar', {
            type: 'sawtooth',
            octave: 2,
            detune: 5,
            attack: 0.01,
            decay: 0.1,
            sustain: 0.8,
            release: 0.3,
            filterFreq: 2000,
            resonance: 3,
            layer: 'guitar',
            distortion: 0.8
        });

        // Lead guitar
        this.currentInstruments.set('leadGuitar', {
            type: 'square',
            octave: 4,
            detune: 3,
            attack: 0.02,
            decay: 0.2,
            sustain: 0.7,
            release: 0.5,
            filterFreq: 3000,
            resonance: 4,
            layer: 'guitar',
            distortion: 0.9
        });

        // Bass
        this.currentInstruments.set('bass', {
            type: 'sawtooth',
            octave: 1,
            detune: 2,
            attack: 0.01,
            decay: 0.05,
            sustain: 0.9,
            release: 0.2,
            filterFreq: 400,
            resonance: 2,
            layer: 'bass',
            distortion: 0.6
        });

        // Kick drum
        this.currentInstruments.set('kick', {
            type: 'sine',
            octave: 1,
            detune: 0,
            attack: 0.001,
            decay: 0.1,
            sustain: 0.1,
            release: 0.2,
            filterFreq: 100,
            resonance: 1,
            layer: 'drums'
        });

        // Snare
        this.currentInstruments.set('snare', {
            type: 'triangle',
            octave: 3,
            detune: 20,
            attack: 0.001,
            decay: 0.05,
            sustain: 0.1,
            release: 0.1,
            filterFreq: 2000,
            resonance: 5,
            layer: 'drums'
        });

        // Hi-hat
        this.currentInstruments.set('hihat', {
            type: 'square',
            octave: 6,
            detune: 50,
            attack: 0.001,
            decay: 0.02,
            sustain: 0.05,
            release: 0.05,
            filterFreq: 8000,
            resonance: 10,
            layer: 'drums'
        });

        // Atmospheric pad
        this.currentInstruments.set('darkPad', {
            type: 'triangle',
            octave: 3,
            detune: 1,
            attack: 2.0,
            decay: 1.0,
            sustain: 0.8,
            release: 3.0,
            filterFreq: 800,
            resonance: 1,
            layer: 'atmosphere'
        });
    }

    initializeLayerStates() {
        this.layerStates.set('guitar',     { active: true,  intensity: 1.0 });
        this.layerStates.set('bass',       { active: true,  intensity: 0.9 });
        this.layerStates.set('drums',      { active: true,  intensity: 1.0 });
        this.layerStates.set('atmosphere', { active: true,  intensity: 0.3 });
    }

    setAutoMoodMode(enabled) {
        this.autoMoodMode = !!enabled;
        if (enabled) {
            this.nextMoodChange = this.sequencePosition + 64 + Math.floor(this.rng() * 64);
        }
    }

    setMood(mood) {
        this.currentMood = mood;
        const moods = {
            aggressive: { intensity: 1.0, tempo: 160, layers: ['guitar','bass','drums'] },
            brutal:     { intensity: 1.0, tempo: 180, layers: ['guitar','bass','drums','atmosphere'] },
            epic:       { intensity: 0.9, tempo: 140, layers: ['guitar','bass','drums','atmosphere'] },
            dark:       { intensity: 0.7, tempo: 120, layers: ['guitar','bass','atmosphere'] }
        };
        
        const s = moods[mood] || moods.aggressive;
        this.targetIntensity = s.intensity;
        this.config.tempo = s.tempo + Math.floor(this.rng() * 20);

        this.layerStates.forEach((st, layer) => {
            st.active = s.layers.includes(layer);
            st.intensity = st.active ? Math.min(1.0, st.intensity + 0.1) : Math.max(0.0, st.intensity - 0.2);
        });

        const progressions = this.metalProgressions[mood] || this.metalProgressions.aggressive;
        this.harmonicProgression = [...progressions[Math.floor(this.rng() * progressions.length)]];
    }

    checkAutoMoodChange() {
        if (!this.autoMoodMode) return;
        if (this.sequencePosition >= this.nextMoodChange) {
            let nextMood = 'aggressive';
            if (this.currentMood === 'aggressive') nextMood = this.rng() > 0.6 ? 'brutal' : 'epic';
            else if (this.currentMood === 'brutal') nextMood = this.rng() > 0.5 ? 'dark' : 'aggressive';
            else if (this.currentMood === 'epic') nextMood = this.rng() > 0.4 ? 'aggressive' : 'dark';
            else nextMood = this.rng() > 0.5 ? 'aggressive' : 'epic';
            this.setMood(nextMood);
            this.nextMoodChange = this.sequencePosition + 32 + Math.floor(this.rng() * 64);
        }
    }

    noteToFrequency(note, octave = 4) {
        return 440 * Math.pow(2, ((note + this.currentKey) + (octave - 4) * 12) / 12);
    }

    createSynth(config) {
        const osc = this.audioContext.createOscillator();
        osc.type = config.type;
        
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;

        let filter = null;
        if (config.filterFreq) {
            filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = config.filterFreq;
            filter.Q.value = config.resonance || 1;
            osc.connect(filter);
            filter.connect(envelope);
        } else {
            osc.connect(envelope);
        }

        return { osc, envelope, filter };
    }

    triggerSynth(synth, frequency, startTime, duration, config, volume = 1.0) {
        const currentTime = this.audioContext.currentTime;
        const safeStart = Math.max(startTime, currentTime + 0.01);
        const safeDur = Math.max(duration, 0.05);

        synth.osc.frequency.value = frequency * (1 + (this.rng() * 2 - 1) * (config.detune || 0) * 0.01);

        const attack  = Math.max(config.attack  || 0.01, 0.001);
        const decay   = Math.max(config.decay   || 0.1,  0.001);
        const sustain = Math.max(0, Math.min(1, (config.sustain || 0.5))) * volume;
        const release = Math.max(config.release || 0.5,  0.001);

        const atkEnd  = safeStart + attack;
        const dcyEnd  = atkEnd + decay;
        const susTime = Math.max(safeDur - attack - decay - release, 0.01);
        const relStart= safeStart + attack + decay + susTime;
        const endTime = relStart + release;

        try {
            synth.envelope.gain.cancelScheduledValues(safeStart);
            synth.envelope.gain.setValueAtTime(0, safeStart);
            synth.envelope.gain.linearRampToValueAtTime(volume, atkEnd);
            synth.envelope.gain.linearRampToValueAtTime(sustain, dcyEnd);
            synth.envelope.gain.setValueAtTime(sustain, relStart);
            synth.envelope.gain.linearRampToValueAtTime(0, endTime);

            // Route to distortion for guitars/bass
            if (config.layer === 'guitar' || config.layer === 'bass') {
                synth.envelope.connect(this.distortion);
            } else {
                synth.envelope.connect(this.filter);
            }
            
            synth.envelope.connect(this.delay);

            synth.osc.start(safeStart);
            synth.osc.stop(safeStart + safeDur);
        } catch {
            // no-op if stopped early
        }
    }

    playInstrument(instrumentName, notes, startTime, duration, volume = 1.0) {
        const config = this.currentInstruments.get(instrumentName);
        if (!config) return;

        const layerState = this.layerStates.get(config.layer);
        if (!layerState || !layerState.active || layerState.intensity < 0.1) return;

        const currentTime = this.audioContext.currentTime;
        const safeStartTime = Math.max(startTime, currentTime + 0.02);
        const safeDuration = Math.max(duration, 0.1);
        const layerVolume = volume * layerState.intensity * this.moodIntensity;

        notes.forEach((note, index) => {
            const frequency = this.noteToFrequency(note, config.octave || 4);
            const synth = this.createSynth(config);
            const noteStartTime = safeStartTime + (index * 0.02);

            this.triggerSynth(synth, frequency, noteStartTime, safeDuration, config, layerVolume);

            this.oscillators.push(synth.osc);
            this.envelopes.push(synth.envelope);
            
            setTimeout(() => {
                const oi = this.oscillators.indexOf(synth.osc);
                if (oi > -1) this.oscillators.splice(oi, 1);
                const ei = this.envelopes.indexOf(synth.envelope);
                if (ei > -1) this.envelopes.splice(ei, 1);
            }, (safeDuration + 1) * 1000);
        });
    }

    updateMoodIntensity() {
        const delta = (this.targetIntensity - this.moodIntensity) * 0.05;
        this.moodIntensity += delta;
        this.moodIntensity = Math.max(0.3, Math.min(1.0, this.moodIntensity));
    }

    // NEW: Ensure AC is resumed and internal continuous sources (like LFO) are started after a user gesture
    async resumeContext() {
        if (!this.audioContext) return;
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        } catch {}
        // Start LFO once after context is running
        if (this.chorusLFO && !this._lfoStarted && this.audioContext.state === 'running') {
            try {
                this.chorusLFO.start(this.audioContext.currentTime + 0.001);
                this._lfoStarted = true;
            } catch {
                // ignore if already started
                this._lfoStarted = true;
            }
        }
    }

    // Alias for AudioManager clarity
    async ensureInteractiveReady() {
        return this.resumeContext();
    }

    scheduleNote() {
        this.updateMoodIntensity();
        this.checkAutoMoodChange();

        const beatLength = 60.0 / Math.max(80, Math.min(200, this.config.tempo || 140)) / 4; // 16th notes
        const currentTime = this.audioContext.currentTime;

        if (this.nextNoteTime <= currentTime + 0.05) {
            this.nextNoteTime = currentTime + 0.1;
        }

        const beat16 = this.beatPosition % 16;
        const measure = this.measurePosition % 4;

        // Get current chord
        const progIndex = Math.floor(this.sequencePosition / 16) % this.harmonicProgression.length;
        const chordRoot = this.harmonicProgression[progIndex] % this.currentScale.length;
        const scale = this.currentScale;
        const chord = [
            scale[chordRoot],
            scale[(chordRoot + 2) % scale.length],
            scale[(chordRoot + 4) % scale.length]
        ];

        // Drums
        const drumPatternNames = Object.keys(this.drumPatterns);
        const currentDrumPattern = this.drumPatterns[drumPatternNames[this.drumPattern % drumPatternNames.length]];
        const drumHit = currentDrumPattern[beat16 % currentDrumPattern.length];
        
        if (drumHit[0]) { // Kick
            this.playInstrument('kick', [chord[0] - 24], this.nextNoteTime, beatLength * 2, 1.0);
        }
        if (drumHit[1]) { // Snare
            this.playInstrument('snare', [chord[1]], this.nextNoteTime, beatLength, 0.8);
        }
        if (drumHit[2]) { // Hi-hat
            this.playInstrument('hihat', [chord[2] + 24], this.nextNoteTime, beatLength * 0.5, 0.6);
        }

        // Bass follows root
        if (beat16 % 4 === 0) {
            this.playInstrument('bass', [chord[0] - 12], this.nextNoteTime, beatLength * 4, 0.9);
        }

        // Rhythm guitar - power chords
        if (beat16 % 2 === 0) {
            const powerChord = [chord[0], chord[0] + 7]; // Root and fifth
            this.playInstrument('rhythmGuitar', powerChord, this.nextNoteTime, beatLength * 2, 0.8);
        }

        // Lead guitar - riffs
        if (beat16 % 8 === 0 && this.rng() > 0.3) {
            const riff = this.developRiff(this.currentRiff, Math.floor(this.sequencePosition / 32));
            riff.forEach((note, i) => {
                this.playInstrument('leadGuitar', [note + 12],
                    this.nextNoteTime + (i * beatLength), beatLength * 0.8, 0.7);
            });
        }

        // Dark atmospheric pad
        if (beat16 === 0 && measure === 0) {
            this.playInstrument('darkPad', chord, this.nextNoteTime, beatLength * 32, 0.4);
        }

        // Dynamic filter sweeps
        const filterFreq = 1000 + Math.sin(this.sequencePosition * 0.1) * 2000 + this.moodIntensity * 1000;
        this.filter.frequency.setTargetAtTime(Math.max(400, filterFreq), this.nextNoteTime, 0.1);

        // Change drum pattern occasionally
        if (this.sequencePosition % 64 === 0 && this.sequencePosition > 0) {
            this.drumPattern = Math.floor(this.rng() * Object.keys(this.drumPatterns).length);
        }

        // Switch riff occasionally
        if (this.sequencePosition % 32 === 0 && this.riffPatterns.length > 1) {
            const newIdx = (this.riffPatterns.indexOf(this.currentRiff) + 1) % this.riffPatterns.length;
            this.currentRiff = this.riffPatterns[newIdx];
        }

        // Advance time
        this.nextNoteTime += beatLength;
        this.sequencePosition++;
        this.beatPosition++;
        if (this.beatPosition % 16 === 0) {
            this.measurePosition++;
        }
    }

    scheduler() {
        if (!this.isPlaying) return;
        try {
            while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
                this.scheduleNote();
            }
        } catch {
            // ignore scheduling hiccups
        }
        this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
    }

    async start() {
        try {
            // Ensure context is resumed (user gesture) and LFO started
            await this.ensureInteractiveReady();
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            if (!this.isPlaying) {
                this.isPlaying = true;
                this.nextNoteTime = this.audioContext.currentTime + 0.2;
                this.sequencePosition = 0;
                this.beatPosition = 0;
                this.measurePosition = 0;
                this.scheduler();
            }
        } catch {
            // ignore
        }
    }

    stop() {
        this.isPlaying = false;
        if (this.timerID) {
            clearTimeout(this.timerID);
            this.timerID = 0;
        }
        this.oscillators.forEach(osc => { try { osc.stop(); } catch {} });
        this.oscillators = [];
        this.envelopes = [];
    }

    setVolume(volume) {
        this.config.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.config.volume, this.audioContext.currentTime, 0.1);
        }
    }

    setSeed(seed) {
        this.config.seed = seed || 1;
        this.setupSeededRandom(this.config.seed);
        this.initializeMusicalSystem();
    }

    setTempo(tempo) {
        this.config.tempo = Math.max(80, Math.min(200, tempo));
    }

    getVolume() {
        return this.config.volume;
    }

    isActive() {
        return this.isPlaying;
    }
}
