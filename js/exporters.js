// ---------- Project JSON export / import ----------
function buildProjectData() {
    return {
        name: 'Kalakar Video Project',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        language: state.language || 'en',
        duration: getDuration(),
        video: video && video.src ? {
            duration: video.duration || 0,
            currentTime: video.currentTime || 0
        } : null,
        captions: state.elements
    };
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportProjectJSON() {
    if (state.elements.length === 0 && (!video || !video.src)) {
        alert('Your workspace is empty! Import a video or add captions first.');
        return;
    }
    downloadJSON(buildProjectData(), `kalakar_project_${Date.now()}.json`);
}

const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => exportProjectJSON());
}

const exportProjectTabBtn = document.getElementById('export-project-tab-btn');
if (exportProjectTabBtn) {
    exportProjectTabBtn.addEventListener('click', () => exportProjectJSON());
}

const projectImport = document.getElementById('project-import');
if (projectImport) {
    projectImport.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data || !Array.isArray(data.captions)) {
                alert('Invalid project file: missing captions array.');
                return;
            }
            pushUndo();
            const dur = getDuration();
            state.elements = data.captions.map((el, i) => ({
                id: el.id || `cap_import_${i}_${Date.now()}`,
                type: el.type || 'text',
                text: el.text || '',
                x: el.x ?? 100,
                y: el.y ?? 100,
                w: el.w ?? 240,
                h: el.h ?? 60,
                fontFamily: el.fontFamily || "'Anton', sans-serif",
                fontSize: el.fontSize ?? 52,
                color: el.color || '#ffffff',
                highlightColor: el.highlightColor || '#facc15',
                strokeColor: el.strokeColor || '#000000',
                strokeWidth: el.strokeWidth ?? 6,
                isUppercase: el.isUppercase ?? true,
                mode: el.mode || 'word',
                showBgBox: el.showBgBox ?? false,
                bgBoxColor: el.bgBoxColor || '#a79e6a',
                opacity: el.opacity ?? 1,
                rotation: el.rotation ?? 0,
                startTime: el.startTime ?? 0,
                endTime: el.endTime ?? dur
            }));
            state.selectedIds.clear();
            if (state.elements.length > 0) state.selectedIds.add(state.elements[0].id);
            render();
            updateCaptionWordChips();
            updateCaptionBlocks();
            if (!video.src) {
                alert('Project loaded! Import the original video to preview timing.');
            }
        } catch (err) {
            alert('Failed to import project: ' + err.message);
        }
        e.target.value = '';
    });
}

// ---------- Video export (WebM via MediaRecorder) ----------
const exportState = { active: false, cancelled: false, recorder: null };

// Persistent Web Audio enhancement chain (created lazily on first use).
// NOTE: createMediaElementSource permanently routes the element's audio through
// the graph, so the chain is created once and kept for the page lifetime.
const audioChain = { ctx: null, source: null, present: null, comp: null, makeup: null, out: null, dest: null };

function ensureAudioChain() {
    if (audioChain.ctx) return audioChain;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(video);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;               // remove rumble/traffic lows
    const present = ctx.createBiquadFilter();
    present.type = 'peaking';
    present.frequency.value = 3000;        // voice presence
    present.Q.value = 1;
    present.gain.value = 0;                // neutral until enhancement is on
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 1;                  // neutral until enhancement is on
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    const makeup = ctx.createGain();
    makeup.gain.value = 1;
    const out = ctx.createGain();
    source.connect(hp);
    hp.connect(present);
    present.connect(comp);
    comp.connect(makeup);
    makeup.connect(out);
    out.connect(ctx.destination);          // local monitoring
    Object.assign(audioChain, { ctx, source, present, comp, makeup, out });
    return audioChain;
}

function setEnhancement(on) {
    if (!audioChain.ctx) return;
    audioChain.present.gain.value = on ? 4 : 0;
    audioChain.comp.ratio.value = on ? 4 : 1;
    audioChain.makeup.gain.value = on ? 1.4 : 1;
}

document.getElementById('enhance-toggle')?.addEventListener('change', (e) => {
    ensureAudioChain();
    setEnhancement(e.target.checked);
    if (e.target.checked) showToast('Audio enhancement on — clean rumble & hiss on playback/export');
});

