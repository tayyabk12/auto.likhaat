const state = {
    elements: [
        {
            id: 'caption_1',
            type: 'text',
            text: 'Aur Hasad karna kuchh is tarah',
            x: 180,
            y: 260,
            w: 480,
            h: 70,
            fontFamily: "'Anton', sans-serif",
            fontSize: 52,
            color: '#ffffff',
            highlightColor: '#facc15',
            strokeColor: '#000000',
            strokeWidth: 6,
            isUppercase: true,
            mode: 'word',
            showBgBox: false,
            bgBoxColor: '#a79e6a',
            opacity: 1,
            rotation: 0,
            startTime: 0,
            endTime: 5
        }
    ],
    selectedIds: new Set(['caption_1']),
    currentTool: 'select',
    theme: 'dark',
    zoom: 1,
    offset: { x: 0, y: 0 },
    lastMouse: { x: 0, y: 0 },
    videoBounds: null,
    showSafeZone: false,
    duration: 30,
    language: 'en',
    videoFile: null,
    undoStack: [],
    redoStack: []
};

const MAX_HISTORY = 50;

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const viewport = document.getElementById('viewport');
const video = document.getElementById('bg-video');
const playBtn = document.getElementById('play-btn');
const timeDisplay = document.getElementById('time-display');
const playhead = document.getElementById('playhead');
const timelineTrack = document.getElementById('timeline-track');
const captionTrack = document.getElementById('caption-badges-track');
const captionBlocksTrack = document.getElementById('caption-blocks-track');
const timelineRuler = document.getElementById('timeline-ruler');
const waveformCanvas = document.getElementById('waveform-canvas');
const cursorPos = document.getElementById('cursor-pos');

// ---------- History (undo/redo) ----------
function snapshot() {
    return JSON.stringify(state.elements);
}

function pushUndo() {
    state.undoStack.push(snapshot());
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
    state.redoStack = [];
}

function undo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(snapshot());
    restoreSnapshot(state.undoStack.pop());
}

function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(snapshot());
    restoreSnapshot(state.redoStack.pop());
}

function restoreSnapshot(json) {
    state.elements = JSON.parse(json);
    const ids = new Set(state.elements.map(el => el.id));
    state.selectedIds.forEach(id => { if (!ids.has(id)) state.selectedIds.delete(id); });
    render();
    updateCaptionWordChips();
    updateCaptionBlocks();
}

// Resize canvas to match viewport
function resize() {
    canvas.width = viewport.clientWidth;
    canvas.height = viewport.clientHeight;
    render();
    drawRuler();
    drawWaveform();
    updateCaptionBlocks();
}
window.onresize = resize;

// Screen to World coordinates
function screenToWorld(x, y) {
    return {
        x: (x - state.offset.x) / state.zoom,
        y: (y - state.offset.y) / state.zoom
    };
}

