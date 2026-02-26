import type { GridState } from './types';
import { pitchToNoteName } from './useAutoSampler';

interface GridProps {
    gridState: GridState;
    velocityLayers: number;
    onCellClick: (pitch: number, velocity: number) => void;
    targetMode: { pitch: number; velocity: number } | null;
    currentPitch: number | null;
    liveVelocityLayer: number | null;
}

export const Grid = ({ gridState, velocityLayers, onCellClick, targetMode, currentPitch, liveVelocityLayer }: GridProps) => {
    // MIDI range for standard 88-key piano
    const minPitch = 21; // A0
    const maxPitch = 108; // C8

    // Create an array of pitches from left to right (low to high)
    const pitches = Array.from({ length: maxPitch - minPitch + 1 }, (_, i) => minPitch + i);
    // Create an array of layers from top to bottom (high to low)
    const layers = Array.from({ length: velocityLayers }, (_, i) => velocityLayers - i);

    // Helper to determine if a key is black or white
    const isBlackKey = (midi: number) => {
        const note = midi % 12;
        return [1, 3, 6, 8, 10].includes(note); // C#, D#, F#, G#, A#
    };

    // Helper for playing a simple preview tone
    const playTone = (pitch: number) => {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // Convert MIDI pitch to frequency (A4 = 69, 440Hz)
            const freq = 440 * Math.pow(2, (pitch - 69) / 12);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            // Simple envelope to avoid clicks
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio Context failed to play tone:", e);
        }
    };

    return (
        <div className="grid-container horizontal">
            <div className="grid-scroll-area">
                <div className="grid-matrix">
                    {/* Velocity Rows */}
                    {layers.map(layer => (
                        <div key={layer} className="grid-row">
                            <div className="grid-row-header-sticky">Vol {layer}</div>
                            {pitches.map(pitch => {
                                const sample = gridState[pitch]?.[layer];
                                const isTarget = targetMode?.pitch === pitch && targetMode?.velocity === layer;
                                const isLive = currentPitch === pitch && liveVelocityLayer === layer;

                                let cellClass = "grid-cell horizontal-cell missing";
                                if (sample) cellClass = "grid-cell horizontal-cell filled";
                                if (isTarget) cellClass += " target";
                                if (isLive && !sample) cellClass += " live-feedback";

                                const handleClick = () => {
                                    if (sample) {
                                        const audio = new Audio(sample.audioUrl);
                                        audio.play().catch(e => console.error("Playback failed", e));
                                    }
                                    onCellClick(pitch, layer);
                                };

                                return (
                                    <div
                                        key={`${pitch}-${layer}`}
                                        className={cellClass}
                                        onClick={handleClick}
                                        title={sample ? `Recorded: Vol ${Math.round(sample.rmsRaw)} (Click to preview)` : `Click to target ${pitchToNoteName(pitch)} at vol ${layer}`}
                                    >
                                        {sample ? '✓' : ''}
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* Piano Keyboard Row */}
                    <div className="keyboard-row">
                        <div className="grid-row-header-sticky">Keys</div>
                        {pitches.map(pitch => {
                            const isBlack = isBlackKey(pitch);
                            const isActive = currentPitch === pitch;
                            let keyClass = isBlack ? "piano-key black" : "piano-key white";
                            if (isActive) keyClass += " active";

                            // Allow hovering to look clickable
                            keyClass += " cursor-pointer";

                            // Special layout logic: black keys need to overlap
                            // We use a CSS grid where each pitch is a column
                            return (
                                <div
                                    key={`key-${pitch}`}
                                    className={keyClass}
                                    title={`Click to preview ${pitchToNoteName(pitch)}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Prevent text selection
                                        playTone(pitch);
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span className="key-label pointer-events-none">{pitchToNoteName(pitch)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
