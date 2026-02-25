import type { GridState } from './types';
import { pitchToNoteName } from './useAutoSampler';

interface GridProps {
    gridState: GridState;
    velocityLayers: number;
    onCellClick: (pitch: number, velocity: number) => void;
    targetMode: { pitch: number; velocity: number } | null;
}

export const Grid = ({ gridState, velocityLayers, onCellClick, targetMode }: GridProps) => {
    // MIDI range for standard 88-key piano
    const minPitch = 21; // A0
    const maxPitch = 108; // C8

    // Create an array of pitches from high to low for display
    const pitches = Array.from({ length: maxPitch - minPitch + 1 }, (_, i) => maxPitch - i);
    const layers = Array.from({ length: velocityLayers }, (_, i) => i + 1);

    return (
        <div className="grid-container">
            <div className="grid-header-row">
                <div className="grid-corner">Pitch \ Vol</div>
                {layers.map(layer => (
                    <div key={layer} className="grid-col-header">{layer}</div>
                ))}
            </div>

            <div className="grid-scroll-area">
                {pitches.map(pitch => (
                    <div key={pitch} className="grid-row">
                        <div className="grid-row-header">
                            {pitchToNoteName(pitch)}
                            <span className="grid-row-midi">({pitch})</span>
                        </div>

                        {layers.map(layer => {
                            const sample = gridState[pitch]?.[layer];
                            const isTarget = targetMode?.pitch === pitch && targetMode?.velocity === layer;

                            let cellClass = "grid-cell missing";
                            if (sample) cellClass = "grid-cell filled";
                            if (isTarget) cellClass += " target";

                            return (
                                <div
                                    key={`${pitch}-${layer}`}
                                    className={cellClass}
                                    onClick={() => onCellClick(pitch, layer)}
                                    title={sample ? `Recorded: Vol ${Math.round(sample.rmsRaw)}` : `Click to target ${pitchToNoteName(pitch)} at vol ${layer}`}
                                >
                                    {sample ? '✓' : ''}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};