// Time formatter
function formatTime(s) {
    if (isNaN(s) || s < 0) return '00:00:00';
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getDuration() {
    return video.duration || state.duration || 30;
}

function isCaptionActive(el, t) {
    const dur = getDuration();
    const start = el.startTime ?? 0;
    const end = el.endTime ?? dur;
    return t >= start && t <= end;
}

function updateTimeDisplay() {
    const cur = video.currentTime || 0;
    const dur = getDuration();
    if (timeDisplay) {
        timeDisplay.innerText = `${formatTime(cur)} / ${formatTime(dur)}`;
    }
    const percent = Math.min(Math.max((cur / dur) * 100, 0), 100);
    if (playhead) {
        playhead.style.left = `${percent}%`;
    }
    updateCaptionWordChips();
}

function updateCursorDisplay(sx, sy) {
    if (!cursorPos) return;
    const world = (sx !== undefined) ? screenToWorld(sx, sy) : null;
    const posText = world ? `X: ${Math.round(world.x)} Y: ${Math.round(world.y)}` : 'X: - Y: -';
    cursorPos.innerText = `${posText} | Zoom: ${Math.round(state.zoom * 100)}%`;
}

// Video Upload
const videoUpload = document.getElementById('video-upload');
if (videoUpload) {
    videoUpload.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            state.videoFile = file;
            const url = URL.createObjectURL(file);
            video.src = url;
            video.load();
            video.onloadedmetadata = () => {
                state.duration = video.duration || 30;
                const isAudioOnly = file.type.startsWith('audio/') || (video.videoWidth === 0 && video.videoHeight === 0);
                const aspect = (!isAudioOnly && video.videoWidth && video.videoHeight)
                    ? video.videoWidth / video.videoHeight
                    : 16 / 9;
                const w = Math.min(viewport.clientWidth * 0.75, 720);
                const h = w / aspect;
                state.videoBounds = {
                    x: (canvas.width - w) / 2,
                    y: (canvas.height - h) / 2 - 20,
                    w: w,
                    h: h
                };
                // Place default caption centered near bottom third of video
                const cap = state.elements[0];
                if (cap) {
                    cap.x = state.videoBounds.x + (state.videoBounds.w - cap.w) / 2;
                    cap.y = state.videoBounds.y + state.videoBounds.h * 0.75;
                    if (cap.endTime === undefined || cap.endTime === 5) {
                        cap.endTime = Math.min(5, state.duration);
                    }
                }
                // Clamp all captions into new duration
                state.elements.forEach(el => {
                    el.startTime = Math.min(el.startTime ?? 0, Math.max(0, state.duration - 0.5));
                    el.endTime = Math.min(el.endTime ?? state.duration, state.duration);
                    if (el.endTime <= el.startTime) el.endTime = Math.min(el.startTime + 1, state.duration);
                });
                updateTimeDisplay();
                drawRuler();
                drawWaveform();
                updateCaptionBlocks();
                render();
                if (typeof extractWaveform === 'function') extractWaveform(file);
            };
        }
    };
}

// Play/Pause
if (playBtn) {
    playBtn.onclick = () => {
        if (!video.src) {
            videoUpload?.click();
            return;
        }
        if (video.paused) {
            video.play();
            playBtn.innerText = '⏸ Pause';
        } else {
            video.pause();
            playBtn.innerText = '▶ Play';
        }
    };
}

video.ontimeupdate = () => {
    updateTimeDisplay();
    render();
};

video.onended = () => {
    if (playBtn) playBtn.innerText = '▶ Play';
};

// Timeline Scrubbing (ignore clicks on caption blocks)
if (timelineTrack) {
    timelineTrack.addEventListener('click', (e) => {
        if (e.target.closest('.caption-block')) return;
        const rect = timelineTrack.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        const dur = getDuration();
        video.currentTime = ratio * dur;
        updateTimeDisplay();
        render();
    });
}

// Get Active Word Index for Karaoke — based on caption timing window
function getActiveWordIndex(totalWords, el) {
    if (totalWords <= 1) return 0;
    if (el && el.mode === 'line') return -1;
    const dur = getDuration();
    const cur = video.currentTime || 0;
    let start = 0;
    let end = dur;
    if (el) {
        start = el.startTime ?? 0;
        end = el.endTime ?? dur;
    }
    const span = end - start;
    if (span <= 0) return 0;
    const progress = Math.min(Math.max((cur - start) / span, 0), 0.9999);
    return Math.floor(progress * totalWords);
}

// Draw Audio Waveform (real peaks if available, placeholder otherwise)
function drawWaveform() {
    if (!waveformCanvas) return;
    waveformCanvas.width = waveformCanvas.parentElement.clientWidth || 800;
    waveformCanvas.height = 28;
    const wctx = waveformCanvas.getContext('2d');
    wctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    wctx.fillStyle = '#34d399';
    const peaks = state.audioPeaks;
    if (peaks && peaks.length > 0) {
        const barW = 2;
        const gap = 2;
        const totalBars = Math.floor(waveformCanvas.width / (barW + gap));
        for (let i = 0; i < totalBars; i++) {
            const peakIdx = Math.floor((i / totalBars) * peaks.length);
            const h = Math.max(2, peaks[peakIdx] * 24);
            const y = (28 - h) / 2;
            wctx.fillRect(i * (barW + gap), y, barW, h);
        }
    } else {
        const totalBars = Math.floor(waveformCanvas.width / 4);
        for (let i = 0; i < totalBars; i++) {
            const h = Math.sin(i * 0.15) * 8 + Math.cos(i * 0.4) * 5 + 10;
            const y = (28 - h) / 2;
            wctx.fillRect(i * 4, y, 2, h);
        }
    }
    // Playhead position on waveform
    const cur = video.currentTime || 0;
    const dur = getDuration();
    const px = (cur / dur) * waveformCanvas.width;
    wctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
    wctx.fillRect(px, 0, 2, 28);
}

