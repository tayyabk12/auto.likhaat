// Real audio waveform extraction via Web Audio API
async function extractWaveform(file) {
    const status = document.getElementById('waveform-status');
    try {
        if (status) status.textContent = 'Extracting waveform…';
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        const samples = 600;
        const blockSize = Math.floor(channelData.length / samples) || 1;
        const peaks = new Array(samples);
        for (let i = 0; i < samples; i++) {
            let max = 0;
            const startIdx = i * blockSize;
            for (let j = 0; j < blockSize; j += 4) {
                const v = Math.abs(channelData[startIdx + j] || 0);
                if (v > max) max = v;
            }
            peaks[i] = max;
        }
        // Normalize
        const maxPeak = Math.max(...peaks) || 1;
        for (let i = 0; i < samples; i++) peaks[i] = peaks[i] / maxPeak;
        state.audioPeaks = peaks;
        audioCtx.close();
        drawWaveform();
        drawAudioPreview(peaks);
        if (status) status.textContent = `Waveform extracted (${file.name})`;
    } catch (err) {
        console.warn('Waveform extraction failed:', err);
        if (status) status.textContent = 'Could not decode audio from this file. Placeholder waveform shown.';
    }
}

function drawAudioPreview(peaks) {
    const c = document.getElementById('audio-preview-canvas');
    if (!c || !peaks) return;
    c.width = c.clientWidth || 250;
    c.height = 64;
    const pctx = c.getContext('2d');
    pctx.clearRect(0, 0, c.width, c.height);
    pctx.fillStyle = '#34d399';
    const barW = 2;
    const gap = 1;
    const totalBars = Math.floor(c.width / (barW + gap));
    for (let i = 0; i < totalBars; i++) {
        const peakIdx = Math.floor((i / totalBars) * peaks.length);
        const h = Math.max(2, peaks[peakIdx] * 52);
        const y = (64 - h) / 2;
        pctx.fillRect(i * (barW + gap), y, barW, h);
    }
}
