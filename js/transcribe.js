// Auto-caption via Whisper (Transformers.js) — runs 100% local in-browser.
// No server, no upload. Model downloads once to browser cache (Cache API).
(function () {
    'use strict';

    const MODELS = {
        tiny: { id: 'Xenova/whisper-tiny', label: 'Tiny (fastest, ~40MB, lower accuracy)' },
        base: { id: 'Xenova/whisper-base', label: 'Base (balanced, ~80MB)' },
        small: { id: 'Xenova/whisper-small', label: 'Small (best for Desi langs, ~250MB)' }
    };

    const WHISPER_LANG = {
        en: 'english', hi: 'hindi', ne: 'nepali', ur: 'urdu', ta: 'tamil',
        ml: 'malayalam', gu: 'gujarati', bn: 'bengali', pa: 'punjabi',
        te: 'telugu', sd: 'sindhi', mr: 'marathi', kn: 'kannada',
        ps: 'pashto', ms: 'malay', as: 'assamese', ks: 'kashmiri',
        fa: 'persian', ar: 'arabic', or: 'oriya'
    };

    let transcriber = null;
    let loadedModelKey = null;

    async function ensurePipeline(modelKey) {
        const key = MODELS[modelKey] ? modelKey : 'base';
        if (transcriber && loadedModelKey === key) return transcriber;

        const mod = await import(
            'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/dist/transformers.min.js'
        );
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;

        transcriber = await mod.pipeline('automatic-speech-recognition', MODELS[key].id, {
            dtype: 'q8',
            progress_callback: (p) => {
                if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
                    window.dispatchEvent(new CustomEvent('asr-progress', {
                        detail: { phase: 'download', file: p.file, progress: p.progress }
                    }));
                }
            }
        });
        loadedModelKey = key;
        return transcriber;
    }

    async function fileTo16kMono(file) {
        const arrayBuffer = await file.arrayBuffer();
        const probeCtx = new (window.AudioContext || window.webkitAudioContext)();
        let decoded;
        try {
            decoded = await probeCtx.decodeAudioData(arrayBuffer);
        } finally {
            probeCtx.close();
        }
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
        const src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start(0);
        const rendered = await off.startRendering();
        return rendered.getChannelData(0);
    }

    function groupWords(chunks, maxWords, maxGap) {
        maxWords = maxWords || 5;
        maxGap = maxGap || 0.7;
        const out = [];
        let cur = null;
        for (const c of chunks) {
            const t = (c.text || '').trim();
            if (!t) continue;
            const ts = c.timestamp || [null, null];
            const start = ts[0], end = ts[1];
            if (!cur) {
                cur = { text: t, startTime: start, endTime: end, count: 1 };
                continue;
            }
            const gap = (start != null && cur.endTime != null) ? (start - cur.endTime) : 0;
            if (cur.count >= maxWords || gap > maxGap) {
                out.push(cur);
                cur = { text: t, startTime: start, endTime: end, count: 1 };
            } else {
                cur.text += ' ' + t;
                if (end != null) cur.endTime = end;
                cur.count += 1;
            }
        }
        if (cur) out.push(cur);
        return out;
    }

    function fillGaps(captions, duration) {
        for (let i = 0; i < captions.length; i++) {
            const c = captions[i];
            if (c.startTime == null) {
                c.startTime = i > 0 ? (captions[i - 1].endTime || 0) : 0;
            }
            if (c.endTime == null) {
                const next = captions[i + 1];
                c.endTime = next && next.startTime != null ? next.startTime : Math.min(c.startTime + 2, duration);
            }
            if (c.endTime <= c.startTime) c.endTime = c.startTime + 0.8;
            c.startTime = Math.max(0, Math.min(c.startTime, duration));
            c.endTime = Math.max(c.startTime + 0.2, Math.min(c.endTime, duration));
        }
        return captions;
    }

    function buildElements(captions, style) {
        const vb = state.videoBounds || { x: 80, y: 60, w: 720, h: 405 };
        const baseY = vb.y + vb.h * 0.72;
        return captions.map((c, i) => ({
            id: 'asr_' + Date.now() + '_' + i,
            type: 'text',
            text: c.text,
            x: Math.round(vb.x + vb.w * 0.5 - 240),
            y: Math.round(baseY),
            w: 480,
            h: 64,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            color: style.color,
            highlightColor: style.highlightColor,
            strokeColor: style.strokeColor,
            strokeWidth: style.strokeWidth,
            isUppercase: style.isUppercase,
            mode: 'word',
            showBgBox: false,
            bgBoxColor: '#a79e6a',
            opacity: 1,
            rotation: 0,
            startTime: c.startTime,
            endTime: c.endTime
        }));
    }

    function currentStyle() {
        const ff = document.getElementById('font-family');
        const fs = document.getElementById('text-size');
        const fc = document.getElementById('fill-color');
        const hc = document.getElementById('highlight-color');
        const sc = document.getElementById('stroke-color');
        const sw = document.getElementById('stroke-width');
        const tc = document.getElementById('toggle-case');
        return {
            fontFamily: ff ? ff.value : "'Anton', sans-serif",
            fontSize: fs ? (parseInt(fs.value, 10) || 52) : 52,
            color: fc ? fc.value : '#ffffff',
            highlightColor: hc ? hc.value : '#facc15',
            strokeColor: sc ? sc.value : '#000000',
            strokeWidth: sw ? (parseInt(sw.value, 10) || 6) : 6,
            isUppercase: tc ? tc.classList.contains('active') : true
        };
    }

    async function transcribe(file, opts) {
        opts = opts || {};
        const langCode = opts.language || state.language || 'en';
        const modelKey = opts.model || 'base';
        const maxWords = opts.maxWords || 5;

        if (!file) throw new Error('No video file imported. Click "Import Video" first.');
        if (!state.duration || state.duration <= 0) throw new Error('Video not loaded yet.');

        window.dispatchEvent(new CustomEvent('asr-progress', {
            detail: { phase: 'decode', message: 'Extracting audio track…' }
        }));
        const audio = await fileTo16kMono(file);

        const pipe = await ensurePipeline(modelKey);

        window.dispatchEvent(new CustomEvent('asr-progress', {
            detail: { phase: 'transcribe', message: 'Transcribing with Whisper (' + langCode.toUpperCase() + ')…' }
        }));

        const whisperLang = WHISPER_LANG[langCode] || undefined;
        const result = await pipe(audio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: 'word',
            language: whisperLang,
            task: 'transcribe'
        });

        const chunks = (result && result.chunks) || [];
        let captions = groupWords(chunks, maxWords, 0.7);
        if (captions.length === 0 && result && result.text) {
            captions = [{ text: result.text.trim(), startTime: 0, endTime: Math.min(4, state.duration), count: 1 }];
        }
        captions = fillGaps(captions, state.duration);

        window.dispatchEvent(new CustomEvent('asr-progress', {
            detail: { phase: 'apply', message: 'Applying ' + captions.length + ' captions…' }
        }));

        const els = buildElements(captions, currentStyle());
        return { captions, elements: els };
    }

    window.KalakarASR = {
        transcribe,
        models: MODELS,
        languages: WHISPER_LANG
    };

    // ---- UI glue: Auto Caption button ----
    let asrStatusTimeout = null;
    window.runAutoCaption = async function () {
        const btn = document.getElementById('auto-caption-btn');
        const statusEl = document.getElementById('asr-status');
        if (!btn || !statusEl) return;

        if (!state.videoFile) {
            alert('Import a video first, then click Auto Caption.');
            return;
        }

        // Clear any pending status-timeout from a previous run and reset color
        if (asrStatusTimeout) {
            clearTimeout(asrStatusTimeout);
            asrStatusTimeout = null;
        }
        statusEl.style.color = '#10b981';

        btn.disabled = true;
        btn.style.opacity = '0.6';
        statusEl.style.display = 'inline';

        const onProgress = (e) => {
            const d = e.detail || {};
            if (d.phase === 'download') {
                statusEl.textContent = 'Downloading model ' + Math.round(d.progress || 0) + '%…';
            } else if (d.phase === 'decode') {
                statusEl.textContent = 'Extracting audio…';
            } else if (d.phase === 'transcribe') {
                statusEl.textContent = 'Transcribing…';
            } else if (d.phase === 'apply') {
                statusEl.textContent = d.message || 'Applying…';
            }
        };
        window.addEventListener('asr-progress', onProgress);

        try {
            statusEl.textContent = 'Starting…';
            const result = await KalakarASR.transcribe(state.videoFile, {
                language: state.language || 'en',
                model: 'base',
                maxWords: 5
            });

            pushUndo();
            // Remove previous auto-captions
            state.elements = state.elements.filter(el => !String(el.id).startsWith('asr_'));
            result.elements.forEach(el => state.elements.push(el));
            state.selectedIds.clear();
            if (result.elements.length) state.selectedIds.add(result.elements[0].id);

            render();
            updateCaptionBlocks();
            updateCaptionWordChips();
            syncPropertiesPanel();

            statusEl.textContent = 'Done — ' + result.captions.length + ' captions generated';
            asrStatusTimeout = setTimeout(() => {
                statusEl.style.display = 'none';
                statusEl.textContent = '';
                asrStatusTimeout = null;
            }, 4000);
        } catch (err) {
            console.error('Auto caption failed:', err);
            statusEl.textContent = 'Failed: ' + (err && err.message ? err.message : 'unknown error');
            statusEl.style.color = '#ef4444';
            asrStatusTimeout = setTimeout(() => {
                statusEl.style.display = 'none';
                statusEl.textContent = '';
                statusEl.style.color = '#10b981';
                asrStatusTimeout = null;
            }, 6000);
        } finally {
            window.removeEventListener('asr-progress', onProgress);
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };
})();