// Draw Timeline Ruler Ticks
function drawRuler() {
    if (!timelineRuler) return;
    timelineRuler.innerHTML = '';
    const dur = Math.ceil(getDuration());
    const step = dur > 60 ? 10 : 2;
    for (let sec = 0; sec <= dur; sec += step) {
        const pct = (sec / dur) * 100;
        const tick = document.createElement('div');
        tick.className = 'ruler-tick';
        tick.style.left = `${pct}%`;
        const mins = Math.floor(sec / 60);
        const s = sec % 60;
        tick.innerText = `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        timelineRuler.appendChild(tick);
    }
}

// Render Caption Word Badges in Timeline
function updateCaptionWordChips() {
    if (!captionTrack) return;
    const selected = state.elements.find(el => state.selectedIds.has(el.id) && el.type === 'text')
        || state.elements.find(el => el.type === 'text');
    if (!selected) {
        captionTrack.innerHTML = '<span style="font-size:11px; color:#71717a; padding-left:8px;">No captions added yet. Click (T) to add.</span>';
        return;
    }
    const words = (selected.text || '').trim().split(/\s+/).filter(Boolean);
    const activeIdx = getActiveWordIndex(words.length, selected);
    const cur = video.currentTime || 0;
    const inWindow = isCaptionActive(selected, cur);

    captionTrack.innerHTML = '';
    words.forEach((word, idx) => {
        const badge = document.createElement('div');
        badge.className = `caption-word-badge ${idx === activeIdx && inWindow ? 'active-word' : ''}`;
        badge.innerHTML = `<span>${selected.isUppercase ? word.toUpperCase() : word}</span><small style="opacity:0.6; font-size:9px;">Text</small>`;
        badge.onclick = (e) => {
            e.stopPropagation();
            const start = selected.startTime ?? 0;
            const end = selected.endTime ?? getDuration();
            const span = end - start;
            video.currentTime = start + (idx / words.length) * span;
            updateTimeDisplay();
            render();
        };
        captionTrack.appendChild(badge);
    });
}

// Render caption timing blocks on timeline
function updateCaptionBlocks() {
    if (!captionBlocksTrack) return;
    const dur = getDuration();
    captionBlocksTrack.innerHTML = '';
    state.elements.forEach(el => {
        if (el.type !== 'text') return;
        const start = el.startTime ?? 0;
        const end = el.endTime ?? dur;
        const block = document.createElement('div');
        block.className = `caption-block ${state.selectedIds.has(el.id) ? 'selected' : ''}`;
        block.dataset.id = el.id;
        block.style.left = `${(start / dur) * 100}%`;
        block.style.width = `${Math.max(((end - start) / dur) * 100, 1.5)}%`;
        const label = document.createElement('span');
        label.className = 'block-label';
        label.textContent = el.text || 'Caption';
        const handleL = document.createElement('div');
        handleL.className = 'block-handle left';
        const handleR = document.createElement('div');
        handleR.className = 'block-handle right';
        block.appendChild(handleL);
        block.appendChild(label);
        block.appendChild(handleR);
        captionBlocksTrack.appendChild(block);
    });
}

// Render Engine Loop
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(state.offset.x, state.offset.y);
    ctx.scale(state.zoom, state.zoom);

    const cur = video.currentTime || 0;

    // Render Video Frame if available
    if (video && video.readyState >= 2 && state.videoBounds) {
        ctx.save();
        ctx.drawImage(video, state.videoBounds.x, state.videoBounds.y, state.videoBounds.w, state.videoBounds.h);
        // Draw Subtle Video Safezone Border
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.lineWidth = 1 / state.zoom;
        ctx.strokeRect(state.videoBounds.x, state.videoBounds.y, state.videoBounds.w, state.videoBounds.h);
        if (state.showSafeZone) drawSafeZoneGuides();
        ctx.restore();
    }

    // Render Elements / Captions
    state.elements.forEach(el => {
        const active = isCaptionActive(el, cur);
        ctx.save();
        ctx.translate(el.x, el.y);
        ctx.rotate(((el.rotation || 0) * Math.PI) / 180);
        ctx.globalAlpha = active ? (el.opacity ?? 1) : 0.15;

        if (el.type === 'text') {
            renderViralCaption(el, active);
        } else {
            ctx.fillStyle = el.color || '#3b82f6';
            ctx.fillRect(0, 0, el.w, el.h);
        }

        // Selection outline
        if (state.selectedIds.has(el.id)) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#FACC15';
            ctx.lineWidth = 2 / state.zoom;
            ctx.strokeRect(-6, -6, el.w + 12, el.h + 12);
        }
        ctx.restore();
    });

    ctx.restore();
    syncPropertiesPanel();
    updateCursorDisplay();
}

// Safe zone guides (9:16 pillars + title-safe inset)
function drawSafeZoneGuides() {
    const vb = state.videoBounds;
    if (!vb) return;
    const z = state.zoom;
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 1 / z;
    ctx.setLineDash([6 / z, 4 / z]);

    // 9:16 pillar box (centered) — for vertical export framing
    const pillarW = vb.h * (9 / 16);
    if (pillarW < vb.w) {
        const px = vb.x + (vb.w - pillarW) / 2;
        ctx.strokeRect(px, vb.y, pillarW, vb.h);
    }

    // Title-safe inset (5%)
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    const insetX = vb.w * 0.05;
    const insetY = vb.h * 0.05;
    ctx.strokeRect(vb.x + insetX, vb.y + insetY, vb.w - insetX * 2, vb.h - insetY * 2);
    ctx.restore();
}

// Render Professional Viral Caption with word-level highlight & outline
function renderViralCaption(el, active) {
    const rawWords = (el.text || '').trim().split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) return;

    const words = el.isUppercase ? rawWords.map(w => w.toUpperCase()) : rawWords;
    const fontSize = el.fontSize || 52;
    const fontFamily = el.fontFamily || "'Anton', sans-serif";
    ctx.font = `900 ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    const activeIndex = active ? getActiveWordIndex(words.length, el) : -1;
    const spaceWidth = ctx.measureText(' ').width;

    // Calculate total dimensions
    let totalWidth = 0;
    const wordWidths = words.map(w => {
        const mw = ctx.measureText(w).width;
        totalWidth += mw;
        return mw;
    });
    totalWidth += spaceWidth * (words.length - 1);
    const totalHeight = fontSize * 1.25;

    el.w = Math.max(totalWidth, 60);
    el.h = Math.max(totalHeight, 30);

    // Optional Background Pill/Box
    if (el.showBgBox) {
        ctx.save();
        ctx.fillStyle = el.bgBoxColor || '#a79e6a';
        ctx.beginPath();
        const r = 8;
        const padX = 14;
        const padY = 6;
        ctx.roundRect(-padX, -padY, el.w + padX * 2, el.h + padY * 2, r);
        ctx.fill();
        ctx.restore();
    }

    // Shadow setup
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    let curX = 0;
    words.forEach((word, idx) => {
        const isActive = (idx === activeIndex);
        const wWidth = wordWidths[idx];

        // Draw Thick Outline (Essential for viral captions)
        if (el.strokeWidth > 0) {
            ctx.lineWidth = el.strokeWidth || 6;
            ctx.strokeStyle = el.strokeColor || '#000000';
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(word, curX, 0);
        }

        // Fill Text (Highlighted Word vs Base Text)
        ctx.fillStyle = isActive ? (el.highlightColor || '#FACC15') : (el.color || '#FFFFFF');
        ctx.fillText(word, curX, 0);

        curX += wWidth + spaceWidth;
    });
}

// Continuous requestAnimationFrame loop for video sync
function animationLoop() {
    if (video && !video.paused && !video.ended) {
        render();
        updateTimeDisplay();
        drawWaveform();
    }
    requestAnimationFrame(animationLoop);
}
requestAnimationFrame(animationLoop);

// Sync Properties Panel controls
function syncPropertiesPanel() {
    const selected = state.elements.find(el => state.selectedIds.has(el.id));
    if (!selected) return;

    const captionInput = document.getElementById('caption-text');
    const colorInput = document.getElementById('fill-color');
    const highlightInput = document.getElementById('highlight-color');
    const sizeInput = document.getElementById('text-size');
    const fontSelect = document.getElementById('font-family');
    const strokeColor = document.getElementById('stroke-color');
    const strokeWidth = document.getElementById('stroke-width');
    const bgBoxToggle = document.getElementById('bg-box-toggle');
    const bgBoxColor = document.getElementById('bg-box-color');
    const caseBtn = document.getElementById('toggle-case');
    const startInput = document.getElementById('caption-start');
    const endInput = document.getElementById('caption-end');
    const rotationSlider = document.getElementById('rotation-slider');
    const opacitySlider = document.getElementById('opacity-slider');

    if (captionInput && document.activeElement !== captionInput) captionInput.value = selected.text || '';
    if (colorInput && document.activeElement !== colorInput) colorInput.value = selected.color || '#ffffff';
    if (highlightInput && document.activeElement !== highlightInput) highlightInput.value = selected.highlightColor || '#facc15';
    if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = selected.fontSize || 52;
    if (fontSelect && document.activeElement !== fontSelect) fontSelect.value = selected.fontFamily || "'Anton', sans-serif";
    if (strokeColor && document.activeElement !== strokeColor) strokeColor.value = selected.strokeColor || '#000000';
    if (strokeWidth && document.activeElement !== strokeWidth) strokeWidth.value = selected.strokeWidth ?? 6;
    if (bgBoxToggle) bgBoxToggle.checked = !!selected.showBgBox;
    if (bgBoxColor && document.activeElement !== bgBoxColor) bgBoxColor.value = selected.bgBoxColor || '#a79e6a';
    if (caseBtn) {
        caseBtn.classList.toggle('active', !!selected.isUppercase);
        caseBtn.innerText = selected.isUppercase ? 'UPPERCASE' : 'Normal Case';
    }
    if (startInput && document.activeElement !== startInput) startInput.value = (selected.startTime ?? 0).toFixed(1);
    if (endInput && document.activeElement !== endInput) endInput.value = (selected.endTime ?? getDuration()).toFixed(1);
    if (rotationSlider) {
        rotationSlider.value = selected.rotation || 0;
        const rv = document.getElementById('rotation-val');
        if (rv) rv.textContent = selected.rotation || 0;
    }
    if (opacitySlider) {
        opacitySlider.value = Math.round((selected.opacity ?? 1) * 100);
        const ov = document.getElementById('opacity-val');
        if (ov) ov.textContent = Math.round((selected.opacity ?? 1) * 100);
    }

    // Update layer list
    const layerList = document.getElementById('layer-list');
    if (layerList) {
        layerList.innerHTML = '';
        [...state.elements].reverse().forEach(el => {
            const div = document.createElement('div');
            div.className = `layer-item ${state.selectedIds.has(el.id) ? 'active' : ''}`;
            div.innerHTML = `<span>${el.type === 'text' ? (el.text ? el.text.slice(0, 16) : 'Caption') : el.type}</span><small>${String(el.id).slice(-4)}</small>`;
            div.onclick = () => {
                state.selectedIds.clear();
                state.selectedIds.add(el.id);
                render();
                updateCaptionBlocks();
            };
            layerList.appendChild(div);
        });
    }
}

// Property Event Listeners
function applyToSelected(updater, options = {}) {
    if (options.undo !== false) pushUndo();
    state.selectedIds.forEach(id => {
        const el = state.elements.find(item => item.id === id);
        if (el) updater(el);
    });
    render();
    updateCaptionWordChips();
    updateCaptionBlocks();
}

document.getElementById('caption-text')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.text = e.target.value; }, { undo: !e.target.dataset.undoPushed });
    e.target.dataset.undoPushed = '1';
});
document.getElementById('caption-text')?.addEventListener('blur', (e) => {
    delete e.target.dataset.undoPushed;
});

