// SRT subtitle export
function formatTimecode(seconds, separator) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const secs = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const mins = totalMin % 60;
    const hrs = Math.floor(totalMin / 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`;
}

function srtTime(seconds) {
    return formatTimecode(seconds, ',');
}

function buildSRT() {
    const items = state.elements
        .filter(el => el.type === 'text' && (el.text || '').trim().length > 0)
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

    if (items.length === 0) return null;

    return items.map((el, i) => {
        const text = el.isUppercase ? el.text.toUpperCase() : el.text;
        return `${i + 1}\n${srtTime(el.startTime ?? 0)} --> ${srtTime(el.endTime ?? getDuration())}\n${text}\n`;
    }).join('\n');
}

function exportSRT() {
    const srt = buildSRT();
    if (!srt) {
        alert('Add at least one caption with text before exporting SRT.');
        return;
    }
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalakar_captions_${state.language || 'en'}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('export-srt-btn')?.addEventListener('click', () => exportSRT());

// ---------- WebVTT export ----------
function vttTime(seconds) {
    return formatTimecode(seconds, '.');
}

function escapeVTTText(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n\r?\n/g, '\n');
}

function buildVTT() {
    const items = state.elements
        .filter(el => el.type === 'text' && (el.text || '').trim().length > 0)
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

    if (items.length === 0) return null;

    const header = 'WEBVTT\n\n';
    const body = items.map((el, i) => {
        const text = escapeVTTText(el.isUppercase ? el.text.toUpperCase() : el.text);
        return `${i + 1}\n${vttTime(el.startTime ?? 0)} --> ${vttTime(el.endTime ?? getDuration())}\n${text}\n`;
    }).join('\n');
    return header + body;
}

function exportVTT() {
    const vtt = buildVTT();
    if (!vtt) {
        alert('Add at least one caption with text before exporting VTT.');
        return;
    }
    const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalakar_captions_${state.language || 'en'}.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('export-vtt-btn')?.addEventListener('click', () => exportVTT());

// ---------- Transcript export (.txt / .md) ----------
function buildTranscriptLines() {
    return state.elements
        .filter(el => el.type === 'text' && (el.text || '').trim().length > 0)
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))
        .map(el => {
            const text = el.isUppercase ? el.text.toUpperCase() : el.text;
            const t = vttTime(el.startTime ?? 0);
            return { t, text };
        });
}

function exportTranscript(format) {
    const lines = buildTranscriptLines();
    if (lines.length === 0) {
        alert('Add at least one caption with text before exporting transcript.');
        return;
    }
    let content, mime, ext;
    if (format === 'md') {
        content = '# Kalakar Transcript\n\n' + lines.map(l => `- **${l.t}** — ${l.text}`).join('\n') + '\n';
        mime = 'text/markdown;charset=utf-8';
        ext = 'md';
    } else {
        content = lines.map(l => `[${l.t}] ${l.text}`).join('\n') + '\n';
        mime = 'text/plain;charset=utf-8';
        ext = 'txt';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalakar_transcript_${state.language || 'en'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('export-txt-btn')?.addEventListener('click', () => exportTranscript('txt'));
document.getElementById('export-md-btn')?.addEventListener('click', () => exportTranscript('md'));
