export interface SampleMetadata {
    pitch: number;      // MIDI note (e.g. 60 for C4)
    noteName: string;   // e.g. "C4"
    velocity: number;   // Calculated layer (1 to N)
    rmsRaw: number;     // Raw RMS volume when captured
    audioBlob: Blob;
    audioUrl: string;
}

export interface SamplerSettings {
    noiseFloor: number;      // 0 to 100
    velocityLayers: number;  // N layers
    targetMode: { pitch: number, velocity: number } | null;
}

export type GridState = Record<number, Record<number, SampleMetadata>>;
// Map<Pitch, Map<VelocityLayer, Sample>>