document.getElementById('fill-color')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.color = e.target.value; }, { undo: !e.target.dataset.undoPushed });
    e.target.dataset.undoPushed = '1';
});
document.getElementById('fill-color')?.addEventListener('change', (e) => {
    delete e.target.dataset.undoPushed;
});

document.getElementById('highlight-color')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.highlightColor = e.target.value; }, { undo: !e.target.dataset.undoPushed });
    e.target.dataset.undoPushed = '1';
});
document.getElementById('highlight-color')?.addEventListener('change', (e) => {
    delete e.target.dataset.undoPushed;
});

document.getElementById('text-size')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.fontSize = parseInt(e.target.value, 10) || 48; });
});

document.getElementById('font-family')?.addEventListener('change', (e) => {
    applyToSelected(el => { el.fontFamily = e.target.value; });
});

document.getElementById('stroke-color')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.strokeColor = e.target.value; }, { undo: !e.target.dataset.undoPushed });
    e.target.dataset.undoPushed = '1';
});
document.getElementById('stroke-color')?.addEventListener('change', (e) => {
    delete e.target.dataset.undoPushed;
});

document.getElementById('stroke-width')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.strokeWidth = parseInt(e.target.value, 10) || 0; });
});

document.getElementById('bg-box-toggle')?.addEventListener('change', (e) => {
    applyToSelected(el => { el.showBgBox = e.target.checked; });
});