function getExportSize(mode) {
    const vb = state.videoBounds;
    if (mode === '720') {
        if (vb) {
            const long = Math.max(vb.w, vb.h);
            const s = 720 / long;
            return { w: Math.round(vb.w * s / 2) * 2, h: Math.round(vb.h * s / 2) * 2 };
        }
        return { w: 1280, h: 720 };
    }
    if (mode === '4k') {
        if (vb) {
            const long = Math.max(vb.w, vb.h);
            const s = 2160 / long;
            return { w: Math.round(vb.w * s / 2) * 2, h: Math.round(vb.h * s / 2) * 2 };
        }
        return { w: 3840, h: 2160 };
    }
    if (vb) {
        const long = Math.max(vb.w, vb.h);
        const s = 1080 / long;
        return { w: Math.round(vb.w * s / 2) * 2, h: Math.round(vb.h * s / 2) * 2 };
    }
    return { w: 1920, h: 1080 };
}

function drawExportFrame(ectx, W, H) {
    const alphaMode = !!document.getElementById('export-alpha')?.checked;
    if (alphaMode) {
        ectx.clearRect(0, 0, W, H);
    } else {
        ectx.fillStyle = '#000000';
        ectx.fillRect(0, 0, W, H);
    }

    const vb = state.videoBounds;
    const t = video.currentTime || 0;

    let s = 1;
    let ox = 0;
    let oy = 0;
    if (vb && vb.w > 0) {
        s = W / vb.w;
        ox = -vb.x * s;
        oy = -vb.y * s;
    } else {
        s = W / (canvas.width || 1280);
    }

    // Video frame fills export canvas (skip in alpha mode)
    if (!alphaMode && video.readyState >= 2) {
        ectx.drawImage(video, 0, 0, W, H);
    }

    // Captions
    state.elements.forEach(el => {
        if (el.type !== 'text') return;
        if (!isCaptionActive(el, t)) return;
        const rawWords = (el.text || '').trim().split(/\s+/).filter(Boolean);
        if (rawWords.length === 0) return;

        const words = el.isUppercase ? rawWords.map(w => w.toUpperCase()) : rawWords;
        const fontSize = (el.fontSize || 52) * s;
        const fontFamily = el.fontFamily || "'Anton', sans-serif";
        ectx.save();
        ectx.translate(ox + el.x * s, oy + el.y * s);
        ectx.rotate(((el.rotation || 0) * Math.PI) / 180);
        ectx.globalAlpha = el.opacity ?? 1;
        ectx.font = `900 ${fontSize}px ${fontFamily}`;
        ectx.textBaseline = 'top';

        const activeIndex = getActiveWordIndex(words.length, el);
        const spaceWidth = ectx.measureText(' ').width;
        let totalWidth = 0;
        const wordWidths = words.map(w => {
            const mw = ectx.measureText(w).width;
            totalWidth += mw;
            return mw;
        });
        totalWidth += spaceWidth * (words.length - 1);
        const totalHeight = fontSize * 1.25;

        if (el.showBgBox) {
            ectx.fillStyle = el.bgBoxColor || '#a79e6a';
            ectx.beginPath();
            const padX = 14 * s;
            const padY = 6 * s;
            ectx.roundRect(-padX, -padY, totalWidth + padX * 2, totalHeight + padY * 2, 8 * s);
            ectx.fill();
        }

        ectx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ectx.shadowBlur = 8 * s;
        ectx.shadowOffsetX = 0;
        ectx.shadowOffsetY = 4 * s;

        let curX = 0;
        words.forEach((word, idx) => {
            const wWidth = wordWidths[idx];
            if (el.strokeWidth > 0) {
                ectx.lineWidth = (el.strokeWidth || 6) * s;
                ectx.strokeStyle = el.strokeColor || '#000000';
                ectx.lineJoin = 'round';
                ectx.miterLimit = 2;
                ectx.strokeText(word, curX, 0);
            }
            ectx.fillStyle = (idx === activeIndex) ? (el.highlightColor || '#FACC15') : (el.color || '#FFFFFF');
            ectx.fillText(word, curX, 0);
            curX += wWidth + spaceWidth;
        });
        ectx.restore();
    });
}

function setExportProgress(pct) {
    const fill = document.getElementById('export-progress-fill');
    const text = document.getElementById('export-progress-text');
    if (fill) fill.style.width = `${Math.round(pct * 100)}%`;
    if (text) text.textContent = `${Math.round(pct * 100)}%`;
}

