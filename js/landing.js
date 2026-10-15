// Landing page: language chips + creator logos + template gallery + pricing toggle
const KALAKAR_LANGUAGES = [
    ['hi', 'Hindi', 'हिन्दी'], ['en', 'English', 'English'], ['ne', 'Nepali', 'नेपाली'],
    ['ur', 'Urdu', 'اردو'], ['ta', 'Tamil', 'தமிழ்'], ['ml', 'Malayalam', 'മലയാളം'],
    ['gu', 'Gujarati', 'ગુજરાતી'], ['bn', 'Bengali', 'বাংলা'], ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
    ['te', 'Telugu', 'తెలుగు'], ['sd', 'Sindhi', 'سنڌي'], ['mr', 'Marathi', 'मराठी'],
    ['kn', 'Kannada', 'ಕನ್ನಡ'], ['ps', 'Pushto', 'پښتو'], ['ms', 'Malay', 'Melayu'],
    ['as', 'Assamese', 'অসমীয়া'], ['ks', 'Kashmiri', 'کٲشُر'], ['fa', 'Persian', 'فارسی'],
    ['ar', 'Arabic', 'العربية'], ['or', 'Odia', 'ଓଡ଼ିଆ']
];

const KALAKAR_CREATORS = [
    'ScoopWhoop', 'Tech Burner', 'KK Creates', 'Nitin Joshi', 'Pink Villa',
    'Raj Shamani', 'Varun Mayya', 'Prakhar Gupta', 'BeerBiceps'
];

const KALAKAR_TEMPLATES = [
    { id: 'viral-anton', name: 'Alex Hormozi', sub: 'Partially customizable', preview: 'preview-anton', text: 'THIS CHANGED' },
    { id: 'neon-punch', name: 'Iman Gadzhi', sub: 'Fully customizable', preview: 'preview-neon', text: 'WAIT FOR IT' },
    { id: 'boxed-pill', name: 'Editing School', sub: 'Fully customizable', preview: 'preview-box', text: '3 STEPS ONLY' },
    { id: 'clean-reel', name: 'Ali Abdal', sub: 'Fully customizable', preview: 'preview-clean', text: "here's the secret" },
    { id: 'hook', name: 'Mr Beast', sub: 'Fully customizable', preview: 'preview-hook', text: 'NOBODY TELLS YOU' },
    { id: 'cta', name: 'Raj Shamani', sub: 'Fully customizable', preview: 'preview-neon', text: 'FOLLOW FOR PART 2' },
    { id: 'bubble', name: 'Mumbai', sub: 'Fully customizable', preview: 'preview-box', text: 'MUMBAI DIARIES' },
    { id: 'clean-reel', name: 'Devin Jatho', sub: 'Fully customizable', preview: 'preview-clean', text: 'what nobody says' },
    // Hinglish/Desi Viral Styles
    { id: 'hinglish-hook', name: 'Hinglish Hook', sub: 'Fully customizable', preview: 'preview-hinglish', text: 'Kal se nahi — aaj se 🔥' },
    { id: 'desi-reality', name: 'Desi Reality', sub: 'Fully customizable', preview: 'preview-desireality', text: 'Mujhe ye 2 saal pehle pata hota 🥺' },
    { id: 'game-changer', name: 'Game Changer', sub: 'Fully customizable', preview: 'preview-gamechanger', text: 'Game changer for creators 🚀' },
    { id: 'my-rules', name: 'My Rules', sub: 'Fully customizable', preview: 'preview-myrules', text: 'Meri duniya meri rules 😎' },
    { id: 'transformation', name: 'Transformation', sub: 'Fully customizable', preview: 'preview-transform', text: '1 year ago vs now. Started 🔥' },
    { id: 'comment-bait', name: 'Comment Bait', sub: 'Fully customizable', preview: 'preview-commentbait', text: "Comment 'AI' for tool list 👇" },
    // Viral Hook Styles
    { id: 'pov-reveal', name: 'POV Reveal', sub: 'Fully customizable', preview: 'preview-pov', text: 'POV: You finally figured it out' },
    { id: 'plot-twist', name: 'Plot Twist', sub: 'Fully customizable', preview: 'preview-plottwist', text: 'Plot twist: I am the main character' },
    { id: 'wait-for-it', name: 'Wait Till End', sub: 'Fully customizable', preview: 'preview-waitend', text: 'Wait for it... 😱' },
    { id: 'unbelievable', name: 'Unbelievable', sub: 'Fully customizable', preview: 'preview-unbelievable', text: 'You won\'t believe what happens next' },
    { id: 'secret-revealed', name: 'Secret Revealed', sub: 'Fully customizable', preview: 'preview-secret', text: 'Nobody tells you this...' },
    // Engagement Styles
    { id: 'save-worthy', name: 'Save Worthy', sub: 'Fully customizable', preview: 'preview-saveworthy', text: 'Save karo future ke liye 📌' },
    { id: 'tag-friend', name: 'Tag Friend', sub: 'Fully customizable', preview: 'preview-tagfriend', text: 'Tag karo us dost ko 😂' },
    { id: 'part-2', name: 'Part 2 Teaser', sub: 'Fully customizable', preview: 'preview-part2', text: 'Follow for Part 2 👀' },
    // Aesthetic Styles
    { id: 'clean-minimal', name: 'Clean Minimal', sub: 'Fully customizable', preview: 'preview-minimal', text: 'Less talk, more reels' },
    { id: 'main-character', name: 'Main Character', sub: 'Fully customizable', preview: 'preview-mainchar', text: 'Main character energy ✨' },
    { id: 'manifesting', name: 'Manifesting', sub: 'Fully customizable', preview: 'preview-manifesting', text: 'Manifesting this reality 🕯️' },
    { id: 'real-over-perfect', name: 'Real > Perfect', sub: 'Fully customizable', preview: 'preview-realperfect', text: 'Real > Perfect ✌️' }
];