document.getElementById('bg-box-color')?.addEventListener('input', (e) => {
    applyToSelected(el => { el.bgBoxColor = e.target.value; }, { undo: !e.target.dataset.undoPushed });
    e.target.dataset.undoPushed = '1';
});
document.getElementById('bg-box-color')?.addEventListener('change', (e) => {
    delete e.target.dataset.undoPushed;
});

document.getElementById('toggle-case')?.addEventListener('click', () => {
    applyToSelected(el => { el.isUppercase = !el.isUppercase; });
});

// Timing controls
document.getElementById('caption-start')?.addEventListener('change', (e) => {
    const val = Math.max(0, parseFloat(e.target.value) || 0);
    applyToSelected(el => {
        el.startTime = val;
        if (el.endTime <= el.startTime) el.endTime = el.startTime + 0.5;
    });
});

document.getElementById('caption-end')?.addEventListener('change', (e) => {
    const val = Math.min(getDuration(), Math.max(0.1, parseFloat(e.target.value) || 0.1));
    applyToSelected(el => {
        el.endTime = val;
        if (el.endTime <= el.startTime) el.startTime = Math.max(0, el.endTime - 0.5);
    });
});

// Rotation / opacity sliders (snapshot on pointer-down so undo restores pre-drag state)
['rotation-slider', 'opacity-slider'].forEach(id => {
    document.getElementById(id)?.addEventListener('pointerdown', () => pushUndo());
});
document.getElementById('rotation-slider')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) || 0;
    const rv = document.getElementById('rotation-val');
    if (rv) rv.textContent = val;
    applyToSelected(el => { el.rotation = val; }, { undo: false });
});

