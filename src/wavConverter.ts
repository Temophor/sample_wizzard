// Helper to convert an Audio Buffer to a WAV Blob
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2; // 16-bit PCM = 2 bytes per sample
    const bufferArray = new ArrayBuffer(44 + length);
    const view = new DataView(bufferArray);

    let pos = 0;

    const writeString = (s: string) => {
        for (let i = 0; i < s.length; i++) {
            view.setUint8(pos++, s.charCodeAt(i));
        }
    };

    const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
    };

    const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
    };

    // 1. RIFF chunk descriptor
    writeString('RIFF');
    setUint32(36 + length);
    writeString('WAVE');

    // 2. fmt sub-chunk
    writeString('fmt ');
    setUint32(16); // Subchunk1Size (16 for PCM)
    setUint16(1);  // AudioFormat (1 for PCM)
    setUint16(numOfChan); // NumChannels
    setUint32(buffer.sampleRate); // SampleRate
    setUint32(buffer.sampleRate * 2 * numOfChan); // ByteRate
    setUint16(numOfChan * 2); // BlockAlign
    setUint16(16); // BitsPerSample 

    // 3. data sub-chunk
    writeString('data');
    setUint32(length);

    // Write interleaved PCM samples
    const channels = [];
    for (let i = 0; i < numOfChan; i++) {
        channels.push(buffer.getChannelData(i));
    }

    let offset = 0;
    const fadeDurationMs = 5; // 5ms fade
    const fadeSamples = Math.floor((buffer.sampleRate * fadeDurationMs) / 1000);
    const totalSamples = buffer.length;

    while (pos < bufferArray.byteLength) {
        // Calculate fade multiplier (0.0 to 1.0)
        let fadeMultiplier = 1.0;

        if (offset < fadeSamples) {
            // Fade In
            fadeMultiplier = offset / fadeSamples;
        } else if (offset > totalSamples - fadeSamples) {
            // Fade Out
            fadeMultiplier = (totalSamples - offset) / fadeSamples;
        }

        for (let i = 0; i < numOfChan; i++) {
            let sample = channels[i][offset] * fadeMultiplier; // apply fade
            sample = Math.max(-1, Math.min(1, sample)); // clamp
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // scale to 16-bit
            view.setInt16(pos, sample, true); // write 16-bit
            pos += 2;
        }
        offset++;
    }

    return new Blob([bufferArray], { type: 'audio/wav' });
};

export const convertWebmToWav = async (webmBlob: Blob): Promise<Blob> => {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Decode the WebM audio into a raw AudioBuffer
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Encode it back to WAV
    return audioBufferToWav(audioBuffer);
};