(function renderLanding() {
    // Language chips
    const grid = document.getElementById('lang-grid');
    if (grid) {
        KALAKAR_LANGUAGES.forEach(([code, name, native]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'lang-chip';
            chip.dataset.lang = code;
            chip.innerHTML = `${name}<small>${native}</small>`;
            chip.onclick = () => { location.href = `/editor?lang=${code}`; };
            grid.appendChild(chip);
        });
    }

    // Creator logos
    const cRow = document.getElementById('creator-row');
    if (cRow) {
        KALAKAR_CREATORS.forEach(name => {
            const el = document.createElement('span');
            el.className = 'creator-logo';
            el.textContent = name;
            cRow.appendChild(el);
        });
    }

    // Template gallery
    const tGrid = document.getElementById('template-grid');
    if (tGrid) {
        KALAKAR_TEMPLATES.forEach(t => {
            const tile = document.createElement('a');
            tile.className = 'template-tile';
            tile.href = `/editor?preset=${t.id}`;
            tile.innerHTML = `<span class="template-preview ${t.preview}">${t.text}</span><h3>${t.name}</h3><small>${t.sub}</small>`;
            tGrid.appendChild(tile);
        });
    }

    // Audio compare widget
    function drawWave(id, noisy) {
        const c = document.getElementById(id);
        if (!c) return;
        const ctx = c.getContext('2d');
        const W = c.width, H = c.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = noisy ? '#ef4444' : '#10b981';
        const bars = 60;
        const bw = Math.floor(W / bars) - 1;
        for (let i = 0; i < bars; i++) {
            let v = Math.sin(i * 0.4) * 0.4 + 0.5;
            if (noisy) v += (Math.random() - 0.5) * 0.7;
            v = Math.max(0.08, Math.min(1, v));
            const h = v * (H - 8);
            ctx.fillRect(i * (bw + 1), (H - h) / 2, bw, h);
        }
    }
    drawWave('ac-raw', true);
    drawWave('ac-clean', false);

    // Pricing monthly/yearly toggle
    document.querySelectorAll('.bill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const yearly = btn.dataset.bill === 'yearly';
            document.querySelectorAll('.bill-amount').forEach(el => {
                el.textContent = yearly ? el.dataset.yearly : el.dataset.monthly;
            });
        });
    });
})();