document.getElementById('opacity-slider')?.addEventListener('input', (e) => {
    const val = (parseInt(e.target.value, 10) || 100) / 100;
    const ov = document.getElementById('opacity-val');
    if (ov) ov.textContent = Math.round(val * 100);
    applyToSelected(el => { el.opacity = val; }, { undo: false });
});

// Mode switcher (Word by word vs full line)
document.getElementById('mode-word')?.addEventListener('click', () => {
    document.getElementById('mode-word').classList.add('active');
    document.getElementById('mode-line').classList.remove('active');
    applyToSelected(el => { el.mode = 'word'; });
});

document.getElementById('mode-line')?.addEventListener('click', () => {
    document.getElementById('mode-line').classList.add('active');
    document.getElementById('mode-word').classList.remove('active');
    applyToSelected(el => { el.mode = 'line'; });
});

// Viral Caption Presets
document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const preset = card.dataset.preset;
        applyPreset(preset);
    });
});

function applyPreset(preset) {
    applyToSelected(el => {
        if (preset === 'viral-anton') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 54;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 6;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'neon-punch') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 48;
            el.color = '#FFFFFF';
            el.highlightColor = '#4ADE80';
            el.strokeColor = '#000000';
            el.strokeWidth = 5;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'boxed-pill') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 44;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 3;
            el.showBgBox = true;
            el.bgBoxColor = '#a79e6a';
            el.isUppercase = true;
        } else if (preset === 'clean-reel') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 46;
            el.color = '#FFFFFF';
            el.highlightColor = '#60A5FA';
            el.strokeColor = '#000000';
            el.strokeWidth = 2;
            el.showBgBox = false;
            el.isUppercase = false;
        }
        // Hinglish/Desi Viral Presets
        else if (preset === 'hinglish-hook') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 54;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 7;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'desi-reality') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 48;
            el.color = '#FFFFFF';
            el.highlightColor = '#4ADE80';
            el.strokeColor = '#000000';
            el.strokeWidth = 5;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'game-changer') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 44;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 3;
            el.showBgBox = true;
            el.bgBoxColor = '#F97316';
            el.isUppercase = true;
        } else if (preset === 'my-rules') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 52;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 6;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'transformation') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 46;
            el.color = '#FFFFFF';
            el.highlightColor = '#60A5FA';
            el.strokeColor = '#000000';
            el.strokeWidth = 2;
            el.isUppercase = false;
            el.showBgBox = false;
        } else if (preset === 'comment-bait') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 44;
            el.color = '#FFFFFF';
            el.highlightColor = '#4ADE80';
            el.strokeColor = '#000000';
            el.strokeWidth = 4;
            el.isUppercase = true;
            el.showBgBox = false;
        }
        // Viral Hook Presets (Phase 2)
        else if (preset === 'pov-reveal') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 54;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 7;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'plot-twist') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 52;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 6;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'wait-for-it') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 48;
            el.color = '#FFFFFF';
            el.highlightColor = '#4ADE80';
            el.strokeColor = '#000000';
            el.strokeWidth = 5;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'unbelievable') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 50;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 7;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'secret-revealed') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 46;
            el.color = '#FFFFFF';
            el.highlightColor = '#60A5FA';
            el.strokeColor = '#000000';
            el.strokeWidth = 4;
            el.isUppercase = false;
            el.showBgBox = false;
        }
        // Engagement Presets (Phase 3)
        else if (preset === 'save-worthy') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 42;
            el.color = '#FFFFFF';
            el.highlightColor = '#F97316';
            el.strokeColor = '#000000';
            el.strokeWidth = 3;
            el.isUppercase = true;
            el.showBgBox = true;
            el.bgBoxColor = '#F97316';
        } else if (preset === 'tag-friend') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 50;
            el.color = '#FFFFFF';
            el.highlightColor = '#A78BFA';
            el.strokeColor = '#000000';
            el.strokeWidth = 6;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'part-2') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 48;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 5;
            el.isUppercase = true;
            el.showBgBox = false;
        }
        // Aesthetic Presets (Phase 3)
        else if (preset === 'clean-minimal') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 44;
            el.color = '#FFFFFF';
            el.highlightColor = '#60A5FA';
            el.strokeColor = '#000000';
            el.strokeWidth = 0;
            el.isUppercase = false;
            el.showBgBox = false;
        } else if (preset === 'main-character') {
            el.fontFamily = "'Anton', sans-serif";
            el.fontSize = 52;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 4;
            el.isUppercase = true;
            el.showBgBox = false;
        } else if (preset === 'manifesting') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 46;
            el.color = '#FFFFFF';
            el.highlightColor = '#A78BFA';
            el.strokeColor = '#000000';
            el.strokeWidth = 3;
            el.isUppercase = false;
            el.showBgBox = false;
        } else if (preset === 'real-over-perfect') {
            el.fontFamily = "'Outfit', sans-serif";
            el.fontSize = 48;
            el.color = '#FFFFFF';
            el.highlightColor = '#FACC15';
            el.strokeColor = '#000000';
            el.strokeWidth = 3;
            el.isUppercase = true;
            el.showBgBox = false;
        }
    });
}

