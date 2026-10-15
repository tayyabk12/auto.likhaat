// Local library (localStorage-backed projects)
const LIBRARY_KEY = 'kalakar-library.v1';

function readLibrary() {
    try {
        return JSON.parse(localStorage.getItem(LIBRARY_KEY)) || [];
    } catch {
        return [];
    }
}

function writeLibrary(items) {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
}

function saveToLibrary() {
    if (state.elements.length === 0 && (!video || !video.src)) {
        alert('Nothing to save yet!');
        return;
    }
    const lib = readLibrary();
    const params = new URLSearchParams(location.search);
    const existingId = params.get('project');
    const now = new Date().toISOString();
    const entry = {
        id: existingId || 'proj_' + Date.now(),
        name: (state.elements[0] && state.elements[0].text
            ? state.elements[0].text.slice(0, 28)
            : 'Untitled Project'),
        savedAt: now,
        language: state.language || 'en',
        duration: getDuration(),
        hasVideo: !!(video && video.src),
        data: buildProjectData()
    };
    const idx = lib.findIndex(p => p.id === entry.id);
    if (idx >= 0) lib[idx] = entry; else lib.push(entry);
    writeLibrary(lib);
    showToast(`Saved "${entry.name}" to library${existingId ? '' : ' · ' + location.pathname + '?project=' + entry.id}`);
    if (!existingId) {
        const url = new URL(location.href);
        url.searchParams.set('project', entry.id);
        history.replaceState(null, '', url);
    }
}

function deleteFromLibrary(id) {
    writeLibrary(readLibrary().filter(p => p.id !== id));
}

function loadProjectFromLibrary(id) {
    const entry = readLibrary().find(p => p.id === id);
    if (!entry) return false;
    const data = entry.data;
    if (!data || !Array.isArray(data.captions)) return false;
    state.elements = data.captions.map((el, i) => ({
        id: el.id || `cap_import_${i}_${Date.now()}`,
        type: el.type || 'text',
        text: el.text || '',
        x: el.x ?? 100, y: el.y ?? 100, w: el.w ?? 240, h: el.h ?? 60,
        fontFamily: el.fontFamily || "'Anton', sans-serif",
        fontSize: el.fontSize ?? 52, color: el.color || '#ffffff',
        highlightColor: el.highlightColor || '#facc15',
        strokeColor: el.strokeColor || '#000000', strokeWidth: el.strokeWidth ?? 6,
        isUppercase: el.isUppercase ?? true, mode: el.mode || 'word',
        showBgBox: el.showBgBox ?? false, bgBoxColor: el.bgBoxColor || '#a79e6a',
        opacity: el.opacity ?? 1, rotation: el.rotation ?? 0,
        startTime: el.startTime ?? 0, endTime: el.endTime ?? getDuration()
    }));
    state.selectedIds.clear();
    if (state.elements.length > 0) state.selectedIds.add(state.elements[0].id);
    if (entry.language) {
        state.language = entry.language;
        const langSel = document.getElementById('caption-language');
        if (langSel) langSel.value = entry.language;
    }
    render();
    updateCaptionWordChips();
    updateCaptionBlocks();
    return true;
}

function showToast(msg) {
    let toast = document.getElementById('kalakar-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'kalakar-toast';
        toast.className = 'kalakar-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('visible'), 4000);
}

document.getElementById('save-library-btn')?.addEventListener('click', () => saveToLibrary());

// On editor load: ?project=<id> loads a saved project, ?preset=<name> applies a preset
(function initFromURL() {
    const params = new URLSearchParams(location.search);
    const lang = params.get('lang');
    if (lang) {
        const langSel = document.getElementById('caption-language');
        if (langSel && [...langSel.options].some(o => o.value === lang)) langSel.value = lang;
        state.language = lang;
    }
    const projectId = params.get('project');
    if (projectId && loadProjectFromLibrary(projectId)) {
        showToast('Project loaded from library');
        return;
    }
    const preset = params.get('preset');
    if (preset && state.selectedIds.size > 0) {
        setTimeout(() => applyPreset(preset), 50);
    }
})();
