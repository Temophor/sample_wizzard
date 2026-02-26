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

  const [showImpressum, setShowImpressum] = useState(false);
  const [activeTab, setActiveTab] = useState<'sampler' | 'tutorial' | 'about'>('sampler');

  const currentNoteDisplay = currentPitch ? pitchToNoteName(currentPitch) : '--';
  const targetDisplay = settings.targetMode
    ? `Target: ${pitchToNoteName(settings.targetMode.pitch)} Vol ${settings.targetMode.velocity}`
    : '';

  return (
    <div className="app-container">
      {notification.isVisible && (
        <div className="notification-banner">
          {notification.message}
        </div>
      )}

      {showImpressum && (
        <div className="modal-overlay" onClick={() => setShowImpressum(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Impressum</h2>
              <button className="close-btn" onClick={() => setShowImpressum(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p><strong>Angaben gemäß § 5 TMG:</strong></p>
              <p>
                Florian Maurer<br />
                Kochstraße 8<br />
                30451 Hannover
              </p>
              <p><strong>Kontakt:</strong></p>
              <p>
                E-Mail: <a href="mailto:clever.code.creations@gmail.com">clever.code.creations@gmail.com</a>
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-inactive)', marginTop: '20px' }}>
                Haftungsausschluss: Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="app-header">
        <h1>Clever Sampler</h1>
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

      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'sampler' ? 'active' : ''}`}
          onClick={() => setActiveTab('sampler')}
        >
          Sampler
        </button>
        <button
          className={`tab-btn ${activeTab === 'tutorial' ? 'active' : ''}`}
          onClick={() => setActiveTab('tutorial')}
        >
          Tutorial
        </button>
        <button
          className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'sampler' && (
          <>
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
                  width: '180px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-active)',
                  fontWeight: 'bold',
                  cursor: settings.targetMode ? 'pointer' : 'default',
                  borderRadius: '6px',
                  backgroundColor: settings.targetMode ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                  border: settings.targetMode ? '1px solid rgba(88, 166, 255, 0.4)' : '1px solid transparent',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                  fontSize: '0.9rem'
                }}
                onClick={() => { if (settings.targetMode) setSettings(prev => ({ ...prev, targetMode: null })) }}
                title={settings.targetMode ? "Click to clear target mode" : ""}
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
          </>
        )}

        {activeTab === 'tutorial' && (
          <div className="text-content-panel">
            <h2>How to use Clever Sampler</h2>
            <p>Welcome to Clever Sampler! This tool allows you to automatically map your acoustic instrument samples into a format playable by Native Instruments Kontakt.</p>

            <h3>1. Recording Samples</h3>
            <p>Click <strong>Start Engine</strong> and begin playing your instrument. The visual piano will highlight the notes it hears. The grid corresponds to velocity (loudness) layers.</p>
            <ul>
              <li><strong>Free Play:</strong> Just play, and the tool will automatically assign your samples to the closest pitch and velocity cell.</li>
              <li><strong>Target Mode:</strong> Click any cell in the grid to target it. The display will guide you to play a specific note at a specific volume.</li>
            </ul>

            <h3>2. Exporting to Kontakt</h3>
            <p>Once you are happy with your recorded grid, click <strong>Export</strong>. This will download a `.zip` file containing:</p>
            <ul>
              <li>A `samples/` folder with your processed `.wav` files (automatically trimmed and faded).</li>
              <li>A `mapping.sfz` file containing the precise mapping instructions.</li>
            </ul>

            <h3>3. Importing into Kontakt (Single Key Mapping)</h3>
            <p>This tool is designed specifically with Kontakt's <strong>"Set to single key"</strong> feature in mind to prevent unwanted time-stretching.</p>
            <ol>
              <li>Open Kontakt and create a new Default Instrument.</li>
              <li>Open the instrument editor (wrench icon) and go to the <strong>Mapping Editor</strong>.</li>
              <li>Drag the `mapping.sfz` file directly from your computer into the Mapping Editor grid.</li>
              <li><strong>Crucial Step:</strong> Select all zones (Ctrl+A / Cmd+A).</li>
              <li>In the Control Panel below the Mapping Editor, locate the <strong>Tracking</strong> parameter (usually represented by a small keyboard icon or pitch track toggle). Ensure it is turned <strong>OFF</strong>, OR locate the <strong>Root Key</strong> setting and check the <strong>"Set to single key"</strong> option if using Kontakt 8's newer interface. This ensures each sample plays only its original recorded pitch.</li>
            </ol>
            <p><em>Note: If you do not disable pitch tracking, Kontakt will attempt to stretch a single sample across the entire keyboard, which degrades audio quality for acoustic instruments.</em></p>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="text-content-panel">
            <h2>About Clever Code Creations</h2>
            <p>We are dedicated to building clever, intuitive applications that make your workflow smoother and your life better.</p>
            <p><strong>Clever Sampler</strong> was built to solve the tedious process of manually slicing, fading, and mapping hundreds of audio files when creating custom virtual instruments. By bridging the gap between browser-based audio processing and industry-standard formats like SFZ, we hope to empower musicians and sound designers to capture their unique sounds faster than ever before.</p>

            <div className="disclaimer-box">
              <h4>Note on VST Plugins</h4>
              <p>Please note that this application does <strong>not</strong> load DAW VST plugins directly into the browser. It is a standalone recording environment meant to capture live audio from your microphone or audio interface input. To sample a VST, you must route your DAW's output back into your system's recording input (e.g., using loopback software or an audio interface routing matrix) so the browser can "hear" the VST.</p>
            </div>
          </div>
        )}
      </div>

      <div className="app-footer">
        <span>© 2026 Clever Code Creations</span>
        <button className="text-link" onClick={() => setShowImpressum(true)}>Impressum</button>
      </div>
    </div>
  );
}

export default App;