// Template cards (Templates tab)
const templateStyles = {
    hormozi: { preset: 'viral-anton', text: 'THIS CHANGED EVERYTHING' },
    neon: { preset: 'neon-punch', text: 'WAIT FOR IT...' },
    boxed: { preset: 'boxed-pill', text: '3 STEPS, THAT\'S IT' },
    clean: { preset: 'clean-reel', text: 'here\'s the secret' },
    hook: { preset: 'viral-anton', text: 'NOBODY TELLS YOU THIS' },
    cta: { preset: 'neon-punch', text: 'FOLLOW FOR PART 2' },
    // Hinglish/Desi Viral Styles
    'hinglish-hook': { preset: 'hinglish-hook', text: 'Kal se nahi — aaj se 🔥' },
    'desi-reality': { preset: 'desi-reality', text: 'Mujhe ye 2 saal pehle pata hota 🥺' },
    'game-changer': { preset: 'game-changer', text: 'Game changer for creators 🚀' },
    'my-rules': { preset: 'my-rules', text: 'Meri duniya meri rules 😎' },
    'transformation': { preset: 'transformation', text: '1 year ago vs now. Started 🔥' },
    'comment-bait': { preset: 'comment-bait', text: "Comment 'AI' for tool list 👇" },
    // Viral Hook Styles (Phase 2)
    'pov-reveal': { preset: 'pov-reveal', text: 'POV: You finally figured it out' },
    'plot-twist': { preset: 'plot-twist', text: 'Plot twist: I am the main character' },
    'wait-for-it': { preset: 'wait-for-it', text: 'Wait for it... 😱' },
    'unbelievable': { preset: 'unbelievable', text: 'You won\'t believe what happens next' },
    'secret-revealed': { preset: 'secret-revealed', text: 'Nobody tells you this...' },
    // Engagement Styles (Phase 3)
    'save-worthy': { preset: 'save-worthy', text: 'Save karo future ke liye 📌' },
    'tag-friend': { preset: 'tag-friend', text: 'Tag karo us dost ko 😂' },
    'part-2': { preset: 'part-2', text: 'Follow for Part 2 👀' },
    // Aesthetic Styles (Phase 3)
    'clean-minimal': { preset: 'clean-minimal', text: 'Less talk, more reels' },
    'main-character': { preset: 'main-character', text: 'Main character energy ✨' },
    'manifesting': { preset: 'manifesting', text: 'Manifesting this reality 🕯️' },
    'real-over-perfect': { preset: 'real-over-perfect', text: 'Real > Perfect ✌️' }
};
document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
        const tpl = templateStyles[card.dataset.template];
        if (!tpl) return;
        applyToSelected(el => {
            el.text = tpl.text;
        });
        applyPreset(tpl.preset);
    });
});

