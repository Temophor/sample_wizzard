import { useState, useCallback } from 'react';
import type { SampleMetadata, SamplerSettings, GridState } from './types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAutoSampler, pitchToNoteName } from './useAutoSampler';
import { Grid } from './Grid';
import { convertWebmToWav } from './wavConverter';

function App() {
  const [settings, setSettings] = useState<SamplerSettings>({
    noiseFloor: 10,
    velocityLayers: 5,
    targetMode: null
  });

  const [gridState, setGridState] = useState<GridState>({});
  const [notification, setNotification] = useState<{ message: string, isVisible: boolean }>({ message: '', isVisible: false });

  const handleSampleCaptured = useCallback((sample: SampleMetadata) => {
    console.log('Sample Captured!', sample);

    setGridState(prev => {
      const newState = { ...prev };
      if (!newState[sample.pitch]) {
        newState[sample.pitch] = {};
      }
      // Store the sample at the corresponding pitch and velocity layer
      newState[sample.pitch][sample.velocity] = sample;
      return newState;
    });

    // Trigger Success Notification
    setNotification({
      message: `Successfully logged ${sample.noteName} at Vol ${sample.velocity}!`,
      isVisible: true
    });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, isVisible: false }));
    }, 3000);

    // Clear target mode if it was met
    setSettings(prev => {
      if (prev.targetMode &&
        prev.targetMode.pitch === sample.pitch &&
        prev.targetMode.velocity === sample.velocity) {
        return { ...prev, targetMode: null };
      }
      return prev;
    });
  }, []);

  const {
    isListening,
    isRecording,
    currentRMS,
    currentPitch,
    startListening,
    stopListening
  } = useAutoSampler(settings, handleSampleCaptured);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleCellClick = (pitch: number, velocity: number) => {
    // If there's already a sample, maybe play it? (Future feature)
    // For now, set target mode for empty cells or to override
    setSettings(prev => ({
      ...prev,
      targetMode: { pitch, velocity }
    }));
  };

  // Utility to export ZIP using jszip (to be implemented)
  const exportZip = async () => {
    if (Object.keys(gridState).length === 0) {
      alert("No samples recorded yet!");
      return;
    }

    // JSZip uses a lot of memory, but for basic webm clips it's fine
    try {
      const zip = new JSZip();
      const folder = zip.folder("Piano_Samples");
      if (!folder) return;

      const layerSize = 127 / settings.velocityLayers;

      for (const pitchStr in gridState) {
        const pitch = Number(pitchStr);
        for (const velocityStr in gridState[pitch]) {
          const velocity = Number(velocityStr);
          const sample = gridState[pitch][velocity];

          // Calculate MIDI velocity ranges (1-127) for this layer
          const minVel = Math.max(1, Math.round((velocity - 1) * layerSize));
          const maxVel = Math.min(127, Math.round(velocity * layerSize));

          const minVelStr = minVel.toString().padStart(3, '0');
          const maxVelStr = maxVel.toString().padStart(3, '0');

          // Format for automatic mapping in Kontakt
          // Token 1: Sampler, Token 2: NoteName, Token 3: MidiPitch, Token 4: MinVel, Token 5: MaxVel
          const filename = `Sampler_${sample.noteName}_${sample.pitch}_${minVelStr}_${maxVelStr}.wav`;

          // Convert WebM to standard uncompressed WAV 
          const wavBlob = await convertWebmToWav(sample.audioBlob);
          folder.file(filename, wavBlob);
        }
      }

      const readmeContent = `
INSTRUMENT IMPORT INSTRUCTIONS (NATIVE INSTRUMENTS KONTAKT)

To completely automate the mapping of these samples in Kontakt, follow these steps:

1. Open Kontakt and create a New Instrument.
2. Open the Mapping Editor.
3. Drag ALL .webm files from this folder into the Mapping Editor zone.
4. Open the "Auto-Map Setup" dialog in the Mapping Editor.
5. You will see that the filenames are split into tokens separated by underscores (_).
6. Set up the tokens as follows:
   - Token 1 (Sampler): Ignore
   - Token 2 (NoteName): Ignore (or use for Group Name)
   - Token 3 (MidiPitch): Set to "Root" (or Set to "Make Single Key")
   - Token 4 (MinVel): Set to "Min Vel"
   - Token 5 (MaxVel): Set to "Max Vel"
7. Click Apply. 

Kontakt will automatically place every sample on the correct key and assign the correct velocity range!
      `;
      folder.file("README_KONTAKT_IMPORT.txt", readmeContent.trim());

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "Piano_Samples.zip");
    } catch (err) {
      console.error("Export failed", err);
      alert("Export failed!");
    }
  };

  const currentNoteDisplay = currentPitch ? pitchToNoteName(currentPitch) : '--';
  const targetDisplay = settings.targetMode
    ? `Target: ${pitchToNoteName(settings.targetMode.pitch)} Vol ${settings.targetMode.velocity}`
    : 'Free Play';

  return (
    <div className="app-container">
      {notification.isVisible && (
        <div className="notification-banner">
          {notification.message}
        </div>
      )}
      <div className="app-header">
        <h1>Auto-Sampler V2</h1>
        <div className="hud-panel">
          <div className="hud-item">
            <span className="hud-label">Status</span>
            <span className={`hud-value ${isRecording ? 'recording' : ''}`}>
              {isRecording ? 'REC' : (isListening ? 'RDY' : 'OFF')}
            </span>
          </div>
          <div className="hud-item">
            <span className="hud-label">Pitch</span>
            <span className="hud-value">{currentNoteDisplay}</span>
          </div>
          <div className="hud-item">
            <span className="hud-label">Vol (RMS)</span>
            <span className="hud-value">{Math.round(currentRMS)}</span>
          </div>
        </div>
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label>
            <span>Noise Floor: {settings.noiseFloor}</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.noiseFloor}
            onChange={(e) => setSettings({ ...settings, noiseFloor: Number(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label>
            <span>Velocity Layers: {settings.velocityLayers}</span>
          </label>
          <input
            type="range"
            min="1"
            max="127"
            value={settings.velocityLayers}
            onChange={(e) => setSettings({ ...settings, velocityLayers: Number(e.target.value) })}
          />
        </div>

        <div style={{ color: 'var(--text-active)', fontWeight: 'bold' }}>
          {targetDisplay}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={`btn ${isListening ? 'recording' : ''}`}
            onClick={toggleListening}
          >
            {isListening ? 'Stop Engine' : 'Start Engine'}
          </button>

          <button
            className="btn"
            style={{ backgroundColor: '#1f6feb' }}
            onClick={exportZip}
          >
            Export ZIP
          </button>
        </div>
      </div>

      <Grid
        gridState={gridState}
        velocityLayers={settings.velocityLayers}
        onCellClick={handleCellClick}
        targetMode={settings.targetMode}
      />
    </div>
  );
}

export default App;
