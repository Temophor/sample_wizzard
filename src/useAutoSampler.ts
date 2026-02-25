import { useState, useEffect, useRef, useCallback } from 'react';
import { PitchDetector } from 'pitchy';
import type { SampleMetadata, SamplerSettings } from './types';

// Utility to convert MIDI pitch to Note Name (e.g., 60 -> C4)
export const pitchToNoteName = (midi: number): string => {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[midi % 12];
    return `${note}${octave}`;
};

// Convert frequency to MIDI note
export const freqToMidi = (freq: number): number => {
    return Math.round(69 + 12 * Math.log2(freq / 440));
};

export const useAutoSampler = (
    settings: SamplerSettings,
    onSampleCaptured: (sample: SampleMetadata) => void
) => {
    const [isListening, setIsListening] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [currentRMS, setCurrentRMS] = useState(0);
    const [currentPitch, setCurrentPitch] = useState<number | null>(null);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const rafRef = useRef<number | null>(null);

    // Buffers for detection
    const audioChunksRef = useRef<Blob[]>([]);

    // State tracking for the current active note being played
    const pitchHistoryRef = useRef<number[]>([]);
    const maxRMSRef = useRef<number>(0);
    const silenceStartRef = useRef<number | null>(null);

    const startListening = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
            const audioCtx = new AudioContextCtor();
            audioCtxRef.current = audioCtx;

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048; // Higher for better pitch resolution
            source.connect(analyser);
            analyserRef.current = analyser;

            // Prepare MediaRecorder
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                // Process the finished recording
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];

                // Finalize calculations
                const avgMidi = processPitchHistory(pitchHistoryRef.current);
                const peakRMS = maxRMSRef.current;

                if (avgMidi !== null && avgMidi >= 21 && avgMidi <= 108) {
                    // Calculate velocity layer (1 to N)
                    // Normalize RMS to 0-100 range first, assuming standard mic level peaks around 100 on our scale
                    let normalizedVolume = peakRMS;
                    if (normalizedVolume > 100) normalizedVolume = 100;

                    let velocityLayer = Math.ceil((normalizedVolume / 100) * settings.velocityLayers);
                    if (velocityLayer < 1) velocityLayer = 1;
                    if (velocityLayer > settings.velocityLayers) velocityLayer = settings.velocityLayers;

                    if (settings.targetMode) {
                        // Override if in target mode and reasonably close in pitch (to allow slight detune)
                        // Or just strictly enforce target if it's the target mode
                    }

                    const sample: SampleMetadata = {
                        pitch: avgMidi,
                        noteName: pitchToNoteName(avgMidi),
                        velocity: velocityLayer,
                        rmsRaw: peakRMS,
                        audioBlob: blob,
                        audioUrl: URL.createObjectURL(blob)
                    };

                    onSampleCaptured(sample);
                }

                // Reset tracking variables
                pitchHistoryRef.current = [];
                maxRMSRef.current = 0;
            };

            setIsListening(true);
            requestAnimationFrame(processAudio);
        } catch (err) {
            console.error('Failed to get microphone access', err);
        }
    };

    const stopListening = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
        }
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsListening(false);
        setIsRecording(false);
    }, []);

    // Compute the mode (most common rounded pitch)
    const processPitchHistory = (history: number[]): number | null => {
        if (history.length === 0) return null;
        const counts = new Map<number, number>();
        let maxCount = 0;
        let mostCommon = history[0];

        for (const h of history) {
            const rounded = Math.round(h);
            const count = (counts.get(rounded) || 0) + 1;
            counts.set(rounded, count);
            if (count > maxCount) {
                maxCount = count;
                mostCommon = rounded;
            }
        }
        return mostCommon;
    };

    // State flag to track when recording actually started
    const recordStartTimeRef = useRef<number>(0);

    const processAudio = () => {
        if (!analyserRef.current || !audioCtxRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const volumeValue = (rms / 255) * 100 * 2.5;
        const currentVol = Math.min(volumeValue, 100);
        setCurrentRMS(currentVol);

        // Pitch detection
        const float32Array = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(float32Array);

        // Using pitchy
        const detector = PitchDetector.forFloat32Array(analyserRef.current.fftSize);
        const [pitchFreq, clarity] = detector.findPitch(float32Array, audioCtxRef.current.sampleRate);

        const isValidPitch = clarity > 0.8;
        setCurrentPitch(isValidPitch ? freqToMidi(pitchFreq) : null);

        // Config for intelligent detection
        const ATTACK_THRESHOLD = settings.noiseFloor + 15; // Volume needed to trigger a new note
        const DECAY_MULTIPLIER = 1.5; // How much above noise floor we consider "still ringing"
        const MIN_DECAY_TIME = 800; // ms to wait before cutting off a ringing note
        const MIN_RECORD_TIME = 500; // minimum ms a recording must last

        // INTELLIGENT TRIGGER LOGIC
        const isCurrentlyRecording = mediaRecorderRef.current?.state === 'recording';

        // 1. ATTACK: If we aren't recording, listen for a sharply attacked note above the noise floor
        if (!isCurrentlyRecording) {
            if (currentVol >= ATTACK_THRESHOLD) {
                maxRMSRef.current = currentVol;
                if (isValidPitch) pitchHistoryRef.current.push(freqToMidi(pitchFreq));

                if (mediaRecorderRef.current) {
                    mediaRecorderRef.current.start();
                    setIsRecording(true);
                    recordStartTimeRef.current = performance.now();
                    silenceStartRef.current = null;
                }
            }
        }
        // 2. SUSTAIN/DECAY: Once recording starts, keep recording while it rings out
        else {
            // Track peak volume
            maxRMSRef.current = Math.max(maxRMSRef.current, currentVol);

            // Keep logging pitch if it's clear
            if (isValidPitch) {
                pitchHistoryRef.current.push(freqToMidi(pitchFreq));
            }

            // We consider it "quiet" if it drops back near the noise floor
            const decayFloor = settings.noiseFloor * DECAY_MULTIPLIER;
            const isQuiet = currentVol <= Math.max(decayFloor, 5); // ensure floor is at least 5

            if (isQuiet) {
                if (silenceStartRef.current === null) {
                    silenceStartRef.current = performance.now();
                } else {
                    const timeInSilence = performance.now() - silenceStartRef.current;
                    const recordDuration = performance.now() - recordStartTimeRef.current;

                    // Stop if it's been quiet long enough, AND we've recorded at least the minimum length
                    if (timeInSilence > MIN_DECAY_TIME && recordDuration > MIN_RECORD_TIME) {
                        mediaRecorderRef.current?.stop();
                        setIsRecording(false);
                        silenceStartRef.current = null;
                    }
                }
            } else {
                // It got loud again (e.g., resonance or hit another key too fast), reset silence timer
                silenceStartRef.current = null;
            }
        }

        rafRef.current = requestAnimationFrame(processAudio);
    };

    useEffect(() => {
        return stopListening;
    }, [stopListening]);

    return {
        isListening,
        isRecording,
        currentRMS,
        currentPitch,
        startListening,
        stopListening,
    };
};
