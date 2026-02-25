import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { GridState, SamplerSettings } from './types';
import { convertWebmToWav } from './wavConverter';

/**
 * Generates the content for an .sfz file based on the captured samples.
 * SFZ is a standardized format that Kontakt can import.
 */
export const generateSFZ = (gridState: GridState, settings: SamplerSettings): string => {
    let sfzContent = '// Mapped Sample Wizzard Export\n';
    sfzContent += '// Drag this file into the Kontakt Rack to load\n\n';
    sfzContent += '<group>\n\n';

    // Iterate through all pitches in the grid
    Object.keys(gridState).forEach((pitchStr) => {
        const pitch = parseInt(pitchStr);
        const velocityLayers = gridState[pitch];

        Object.keys(velocityLayers).forEach((layerStr) => {
            const layer = parseInt(layerStr);
            const sample = velocityLayers[layer];

            // Define velocity ranges based on the number of layers
            // layer 1 is lowest, layer N is highest
            // Calculate actual velocity ranges 1-127
            const vMinStr = Math.max(1, Math.round(((layer - 1) / settings.velocityLayers) * 127)).toString().padStart(3, '0');
            const vMaxStr = Math.min(127, Math.round((layer / settings.velocityLayers) * 127)).toString().padStart(3, '0');

            const fileName = `Sampler_${sample.noteName}_${sample.pitch}_${vMinStr}_${vMaxStr}.wav`;

            sfzContent += '<region>\n';
            sfzContent += `sample=Samples/${fileName}\n`;
            sfzContent += `key=${pitch}\n`;
            sfzContent += `lokey=${pitch}\n`;
            sfzContent += `hikey=${pitch}\n`;
            sfzContent += `lovel=${vMinStr}\n`;
            sfzContent += `hivel=${vMaxStr}\n`;
            sfzContent += '\n';
        });
    });

    return sfzContent;
};

/**
 * Bundles all samples and the SFZ mapping into a ZIP file and triggers a download.
 */
export const exportToKontaktZip = async (
    gridState: GridState,
    settings: SamplerSettings,
    onProgress?: (msg: string) => void
) => {
    const zip = new JSZip();
    const samplesFolder = zip.folder('Samples');

    if (!samplesFolder) {
        throw new Error('Could not create folder in ZIP');
    }

    const pitches = Object.keys(gridState);
    let totalProcessed = 0;
    const totalSamples = pitches.reduce((acc, p) => acc + Object.keys(gridState[parseInt(p)]).length, 0);

    if (totalSamples === 0) {
        alert('No samples to export!');
        return;
    }

    onProgress?.(`Starting export of ${totalSamples} samples...`);

    // Process all samples
    for (const pitchStr of pitches) {
        const pitch = parseInt(pitchStr);
        const velocityLayers = gridState[pitch];

        for (const layerStr of Object.keys(velocityLayers)) {
            const layer = parseInt(layerStr);
            const sample = velocityLayers[layer];

            // Calculate actual velocity ranges 1-127
            const vMin = Math.max(1, Math.round(((layer - 1) / settings.velocityLayers) * 127));
            const vMax = Math.min(127, Math.round((layer / settings.velocityLayers) * 127));

            const minVelStr = vMin.toString().padStart(3, '0');
            const maxVelStr = vMax.toString().padStart(3, '0');

            const fileName = `Sampler_${sample.noteName}_${sample.pitch}_${minVelStr}_${maxVelStr}.wav`;

            onProgress?.(`Converting ${sample.noteName} Layer ${layer}...`);

            try {
                // Convert WebM to WAV
                const wavBlob = await convertWebmToWav(sample.audioBlob);

                // Add to ZIP
                samplesFolder.file(fileName, wavBlob);
                totalProcessed++;
            } catch (err) {
                console.error(`Failed to process sample ${sample.noteName}`, err);
            }
        }
    }

    onProgress?.('Generating mapping file...');
    const sfzContent = generateSFZ(gridState, settings);
    zip.file('instrument.sfz', sfzContent);

    // Add README for manual Auto-Map fallback
    const readmeContent = `
INSTRUMENT IMPORT INSTRUCTIONS (NATIVE INSTRUMENTS KONTAKT 8)

If dragging the 'instrument.sfz' file directly into Kontakt does not work, you can use Kontakt's built-in Auto-Map feature using the .wav files in the 'Samples' folder.

1. Open Kontakt and create a New Instrument (or "New (default)").
2. Click the Wrench icon to enter Edit Mode.
3. Open the "Mapping Editor".
4. Drag ALL .wav files from the 'Samples' folder into the Mapping Editor grid.
5. In the Mapping Editor, click the "Edit" dropdown and select "Auto-Map Setup".
6. Set the tokens (from right to left) exactly like this:
   - Token 1 (Sampler): Ignore me
   - Token 2 (NoteName): Ignore me
   - Token 3 (MidiPitch): Make root key
   - Token 4 (MinVel): Make min velocity
   - Token 5 (MaxVel): Make max velocity

7. CRITICAL STEP FOR SINGLE-KEY MAPPING:
   In the Auto-Map Setup window, click the dropdown for Token 3 (the number, e.g., '46').
   Select "Set to single key".
   
   This is the most important step! It automatically sets Root, Low Key, and High Key to that same number, so the sample does NOT stretch across the keyboard.

8. Click Apply.
    `;
    zip.file('README_KONTAKT_IMPORT.txt', readmeContent.trim());

    onProgress?.('Creating ZIP archive...');
    const content = await zip.generateAsync({ type: 'blob' });

    onProgress?.('Downloading...');
    saveAs(content, 'SampleWizzard_Kontakt_Export.zip');

    onProgress?.('Export complete!');
};
