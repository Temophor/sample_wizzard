import { useState, useCallback } from 'react';
import type { SampleMetadata, SamplerSettings, GridState } from './types';
import { useAutoSampler, pitchToNoteName } from './useAutoSampler';
import { Grid } from './Grid';
import { exportToKontaktZip } from './kontaktExporter';

function App() {
  const [settings, setSettings] = useState<SamplerSettings>({
    noiseFloor: 10,
    velocityLayers: 5,
    targetMode: null
  });

  const [gridState, setGridState] = useState<GridState>({});
  const [notification, setNotification] = useState<{ message: string, isVisible: boolean }>({ message: '', isVisible: false });
  const [exportStatus, setExportStatus] = useState<string | null>(null);

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
    setSettings(prev => {
      // If clicking the current target, clear it
      if (prev.targetMode && prev.targetMode.pitch === pitch && prev.targetMode.velocity === velocity) {
        return { ...prev, targetMode: null };
      }
      return { ...prev, targetMode: { pitch, velocity } };
    });
  };

  // Utility to export ZIP using jszip (to be implemented)
  // Professional Kontakt Export
  const handleExport = async () => {
    try {
      await exportToKontaktZip(gridState, settings, (msg) => {
        setExportStatus(msg);
        if (msg === 'Export complete!') {
          setTimeout(() => setExportStatus(null), 3000);
        }
      });
    } catch (err) {
      console.error("Export failed", err);
      alert("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setExportStatus(null);
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
        <h1>Aura Sample</h1>
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

        <div
          style={{
            color: settings.targetMode ? 'var(--text-active)' : 'var(--text-inactive)',
            fontWeight: 'bold',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            userSelect: 'none'
          }}
          onClick={() => setSettings(prev => ({ ...prev, targetMode: null }))}
          title="Click to return to Free Play mode"
        >
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
            style={{ backgroundColor: exportStatus ? '#666' : '#1f6feb' }}
            onClick={handleExport}
            disabled={!!exportStatus}
          >
            {exportStatus || 'Export'}
          </button>
        </div>
      </div>

      <Grid
        gridState={gridState}
        velocityLayers={settings.velocityLayers}
        onCellClick={handleCellClick}
        targetMode={settings.targetMode}
        currentPitch={currentPitch}
        liveVelocityLayer={
          currentRMS > settings.noiseFloor
            ? Math.max(1, Math.min(settings.velocityLayers, Math.ceil((Math.min(currentRMS, 100) / 100) * settings.velocityLayers)))
            : null
        }
      />
    </div>
  );
}

export default App;