// Menu bar → panel tabs (in-panel tab strip)
document.querySelectorAll('.panel-tab-btn[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.panel-tab-btn').forEach(m => m.classList.remove('active'));
        item.classList.add('active');
        const panel = item.dataset.panel;
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.toggle('hidden', tab.id !== `panel-${panel}`);
        });
    });
});

// Safe zone toggle
document.getElementById('safe-zone-toggle')?.addEventListener('click', () => {
    state.showSafeZone = !state.showSafeZone;
    document.getElementById('safe-zone-toggle').classList.toggle('active', state.showSafeZone);
    render();
});

// Caption language picker
document.getElementById('caption-language')?.addEventListener('change', (e) => {
    state.language = e.target.value;
});

// Audio tab: volume / mute
document.getElementById('volume-slider')?.addEventListener('input', (e) => {
    const v = (parseInt(e.target.value, 10) || 0) / 100;
    video.volume = v;
    const vv = document.getElementById('volume-val');
    if (vv) vv.textContent = Math.round(v * 100);
});
document.getElementById('mute-toggle')?.addEventListener('change', (e) => {
    video.muted = e.target.checked;
});

// Duplicate / Delete buttons
document.getElementById('duplicate-layer')?.addEventListener('click', () => duplicateSelected());
document.getElementById('delete-layer')?.addEventListener('click', () => deleteSelected());

function duplicateSelected() {
    if (state.selectedIds.size === 0) return;
    pushUndo();
    const newIds = [];
    [...state.selectedIds].forEach(id => {
        const el = state.elements.find(item => item.id === id);
        if (!el) return;
        const copy = JSON.parse(JSON.stringify(el));
        copy.id = 'cap_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        copy.x += 20;
        copy.y += 20;
        state.elements.push(copy);
        newIds.push(copy.id);
    });
    state.selectedIds.clear();
    newIds.forEach(id => state.selectedIds.add(id));
    render();
    updateCaptionWordChips();
    updateCaptionBlocks();
}

function deleteSelected() {
    if (state.selectedIds.size === 0) return;
    pushUndo();
    state.elements = state.elements.filter(el => !state.selectedIds.has(el.id));
    state.selectedIds.clear();
    render();
    updateCaptionWordChips();
    updateCaptionBlocks();
}

// Clear Canvas
document.getElementById('clear-canvas')?.addEventListener('click', () => {
    if (confirm('Clear all captions from canvas?')) {
        pushUndo();
        state.elements = [];
        state.selectedIds.clear();
        render();
        updateCaptionWordChips();
        updateCaptionBlocks();
    }
});

// Initialize on page load
resize();
updateTimeDisplay();
drawRuler();
drawWaveform();
updateCaptionWordChips();
updateCaptionBlocks();
updateCursorDisplay();