function setExportUI(active) {
    exportState.active = active;
    const wrap = document.getElementById('export-progress-wrap');
    const btn = document.getElementById('export-video-btn');
    const cancelBtn = document.getElementById('export-cancel-btn');
    if (wrap) wrap.classList.toggle('hidden', !active);
    if (btn) btn.disabled = active;
    if (cancelBtn) cancelBtn.hidden = !active;
}

async function exportVideo() {
    if (exportState.active) return;
    if (!video.src) {
        alert('Import a video first!');
        return;
    }

    exportState.cancelled = false;
    setExportUI(true);
    setExportProgress(0);

    const resMode = document.getElementById('export-resolution')?.value || '1080';
    const fps = parseInt(document.getElementById('export-fps')?.value, 10) || 30;
    const alphaMode = !!document.getElementById('export-alpha')?.checked;
    const { w: W, h: H } = getExportSize(resMode);
    const bitrate = resMode === '4k' ? 20_000_000 : (resMode === '1080' ? 12_000_000 : 8_000_000);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = W;
    exportCanvas.height = H;
    const ectx = exportCanvas.getContext('2d');

    const stream = exportCanvas.captureStream(fps);

    // Audio routing: skip audio in alpha mode (overlay has no audio)
    if (!alphaMode) {
        const enhance = !!document.getElementById('enhance-toggle')?.checked;
        let exportDest = null;
        try {
            if (enhance || audioChain.ctx) {
                ensureAudioChain();
                setEnhancement(enhance);
                exportDest = audioChain.ctx.createMediaStreamDestination();
                audioChain.out.connect(exportDest);
                exportDest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
            } else {
                const vStream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
                if (vStream) {
                    vStream.getAudioTracks().forEach(track => stream.addTrack(track));
                }
            }
        } catch (err) {
            console.warn('Could not set up audio for export:', err);
        }
    }

    let mime = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mime = 'video/webm;codecs=vp9,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mime = 'video/webm;codecs=vp8,opus';
    }

    const chunks = [];
    let recorder;
    try {
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    } catch (err) {
        alert('MediaRecorder not supported in this browser.');
        setExportUI(false);
        return;
    }
    exportState.recorder = recorder;

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const finished = new Promise((resolve) => {
        recorder.onstop = resolve;
    });

    // Save state, reset to start
    const prevTime = video.currentTime;
    const wasPaused = video.paused;
    video.pause();
    video.currentTime = 0;

    // Wait for seek
    await new Promise(resolve => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); resolve(); };
        video.addEventListener('seeked', onSeek);
        setTimeout(resolve, 500);
    });

    recorder.start(200);

    let rafId = 0;
    function loop() {
        if (exportState.cancelled) {
            cancelAnimationFrame(rafId);
            try { recorder.stop(); } catch (e) {}
            return;
        }
        drawExportFrame(ectx, W, H);
        const pct = (video.currentTime || 0) / (video.duration || 1);
        setExportProgress(Math.min(pct, 1));
        if (video.ended || pct >= 1) {
            cancelAnimationFrame(rafId);
            setTimeout(() => {
                try { recorder.stop(); } catch (e) {}
            }, 200);
            return;
        }
        rafId = requestAnimationFrame(loop);
    }

    const onCancel = () => { exportState.cancelled = true; };
    document.getElementById('export-cancel-btn')?.addEventListener('click', onCancel, { once: true });

    video.onended = () => {
        if (playBtn) playBtn.innerText = '▶ Play';
    };
    await video.play();
    rafId = requestAnimationFrame(loop);

    await finished;

    // Cleanup (keep the persistent chain; just release the export destination)
    try {
        if (exportDest && audioChain.out) audioChain.out.disconnect(exportDest);
    } catch (e) { /* ignore */ }
    video.pause();
    video.currentTime = prevTime;
    if (!wasPaused) { /* leave paused; user can resume */ }
    setExportProgress(1);

    if (!exportState.cancelled && chunks.length > 0) {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kalakar_video_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Restore playhead display
    updateTimeDisplay();
    render();
    setTimeout(() => setExportUI(false), 600);
}

document.getElementById('export-video-btn')?.addEventListener('click', () => exportVideo());
