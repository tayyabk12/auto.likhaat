let isDragging = false;
let dragTarget = null;
let isSpaceDown = false;

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        isSpaceDown = true;
    }
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        if (e.key === 'v') document.querySelector('[data-tool="select"]')?.click();
        if (e.key === 't') document.querySelector('[data-tool="text"]')?.click();
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelected();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            duplicateSelected();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
            e.preventDefault();
            redo();
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        isSpaceDown = false;
        state.isPanning = false;
    }
});

// ---------- Custom font upload ----------
document.getElementById('font-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const ext = file.name.split('.').pop().toLowerCase();
        const fmt = ext === 'woff2' ? 'woff2' : (ext === 'woff' ? 'woff' : (ext === 'otf' ? 'opentype' : 'truetype'));
        const buffer = await file.arrayBuffer();
        const fontName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const face = new FontFace(fontName, buffer, { format: fmt });
        await face.load();
        document.fonts.add(face);
        const sel = document.getElementById('font-family');
        if (sel) {
            const opt = document.createElement('option');
            opt.value = `'${fontName}', sans-serif`;
            opt.textContent = fontName + ' (Custom)';
            sel.appendChild(opt);
            sel.value = opt.value;
            applyToSelected(el => { el.fontFamily = opt.value; });
        }
        showToast('Custom font "' + fontName + '" loaded');
    } catch (err) {
        console.error('Font load failed:', err);
        alert('Could not load font: ' + err.message);
    }
    e.target.value = '';
});

document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentTool = btn.dataset.tool;
    };
});

function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

canvas.onmousedown = (e) => {
    const coords = getCanvasCoords(e);
    state.lastMouse = { x: coords.x, y: coords.y };
    const world = screenToWorld(coords.x, coords.y);

    if (isSpaceDown || e.button === 1) {
        state.isPanning = true;
        return;
    }

    if (state.currentTool === 'select') {
        const found = state.elements.slice().reverse().find(el =>
            world.x >= el.x - 10 && world.x <= el.x + (el.w || 120) + 10 &&
            world.y >= el.y - 10 && world.y <= el.y + (el.h || 50) + 10
        );

        if (found) {
            state.selectedIds.clear();
            state.selectedIds.add(found.id);
            isDragging = true;
            dragTarget = found;
            pushUndo();
            const captionInput = document.getElementById('caption-text');
            if (captionInput && found.type === 'text') {
                captionInput.value = found.text;
            }
            updateCaptionBlocks();
        } else {
            state.selectedIds.clear();
            updateCaptionBlocks();
        }
    } else if (state.currentTool === 'text') {
        pushUndo();
        const id = 'cap_' + Date.now();
        const fontFam = document.getElementById('font-family')?.value || "'Anton', sans-serif";
        const fSize = parseInt(document.getElementById('text-size')?.value, 10) || 52;
        const color = document.getElementById('fill-color')?.value || '#ffffff';
        const highlight = document.getElementById('highlight-color')?.value || '#facc15';
        const stroke = document.getElementById('stroke-color')?.value || '#000000';
        const strokeW = parseInt(document.getElementById('stroke-width')?.value, 10) || 6;

        const dur = getDuration();
        const curTime = video.currentTime || 0;

        const newCaption = {
            id,
            type: 'text',
            text: 'New Viral Caption',
            x: Math.round(world.x),
            y: Math.round(world.y),
            w: 240,
            h: 60,
            fontFamily: fontFam,
            fontSize: fSize,
            color: color,
            highlightColor: highlight,
            strokeColor: stroke,
            strokeWidth: strokeW,
            isUppercase: true,
            mode: 'word',
            showBgBox: false,
            bgBoxColor: '#a79e6a',
            opacity: 1,
            rotation: 0,
            startTime: Math.min(curTime, Math.max(0, dur - 1)),
            endTime: Math.min(curTime + 4, dur)
        };
        state.elements.push(newCaption);
        state.selectedIds.clear();
        state.selectedIds.add(id);

        // Switch to select tool for immediate drag & drop
        document.querySelector('[data-tool="select"]')?.click();
        isDragging = true;
        dragTarget = newCaption;

        const captionInput = document.getElementById('caption-text');
        if (captionInput) {
            captionInput.value = newCaption.text;
            captionInput.focus();
            captionInput.select();
        }
        updateCaptionWordChips();
        updateCaptionBlocks();
    }
    render();
};

window.onmousemove = (e) => {
    const coords = getCanvasCoords(e);
    const dx = coords.x - state.lastMouse.x;
    const dy = coords.y - state.lastMouse.y;
    state.lastMouse = { x: coords.x, y: coords.y };
    updateCursorDisplay(coords.x, coords.y);

    if (state.isPanning) {
        state.offset.x += dx;
        state.offset.y += dy;
        render();
    } else if (isDragging && dragTarget) {
        dragTarget.x += dx / state.zoom;
        dragTarget.y += dy / state.zoom;
        render();
    }
};

window.onmouseup = () => {
    state.isPanning = false;
    isDragging = false;
    dragTarget = null;
};

// Zoom relative to pointer
canvas.onwheel = (e) => {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const oldZoom = state.zoom;
    const newZoom = Math.min(Math.max(0.2, state.zoom - e.deltaY * zoomSpeed), 4);
    const coords = getCanvasCoords(e);
    state.offset.x = coords.x - (coords.x - state.offset.x) * (newZoom / oldZoom);
    state.offset.y = coords.y - (coords.y - state.offset.y) * (newZoom / oldZoom);
    state.zoom = newZoom;
    updateCursorDisplay(coords.x, coords.y);
    render();
};

// ---------- Timeline caption block interactions (drag + trim) ----------
if (captionBlocksTrack) {
    captionBlocksTrack.addEventListener('mousedown', (e) => {
        const block = e.target.closest('.caption-block');
        if (!block) return;
        e.preventDefault();
        e.stopPropagation();

        const el = state.elements.find(item => item.id === block.dataset.id);
        if (!el) return;

        state.selectedIds.clear();
        state.selectedIds.add(el.id);
        render();
        updateCaptionBlocks();

        const isLeftHandle = e.target.classList.contains('left');
        const isRightHandle = e.target.classList.contains('right');
        const mode = isLeftHandle ? 'trim-start' : (isRightHandle ? 'trim-end' : 'move');

        const trackRect = timelineTrack.getBoundingClientRect();
        const dur = getDuration();
        const startClientX = e.clientX;
        const origStart = el.startTime ?? 0;
        const origEnd = el.endTime ?? dur;
        pushUndo();

        function onBlockMove(ev) {
            const dt = ((ev.clientX - startClientX) / trackRect.width) * dur;
            if (mode === 'move') {
                const span = origEnd - origStart;
                let ns = Math.max(0, Math.min(origStart + dt, dur - span));
                el.startTime = ns;
                el.endTime = ns + span;
            } else if (mode === 'trim-start') {
                el.startTime = Math.max(0, Math.min(origStart + dt, origEnd - 0.2));
            } else if (mode === 'trim-end') {
                el.endTime = Math.min(dur, Math.max(origEnd + dt, origStart + 0.2));
            }
            render();
            updateCaptionBlocks();
            syncPropertiesPanel();
        }

        function onBlockUp() {
            window.removeEventListener('mousemove', onBlockMove);
            window.removeEventListener('mouseup', onBlockUp);
        }

        window.addEventListener('mousemove', onBlockMove);
        window.addEventListener('mouseup', onBlockUp);
    });
}
