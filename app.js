(() => {
'use strict';

// ===== APP =====
let allAlbums = [];
let filteredAlbums = [];
const isMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
let currentView = localStorage.getItem('obi_view') || 'grid';
let viewSizeMode = localStorage.getItem('obi_size') || (isMobileUA ? 'mobile' : 'desktop');
let shuffleHistory = [];
let topPageHistory = [];
let pinnedAlbums = [];
let albumById = new Map();
let lazyImageObserver = null;
let lastFocusedBeforeModal = null;
let modalCurrentAlbum = null;
let modalNavAlbums = null;
let sortedAllAlbums = null;
// Edit modes are never persisted, so PC and phone behave identically:
//   ?edit=1    — everything at once (crop sliders + Spotify + note)
//   ?tune=1 / ?spotify=1 / ?note=1 — individual modes (legacy URLs, still work)
//   No URL: triple-tap the header counter or press E — toggles for this page
//   view only and resets on reload
const urlParams = new URLSearchParams(location.search);
let editMode = urlParams.has('edit');
let tuneMode = editMode || urlParams.has('tune');
let spotifyMode = editMode || urlParams.has('spotify');
let noteMode = editMode || urlParams.has('note');
let reviewMode = editMode || urlParams.has('review');
let tuneOverrides = {};
try { tuneOverrides = JSON.parse(localStorage.getItem('obi_tune') || '{}'); } catch { tuneOverrides = {}; }
let spotifyOverrides = {};
try { spotifyOverrides = JSON.parse(localStorage.getItem('obi_spotify') || '{}'); } catch { spotifyOverrides = {}; }
let noteOverrides = {};
try { noteOverrides = JSON.parse(localStorage.getItem('obi_note') || '{}'); } catch { noteOverrides = {}; }
let reviewOverrides = {};
try { reviewOverrides = JSON.parse(localStorage.getItem('obi_review') || '{}'); } catch { reviewOverrides = {}; }

const collectionContainer = document.getElementById('collectionContainer');
const loadingSpinner = document.getElementById('loadingSpinner');
const noResults = document.getElementById('noResults');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const randomBtn = document.getElementById('randomBtn');
const randomAlbumBtn = document.getElementById('randomAlbumBtn');
const alphabetSelect = document.getElementById('alphabetSelect');
const sortSelect = document.getElementById('sortSelect');
const homeLink = document.getElementById('homeLink');
const albumModal = document.getElementById('albumModal');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalBody = document.getElementById('modalBody');
const resultCount = document.getElementById('resultCount');
const totalCount = document.getElementById('totalCount');
const viewSizeToggle = document.getElementById('viewSizeToggle');
const statsBtn = document.getElementById('statsBtn');
const modalPrev = document.getElementById('modalPrev');
const modalNext = document.getElementById('modalNext');

document.addEventListener('DOMContentLoaded', () => {
    allAlbums = COLLECTION_DATA.albums;
    prepareAlbums();
    populateLabelFilter();
    // Restore saved view/size button active states
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === currentView));
    document.querySelectorAll('.size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === viewSizeMode));
    collectionContainer.className = `collection-container ${currentView === 'list' ? 'list-view' : ''} ${viewSizeMode === 'mobile' ? 'mobile-view' : ''}`.trim();
    const savedFilter = localStorage.getItem('obi_filter') || '';
    if (savedFilter) {
        alphabetSelect.value = savedFilter;
        applyAlphabetFilter();
    } else {
        const displayCount = viewSizeMode === 'mobile' ? 9 : allAlbums.length;
        filteredAlbums = getRandomAlbumsForTopPage(displayCount);
        applyViewSizeLimit();
        renderAlbums();
    }
    if (totalCount) totalCount.textContent = allAlbums.length;
    showLoading(false);
    setupEventListeners();
    if (editMode) {
        initEditPanel();
    } else {
        if (tuneMode) initTunePanel();
        if (spotifyMode) initSpotifyPanel();
        if (noteMode) initNotePanel();
        if (reviewMode) initReviewPanel();
    }
    if (spotifyMode) loadSpotifyCandidates();
    syncModePanelHeight();
    window.addEventListener('resize', syncModePanelHeight);
    const initialAlbumId = getAlbumIdFromHash();
    if (initialAlbumId) {
        const initialAlbum = albumById.get(initialAlbumId);
        if (initialAlbum) showAlbumModal(initialAlbum, false);
    }
});

// Measure the fixed bottom edit-mode panel so the mobile modal nav buttons can
// sit above it (see --mode-panel-h in style.css).
function syncModePanelHeight() {
    const panel = document.querySelector('.mode-panel');
    const h = panel ? panel.offsetHeight : 0;
    document.documentElement.style.setProperty('--mode-panel-h', `${h}px`);
}

function getAlbumIdFromHash() {
    const m = location.hash.match(/^#album=(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
}

function setupEventListeners() {
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(); });
    homeLink.addEventListener('click', () => localStorage.removeItem('obi_filter'));
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            localStorage.setItem('obi_view', currentView);
            collectionContainer.className = `collection-container ${currentView === 'list' ? 'list-view' : ''} ${viewSizeMode === 'mobile' ? 'mobile-view' : ''}`.trim();
        });
    });
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            viewSizeMode = btn.dataset.size;
            localStorage.setItem('obi_size', viewSizeMode);
            collectionContainer.classList.toggle('mobile-view', viewSizeMode === 'mobile');
            filteredAlbums = [...allAlbums];
            shuffleArray(filteredAlbums);
            applyViewSizeLimit();
            renderAlbums();
        });
    });
    randomBtn.addEventListener('click', () => {
        searchInput.value = '';
        if (alphabetSelect.value) {
            applyAlphabetFilter();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        alphabetSelect.value = '';
        sortSelect.value = 'artist-asc';
        const displayCount = viewSizeMode === 'mobile' ? 9 : allAlbums.length;
        const unpinnedPositions = [];
        for (let i = 0; i < displayCount; i++) {
            if (!pinnedAlbums.find(p => p.position === i)) unpinnedPositions.push(i);
        }
        const randomAlbums = getRandomAlbumsForTopPage(unpinnedPositions.length);
        const newFilteredAlbums = new Array(displayCount);
        pinnedAlbums.forEach(pinned => { if (pinned.position < displayCount) newFilteredAlbums[pinned.position] = pinned.album; });
        let ri = 0;
        unpinnedPositions.forEach(pos => { if (ri < randomAlbums.length) newFilteredAlbums[pos] = randomAlbums[ri++]; });
        filteredAlbums = newFilteredAlbums;
        applyViewSizeLimit();
        renderAlbums();
    });
    randomAlbumBtn.addEventListener('click', showRandomAlbum);
    if (statsBtn) statsBtn.addEventListener('click', showStatsModal);
    sortSelect.addEventListener('change', applyAlphabetFilter);
    alphabetSelect.addEventListener('change', applyAlphabetFilter);
    modalOverlay.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    modalPrev.addEventListener('click', () => navigateModal(-1));
    modalNext.addEventListener('click', () => navigateModal(1));
    albumModal.addEventListener('click', e => { if (e.target === albumModal) closeModal(); });
    collectionContainer.addEventListener('click', handleCollectionClick);
    collectionContainer.addEventListener('keydown', handleCardKeydown);
    const newArrivalsRow = document.getElementById('newArrivalsRow');
    if (newArrivalsRow) {
        newArrivalsRow.addEventListener('click', handleCollectionClick);
        newArrivalsRow.addEventListener('keydown', handleCardKeydown);
        // Registered unconditionally so the gesture-toggled edit mode works too;
        // the slider elements only exist while tune mode is on.
        newArrivalsRow.addEventListener('input', handleTuneInput);
    }
    collectionContainer.addEventListener('input', handleTuneInput);
    // Auto-apply pasted Spotify/note links without needing the 登録 button
    modalBody.addEventListener('paste', e => {
        const spotifyInput = e.target.closest('.spotify-input');
        const noteInput = e.target.closest('.note-input');
        if (!spotifyInput && !noteInput) return;
        setTimeout(() => {
            const album = albumById.get((spotifyInput || noteInput).dataset.albumId);
            if (!album) return;
            if (spotifyInput) applySpotifyInput(album);
            else applyNoteInput(album);
        }, 0);
    });
    // Hidden edit-mode switch: triple-tap the header counter (mobile) or press E
    const countChip = document.querySelector('.compact-count');
    if (countChip) {
        let taps = 0, tapTimer = null;
        countChip.addEventListener('click', () => {
            taps++;
            clearTimeout(tapTimer);
            tapTimer = setTimeout(() => { taps = 0; }, 600);
            if (taps >= 3) { taps = 0; setEditMode(!editMode); }
        });
    }
    modalBody.addEventListener('click', handleModalClick);
    window.addEventListener('hashchange', () => {
        const id = getAlbumIdFromHash();
        if (id) {
            const album = albumById.get(id);
            if (album) showAlbumModal(album, false);
        } else if (albumModal.classList.contains('active')) {
            closeModal(false);
        }
    });
}

function handleCollectionClick(e) {
    if (e.target.closest('.tune-slider')) return;
    const pinBtn = e.target.closest('.pin-btn');
    if (pinBtn) {
        e.stopPropagation();
        const album = albumById.get(pinBtn.dataset.albumId);
        const position = Number(pinBtn.dataset.position);
        if (album && Number.isInteger(position)) togglePin(album, position);
        return;
    }

    const card = e.target.closest('.album-card');
    if (!card) return;
    const album = albumById.get(card.dataset.albumId);
    if (album) showAlbumModal(album);
}

function handleCardKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.album-card');
    if (!card || e.target.closest('.pin-btn') || e.target.closest('.tune-slider')) return;
    e.preventDefault();
    const album = albumById.get(card.dataset.albumId);
    if (album) showAlbumModal(album);
}

function handleModalClick(e) {
    const tracklistToggle = e.target.closest('.tracklist-toggle');
    if (tracklistToggle) {
        const accordion = tracklistToggle.closest('.tracklist-accordion');
        accordion?.classList.toggle('open');
        // Reviews are fetched lazily the first time the accordion opens
        if (accordion?.classList.contains('open') && tracklistToggle.classList.contains('review-toggle')) {
            const body = accordion.querySelector('.review-body');
            const reviewAlbum = albumById.get(tracklistToggle.dataset.albumId);
            if (body && reviewAlbum && body.dataset.loaded === '0') loadReview(reviewAlbum, body);
        }
        return;
    }

    const relatedCard = e.target.closest('.related-card');
    if (relatedCard) {
        const related = albumById.get(relatedCard.dataset.relatedId);
        if (related) showAlbumModal(related);
        return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const album = albumById.get(actionBtn.dataset.albumId);
    const versionIndex = Number(actionBtn.dataset.versionIndex || 0);
    const version = album?.versions?.[versionIndex] || album?.versions?.[0] || {};
    if (!album) return;

    switch (actionBtn.dataset.action) {
        case 'copy-link':
            copyAlbumLink(actionBtn, album.id);
            break;
        case 'youtube':
            searchOnYouTube(album.artist, album.album);
            break;
        case 'spotify':
            searchOnSpotify(album.artist, album.album);
            break;
        case 'ask-ai':
            copyAIPrompt(actionBtn, album.artist, album.album, version.year, version.catalog || '', album.id);
            break;
        case 'note': {
            const noteUrl = albumNoteUrl(album);
            if (noteUrl) window.open(noteUrl, '_blank');
            break;
        }
        case 'note-apply':
            applyNoteInput(album);
            break;
        case 'note-remove':
            noteOverrides[album.id] = '';
            localStorage.setItem('obi_note', JSON.stringify(noteOverrides));
            updateNoteCount();
            showAlbumModal(album, false);
            break;
        case 'review-apply':
            applyReviewInput(album);
            break;
        case 'review-remove':
            reviewOverrides[album.id] = '';
            localStorage.setItem('obi_review', JSON.stringify(reviewOverrides));
            updateReviewCount();
            showAlbumModal(album, false);
            break;
        case 'discogs':
            searchOnDiscogs(album.artist, album.album);
            break;
        case 'whosampled':
            searchOnWhoSampled(album.artist);
            break;
        case 'genius':
            searchOnGenius(album.artist, album.album);
            break;
        case 'mercari':
            searchOnMercari(album.artist, album.album);
            break;
        case 'yahooauction':
            searchOnYahooAuction(album.artist, album.album);
            break;
        case 'spotify-apply':
            applySpotifyInput(album);
            break;
        case 'spotify-pick': {
            // Toggle candidate membership (multi-select supports 2-disc sets)
            const pickedId = actionBtn.dataset.spotifyId;
            if (/^[A-Za-z0-9]{22}$/.test(pickedId)) {
                const { ids } = albumSpotifyIds(album);
                const next = ids.includes(pickedId) ? ids.filter(x => x !== pickedId) : [...ids, pickedId];
                setSpotifyOverride(album, next);
            }
            break;
        }
        case 'spotify-none':
            setSpotifyOverride(album, 'none');
            break;
        case 'spotify-remove':
            setSpotifyOverride(album, '');
            break;
    }
}

function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    if (query === '') {
        alphabetSelect.value = '';
        sortSelect.value = 'artist-asc';
        filteredAlbums = [...allAlbums];
        shuffleArray(filteredAlbums);
        applyViewSizeLimit();
        renderAlbums();
    } else {
        alphabetSelect.value = '';
        sortSelect.value = 'artist-asc';
        const isYearSearch = /^\d{4}$/.test(query);
        if (isYearSearch) {
            const searchYear = parseInt(query);
            filteredAlbums = allAlbums.filter(album => album.versions.some(v => v.year === searchYear));
        } else {
            filteredAlbums = allAlbums.filter(album => album._searchText.includes(query));
        }
        filteredAlbums.sort(compareArtistThenYear);
        renderAlbums();
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getRandomAlbumsForTopPage(count) {
    if (topPageHistory.length >= allAlbums.length) topPageHistory = [];
    const unshown = allAlbums.filter(a => !topPageHistory.includes(a.id));
    if (unshown.length < count) {
        topPageHistory = [];
        const s = [...allAlbums];
        shuffleArray(s);
        s.slice(0, count).forEach(a => topPageHistory.push(a.id));
        return s.slice(0, count);
    }
    shuffleArray(unshown);
    const selected = unshown.slice(0, count);
    selected.forEach(a => topPageHistory.push(a.id));
    return selected;
}

function getSortName(artistName) {
    let name = artistName.trim().replace(/^(The|Tha)\s+/i, '');
    if (name === 'Snoop Doggy Dogg') name = 'Snoop Dogg';
    if (name === 'J Dilla') name = 'Jay Dee';
    return name;
}

function prepareAlbums() {
    albumById = new Map();
    allAlbums.forEach(album => {
        const firstVersion = album.versions[0] || {};
        album._sortName = getSortName(album.artist_sort || album.artist);
        album._sortKey = album._sortName.toLowerCase();
        album._initial = album._sortName.toUpperCase().charAt(0);
        album._albumKey = (album.album || '').toLowerCase();
        album._year = firstVersion.year || 9999;
        album._yearJP = firstVersion.yearJP || 9999;
        const tracklistText = (album.tracklist || []).join(' ');
        album._searchText = `${album.artist} ${album.album} ${tracklistText}`.toLowerCase();
        album._label = extractLabel(firstVersion.catalog);
        albumById.set(album.id, album);
    });
}

function extractLabel(catalog) {
    if (!catalog) return null;
    const m = String(catalog).trim().toUpperCase().match(/^([A-Z]{2,6})[-\s]?\d/);
    return m ? m[1] : null;
}

function populateLabelFilter() {
    const counts = new Map();
    allAlbums.forEach(a => { if (a._label) counts.set(a._label, (counts.get(a._label) || 0) + 1); });
    const labels = [...counts.entries()].filter(([, c]) => c >= 5).sort((a, b) => b[1] - a[1]);
    if (!labels.length) return;
    const group = document.createElement('optgroup');
    group.label = '── Labels ──';
    labels.forEach(([label, count]) => {
        const opt = document.createElement('option');
        opt.value = `label:${label}`;
        opt.textContent = `${label} (${count})`;
        group.appendChild(opt);
    });
    alphabetSelect.appendChild(group);
}

function compareArtistThenYear(a, b) {
    if (a._sortKey !== b._sortKey) return a._sortKey.localeCompare(b._sortKey);
    if (a._year !== b._year) return a._year - b._year;
    if (a._albumKey !== b._albumKey) return a._albumKey.localeCompare(b._albumKey);
    return a._yearJP - b._yearJP;
}

function compareAlbumTitle(a, b) {
    return a._albumKey.localeCompare(b._albumKey);
}

function compareYearThenAlbumTitle(a, b) {
    if (a._year !== b._year) return a._year - b._year;
    return a._albumKey.localeCompare(b._albumKey);
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function updateAlphaBar() {
    const bar = document.getElementById('alphaIndexBar');
    const inner = document.getElementById('alphaIndexInner');
    if (!bar || !inner) return;
    bar.style.display = '';
    if (!inner.children.length) {
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
            const btn = document.createElement('button');
            btn.className = 'alpha-btn';
            btn.textContent = letter;
            btn.dataset.letter = letter;
            btn.dataset.value = letter;
            btn.addEventListener('click', () => {
                alphabetSelect.value = (alphabetSelect.value === letter) ? '' : letter;
                sortSelect.value = 'artist-asc';
                applyAlphabetFilter();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            inner.appendChild(btn);
        });
        const hashBtn = document.createElement('button');
        hashBtn.className = 'alpha-btn';
        hashBtn.textContent = '#';
        hashBtn.dataset.letter = 'number';
        hashBtn.dataset.value = 'number';
        hashBtn.addEventListener('click', () => {
            alphabetSelect.value = (alphabetSelect.value === 'number') ? '' : 'number';
            sortSelect.value = 'artist-asc';
            applyAlphabetFilter();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        inner.appendChild(hashBtn);
        [['V.A.', 'compilation'], ['O.S.T.', 'soundtrack'], ['R&B', 'r&b'], ['SOUL & JAZZ', 'souljazz'], ['MIX', 'mix'], ['JAPANESE', 'japanese']].forEach(([label, value]) => {
            const btn = document.createElement('button');
            btn.className = 'alpha-btn';
            btn.textContent = label;
            btn.dataset.letter = value;
            btn.dataset.value = value;
            btn.addEventListener('click', () => {
                alphabetSelect.value = (alphabetSelect.value === value) ? '' : value;
                applyAlphabetFilter();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            inner.appendChild(btn);
        });
    }
    const presentLetters = new Set();
    allAlbums.forEach(album => {
        if (album._initial >= 'A' && album._initial <= 'Z') presentLetters.add(album._initial);
    });
    const activeLetter = alphabetSelect.value;
    inner.querySelectorAll('.alpha-btn').forEach(btn => {
        const letter = btn.dataset.letter;
        if (letter === '') {
            btn.classList.toggle('active', activeLetter === '');
            btn.disabled = false;
        } else if (letter === 'compilation' || letter === 'soundtrack' || letter === 'number' || letter === 'r&b' || letter === 'souljazz' || letter === 'mix' || letter === 'japanese') {
            btn.classList.toggle('active', letter === activeLetter);
            btn.disabled = false;
        } else {
            btn.disabled = !presentLetters.has(letter);
            btn.classList.toggle('active', letter === activeLetter);
        }
    });
}

function applyViewSizeLimit() {
    const alphabetFilter = alphabetSelect.value;
    const isTopPage = alphabetFilter === '';
    if (viewSizeToggle) viewSizeToggle.style.display = isTopPage ? 'flex' : 'none';
    if (isTopPage && viewSizeMode === 'mobile') filteredAlbums = filteredAlbums.slice(0, 9);
}

function applyAlphabetFilter() {
    localStorage.setItem('obi_filter', alphabetSelect.value);
    filteredAlbums = [...allAlbums];
    const alphabetFilter = alphabetSelect.value;
    if (alphabetFilter.startsWith('label:')) {
        const label = alphabetFilter.slice(6);
        filteredAlbums = filteredAlbums.filter(a => a._label === label);
        const sv = sortSelect.value;
        if (sv === 'year-asc') filteredAlbums.sort(compareYearThenAlbumTitle);
        else if (sv === 'year-desc') filteredAlbums.sort((a, b) => b._year !== a._year ? b._year - a._year : a._albumKey.localeCompare(b._albumKey));
        else filteredAlbums.sort(compareArtistThenYear);
    } else if (alphabetFilter === 'soundtrack') {
        filteredAlbums = filteredAlbums.filter(a => a.artist === 'O.S.T.');
        filteredAlbums.sort(compareYearThenAlbumTitle);
    } else if (alphabetFilter === 'compilation') {
        filteredAlbums = filteredAlbums.filter(a => a.artist === 'V.A.');
        const sv = sortSelect.value;
        if (sv === 'artist-asc') {
            filteredAlbums.sort(compareAlbumTitle);
        } else if (sv === 'year-desc') {
            filteredAlbums.sort((a, b) => b._year !== a._year ? b._year - a._year : a._albumKey.localeCompare(b._albumKey));
        } else {
            filteredAlbums.sort(compareYearThenAlbumTitle);
        }
    } else if (alphabetFilter === 'r&b') {
        filteredAlbums = filteredAlbums.filter(a => a.genre === 'r&b');
        filteredAlbums.sort(compareArtistThenYear);
    } else if (alphabetFilter === 'souljazz') {
        filteredAlbums = filteredAlbums.filter(a => a.genre === 'souljazz');
        filteredAlbums.sort(compareArtistThenYear);
    } else if (alphabetFilter === 'mix') {
        filteredAlbums = filteredAlbums.filter(a => a.genre === 'mix');
        filteredAlbums.sort(compareArtistThenYear);
    } else if (alphabetFilter === 'japanese') {
        filteredAlbums = filteredAlbums.filter(a => a.genre === 'japanese');
        filteredAlbums.sort(compareArtistThenYear);
    } else {
        const isDecade = ['1980s','1990s','2000s','2010s','2020s'].includes(alphabetFilter);
        if (isDecade) {
            const starts = {'1980s':1980,'1990s':1990,'2000s':2000,'2010s':2010,'2020s':2020};
            const ends = {'1980s':1990,'1990s':2000,'2000s':2010,'2010s':2020,'2020s':2030};
            filteredAlbums = filteredAlbums.filter(a => { const y = a.versions[0].year; return a.genre !== 'r&b' && a.genre !== 'souljazz' && a.genre !== 'mix' && a.genre !== 'japanese' && y >= starts[alphabetFilter] && y < ends[alphabetFilter]; });
            filteredAlbums.sort((a, b) => {
                if (a._year !== b._year) return a._year - b._year;
                return a._sortKey.localeCompare(b._sortKey);
            });
        } else if (alphabetFilter !== '') {
            if (alphabetFilter === 'number') {
                filteredAlbums = filteredAlbums.filter(a => a.genre !== 'r&b' && a.genre !== 'souljazz' && a.genre !== 'mix' && a.genre !== 'japanese' && /^[0-9]/.test(a._sortName));
            } else {
                filteredAlbums = filteredAlbums.filter(a => a.genre !== 'r&b' && a.genre !== 'souljazz' && a.genre !== 'mix' && a.genre !== 'japanese' && a._sortName !== "V.A." && a._sortName !== "O.S.T." && a._sortName.toUpperCase().startsWith(alphabetFilter));
            }
            filteredAlbums.sort(compareArtistThenYear);
        } else {
            applySorting();
        }
    }
    renderAlbums();
}

function applySorting() {
    const sortValue = sortSelect.value;
    const [sortBy, sortOrder] = sortValue.split('-');
    filteredAlbums.sort((a, b) => {
        if (sortBy === 'year') {
            if (a._year !== b._year) return sortOrder === 'asc' ? a._year - b._year : b._year - a._year;
            return a._sortKey.localeCompare(b._sortKey);
        } else {
            if (a._sortKey !== b._sortKey) return a._sortKey.localeCompare(b._sortKey);
            return a._year - b._year;
        }
    });
}

function renderAlbums() {
    collectionContainer.innerHTML = '';
    if (filteredAlbums.length === 0) { showNoResults(true); updateResultCount(0); renderNewArrivals(); return; }
    showNoResults(false);
    const isTopPage = !searchInput.value && !alphabetSelect.value && sortSelect.value === 'artist-asc' && viewSizeMode === 'mobile';
    const pinnedByPosition = new Map(pinnedAlbums.map(p => [p.position, p.album.id]));
    const fragment = document.createDocumentFragment();
    filteredAlbums.forEach((album, index) => {
        const isPinned = pinnedByPosition.get(index) === album.id;
        fragment.appendChild(createAlbumCard(album, isTopPage ? index : null, isPinned));
    });
    collectionContainer.appendChild(fragment);
    updateResultCount(filteredAlbums.length);
    renderNewArrivals();
    initLazyLoading();
    updateAlphaBar();
}

function renderNewArrivals() {
    const section = document.getElementById('newArrivalsSection');
    const row = document.getElementById('newArrivalsRow');
    if (!section || !row) return;
    const isTopPage = !searchInput.value.trim() && !alphabetSelect.value;
    const dated = allAlbums.filter(a => a.addedAt);
    if (!isTopPage || !dated.length) { section.style.display = 'none'; return; }
    dated.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || String(b.id).localeCompare(String(a.id)));
    row.innerHTML = '';
    const fragment = document.createDocumentFragment();
    dated.slice(0, 10).forEach(album => {
        const card = createAlbumCard(album);
        const badge = document.createElement('div');
        badge.className = 'added-date-badge';
        badge.textContent = album.addedAt;
        card.querySelector('.album-image-container')?.appendChild(badge);
        fragment.appendChild(card);
    });
    row.appendChild(fragment);
    section.style.display = '';
}

function createAlbumCard(album, index = null, isPinned = false) {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.dataset.albumId = album.id;
    card.dataset.sortArtist = getSortName(album.artist_sort || album.artist);
    const firstVersion = album.versions[0];
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${album.artist} - ${album.album}${firstVersion.year ? ` (${firstVersion.year})` : ''}`);
    if (index !== null) card.dataset.position = index;
    const versionCount = album.versions.length;
    const focus = albumFocus(album);
    card.innerHTML = `
        <div class="album-image-container">
            <img class="album-image lazy-load" data-src="${escapeHTML(firstVersion.image)}" alt="${escapeHTML(album.album)}" loading="lazy" decoding="async"${focus !== 50 ? ` style="object-position:${focus}% 50%"` : ''}>
            ${versionCount > 1 ? `<div class="version-badge">${versionCount} versions</div>` : ''}
            ${index !== null ? `<button class="pin-btn ${isPinned ? 'pinned' : ''}" data-album-id="${escapeHTML(album.id)}" data-position="${index}" title="${isPinned ? 'ピン留め解除' : 'ピン留め'}"><i class="fas fa-thumbtack"></i></button>` : ''}
            ${firstVersion.year ? `<div class="year-badge">${escapeHTML(String(firstVersion.year))}</div>` : ''}
            ${tuneMode ? `<div class="tune-slider"><input type="range" min="0" max="100" value="${focus}" data-album-id="${escapeHTML(album.id)}" aria-label="Crop position"></div>` : ''}
        </div>
        <div class="album-info">
            <div class="album-artist">${escapeHTML(album.artist)}</div>
            <div class="album-title">${escapeHTML(album.album)}</div>
            <div class="album-meta"><span class="album-year"><i class="fas fa-calendar"></i> ${escapeHTML(firstVersion.year)}</span><span class="album-catalog"><i class="fas fa-barcode"></i> ${escapeHTML(firstVersion.catalog)}</span></div>
        </div>`;
    return card;
}

function initLazyLoading() {
    const lazyImages = document.querySelectorAll('.lazy-load');
    if (!('IntersectionObserver' in window)) {
        lazyImages.forEach(img => loadLazyImage(img));
        return;
    }
    if (!lazyImageObserver) {
        lazyImageObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadLazyImage(entry.target);
                obs.unobserve(entry.target);
            }
        });
        }, { rootMargin: '200px 0px' });
    }
    lazyImages.forEach(img => lazyImageObserver.observe(img));
}

function loadLazyImage(img) {
    if (!img.dataset.src) return;
    img.src = img.dataset.src;
    img.classList.remove('lazy-load');
}

function showAlbumModal(album, updateHash = true, replaceHash = false) {
    let versionsHTML = '';
    album.versions.forEach((version, index) => {
        versionsHTML += `
            <div class="version-section ${index > 0 ? 'version-divider' : ''}">
                <div class="version-content">
                    <div class="version-image-wrapper">
                        <img src="${escapeHTML(version.image)}" alt="${escapeHTML(album.album)}" class="modal-album-image">
                    </div>
                    <div class="version-details">
                        ${version.catalog ? `<div class="detail-row"><span class="detail-label">Catalog No.</span><span class="detail-value">${escapeHTML(version.catalog)}</span></div>` : ''}
                        ${index === 0 && album.tracklist ? `<div class="tracklist-accordion"><button class="tracklist-toggle" type="button">Track List <i class="fas fa-chevron-down"></i></button><div class="tracklist-body">${renderTracklist(album.tracklist)}</div></div>` : ''}
                        ${version.yearJP ? `<div class="detail-row"><span class="detail-label">Japan Release</span><span class="detail-value">${escapeHTML(version.yearJP)}</span></div>` : ''}
                        ${version.note ? `<div class="detail-row"><span class="detail-label">Note</span><span class="detail-value">${escapeHTML(version.note)}</span></div>` : ''}
                    </div>
                    <div class="action-buttons action-buttons-all">
                        <button class="action-btn youtube" data-action="youtube" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fab fa-youtube"></i> YouTube</button>
                        <button class="action-btn spotify" data-action="spotify" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fab fa-spotify"></i> Spotify</button>
                        <button class="action-btn ask-ai" data-action="ask-ai" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-copy"></i> Ask AI</button>
                        <button class="action-btn discogs" data-action="discogs" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-record-vinyl"></i> Discogs</button>
                        <button class="action-btn whosampled" data-action="whosampled" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-headphones"></i> WhoSampled</button>
                        <button class="action-btn genius" data-action="genius" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-music"></i> Genius</button>
                        <button class="action-btn mercari" data-action="mercari" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-tag"></i> Mercari</button>
                        <button class="action-btn yahooauction" data-action="yahooauction" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-gavel"></i> Yahoo Auction</button>
                        ${albumNoteUrl(album) ? `<button class="action-btn note" data-action="note" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-newspaper"></i> note</button>` : ''}
                    </div>
                </div>
            </div>`;
    });
    modalBody.innerHTML = `
        <div class="modal-album-container">
            <div class="modal-album-header">
                <h2>${escapeHTML(album.artist)}</h2>
                <h3>${escapeHTML(album.album)}${album.versions[0].year ? `  (${escapeHTML(album.versions[0].year)})` : ''}</h3>
            </div>
            ${versionsHTML}
            ${reviewSectionHTML(album)}
            ${spotifyEmbedHTML(album)}
            ${reviewRegHTML(album)}
            ${noteRegHTML(album)}
            ${relatedAlbumsHTML(album)}
            <div class="modal-album-footer">
                <button class="share-link-btn" data-action="copy-link" data-album-id="${escapeHTML(album.id)}" title="このアルバムへのリンクをコピー"><i class="fas fa-link"></i> Copy Link</button>
            </div>
        </div>`;

    modalBody.querySelectorAll('.modal-album-image').forEach(img => {
        let pressTimer;
        img.addEventListener('touchstart', () => { img.dataset.longPress = 'false'; pressTimer = setTimeout(() => { img.dataset.longPress = 'true'; }, 500); });
        img.addEventListener('touchend', () => { clearTimeout(pressTimer); setTimeout(() => { img.dataset.longPress = 'false'; }, 100); });
        img.addEventListener('touchmove', () => clearTimeout(pressTimer));
        img.addEventListener('click', () => { if (img.dataset.longPress !== 'true') openImageViewer(img.src.replace('f_auto,q_auto,w_600', 'f_auto,q_100,w_2400')); });
    });
    modalCurrentAlbum = album;
    updateModalNav(album);
    openModalA11y();
    // Reset scroll position when switching albums within the open modal
    albumModal.scrollTop = 0;
    const modalContent = albumModal.querySelector('.modal-content');
    if (modalContent) modalContent.scrollTop = 0;
    if (updateHash && getAlbumIdFromHash() !== album.id) {
        const url = `#album=${encodeURIComponent(album.id)}`;
        if (replaceHash) history.replaceState(null, '', url);
        else history.pushState(null, '', url);
    }
}

function relatedAlbumsHTML(album) {
    if (album.artist === 'V.A.' || album.artist === 'O.S.T.') return '';
    const related = allAlbums
        .filter(a => a !== album && a._sortKey === album._sortKey)
        .sort(compareYearThenAlbumTitle);
    if (!related.length) return '';
    const cards = related.map(a => `
        <button class="related-card" data-related-id="${escapeHTML(a.id)}" title="${escapeHTML(a.album)}">
            <img src="${escapeHTML((a.versions[0].image || '').replace('w_600', 'w_200'))}" alt="${escapeHTML(a.album)}" loading="lazy" decoding="async"${albumFocus(a) !== 50 ? ` style="object-position:${albumFocus(a)}% 50%"` : ''}>
            <span class="related-name">${escapeHTML(a.album)}</span>
            ${a._year !== 9999 ? `<span class="related-year">${a._year}</span>` : ''}
        </button>`).join('');
    return `
        <div class="related-albums">
            <h4 class="related-title">More from ${escapeHTML(album._sortName)}</h4>
            <div class="related-row">${cards}</div>
        </div>`;
}

function updateModalNav(album) {
    const visible = (filteredAlbums || []).filter(Boolean);
    if (visible.includes(album)) {
        modalNavAlbums = visible;
    } else {
        if (!sortedAllAlbums) sortedAllAlbums = [...allAlbums].sort(compareArtistThenYear);
        modalNavAlbums = sortedAllAlbums;
    }
    const idx = modalNavAlbums.indexOf(album);
    const show = idx !== -1 && modalNavAlbums.length > 1;
    modalPrev.style.display = show ? '' : 'none';
    modalNext.style.display = show ? '' : 'none';
    if (!show) { modalNavAlbums = null; return; }
    modalPrev.disabled = idx === 0;
    modalNext.disabled = idx === modalNavAlbums.length - 1;
}

function navigateModal(delta) {
    if (!modalNavAlbums || !modalCurrentAlbum) return;
    const idx = modalNavAlbums.indexOf(modalCurrentAlbum);
    if (idx === -1) return;
    const next = modalNavAlbums[idx + delta];
    if (next) showAlbumModal(next, true, true);
}

function openModalA11y() {
    if (!albumModal.classList.contains('active')) {
        lastFocusedBeforeModal = document.activeElement;
    }
    albumModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
}

function closeModal(updateHash = true) {
    albumModal.classList.remove('active');
    modalCurrentAlbum = null;
    modalNavAlbums = null;
    document.body.style.overflow = 'auto';
    if (updateHash && getAlbumIdFromHash()) {
        history.pushState(null, '', location.pathname + location.search);
    }
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
        lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
}

function albumSlug(albumId) {
    // Must match slugify() in build_static.py
    return albumId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function albumStaticUrl(albumId) {
    const baseDir = location.pathname.replace(/[^/]*$/, '');
    return `${location.origin}${baseDir}albums/${albumSlug(albumId)}.html`;
}

function copyAlbumLink(btn, albumId) {
    // Copy the static page URL so X / social shares render an OBI-image preview (OGP)
    navigator.clipboard.writeText(albumStaticUrl(albumId)).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fas fa-link"></i> Copy Link';
        }, 2000);
    });
}

function copyAIPrompt(btn, artist, albumTitle, year, catalog, albumId) {
    const albumData = albumId ? albumById.get(albumId) : null;
    const tracklist = albumData && albumData.tracklist ? albumData.tracklist : null;
    const tracklistText = tracklist ? '\n' + tracklist.join('\n') : '';
    const prompt = `このアルバムについて、The SourceのRecord Reportやblast誌のディスクレビューのような、音楽雑誌のアルバム評を日本語で書いてください。百科事典的な情報の羅列ではなく、書き手の視点が一本通った批評文にすること。\nマークダウンテーブルは絶対に使わないでください。見出しは##（大セクション）・###（小セクション）を使ってください。\n先頭に字下げ（インデント）を入れないこと。すべて左揃えで出力すること。\n\n【批評本文の書き方】\n- このアルバム固有の切り口（問い・テーマ）を1つ立て、サブタイトルから結びまでそれを貫くこと\n- 書き出しの1文で読者を掴むこと。「本作は〜年にリリースされた」のような背景説明から始めないこと\n- 批評本文は見出しを付けない3〜5段落・800〜1200字程度とすること\n- 批評本文では断定してよい。書き手としての見立てを最低1箇所は言い切ること。ただし事実として確認できない事柄は断定しないこと\n- プロデューサー・客演・サンプリングには本文の流れの中で自然に触れること（箇条書きでの列挙はしない）\n- 結びの段落で、このアルバムが今聴かれるべき理由を一言で言い切ること\n\n各曲のプロデューサー・ゲスト情報は、Discogs・WhoSampled・AllMusic・Wikipediaなど複数のソースを検索して可能な限り正確に埋めること。時間がかかっても構わないので、不明のまま放置しないこと。\n\nパンチラインの紹介は一切しないこと。フック（サビ）の歌詞はGeniusの楽曲ページで[Chorus:]と表記されている部分のみを掲載する。Geniusに歌詞が登録されていない曲、または[Chorus:]の表記がない曲はフックの項目を省略する。掲載する場合はフック全文と日本語訳を載せる。\n\nサウンドトラック作品の場合、監督名は記載しないこと。\n\n「クリスプ」「シルキー」「シミリー」「BAR」など日本語のヒップホップシーンで一般的でない英語カタカナ表現は使わないこと。「サイファー」など日本のヒップホップシーンに定着している言葉は使って構わない。\n\n英語圏の音楽批評で使われるスラングや専門用語をそのままカタカナにした表現は使わないこと。「モブスタイル」「ギャングスタ」のような、日本の一般読者に意味が伝わりにくい表現は、具体的な日本語で言い換えること。\n\nWikipedia・Albumism・AllMusicなどの出典名は本文中に記載しないこと。\n\nサンプリングネタを言及する場合は「アーティスト名の「曲名」」という形式で統一すること（例：Brother to Brotherの「The Affair」をサンプリングした）。\n\nアーティストの本名を括弧書きで添えないこと（例：「Illa J（本名John Yancey）」のような表記は不要）。\n\n英語の直訳的・翻訳調の言い回しを避け、自然な日本語で書くこと。\n\n文体は落ち着いた批評の文体で統一すること。熱を込めてよいが、「最強の年」「圧巻」「ノリノリ」など俗な煽り表現・口語表現は使わないこと。\n\n日本語の一般読者に馴染みのないカタカナ学術用語・批評用語は使わないこと。「ユーロセントリック」「ダイアスポラ」「ヘゲモニー」「ポストコロニアル」「インタポレート」など、音楽に詳しくない日本語話者に意味が伝わらない用語は平易な日本語に言い換えること。\n\n出力の冒頭は「アーティスト名『アルバムタイトル』——日本語サブタイトル」の構成で始めること（例：「50 Cent『Before I Self Destruct』——街に戻った男の剥き出しの自画像」）。ダッシュは全角ダッシュ2つ（——）を使うこと。サブタイトルは読者がnoteで読みたくなるような日本語にすること。\n\n出力は次の順で構成すること：\n1. 冒頭タイトル行\n2. 批評本文（見出しなし）\n3. ## Recommended\n4. ## 収録曲ガイド\n5. ## 参考\n\n## Recommended\n特に聴くべき3曲を「- 曲名 — 一言コメント」の形式で列挙すること。\n\n## 収録曲ガイド\n各曲を必ず以下のフォーマットで記載し、各曲の間には必ず横棒（---）を入れること。\n曲名・プロデューサー・ゲスト・解説・フックはそれぞれ必ず改行で区切ること。\n本文はすべて一文ごとに改行すること。複数の文を続けて書かないこと。\nゲストアーティストがいない曲は「〇〇独演」などと書かず、ゲストの行自体を省略すること。\n曲名に「(feat. 〇〇)」「(featuring 〇〇)」の表記は含めないこと。ゲスト情報はゲスト欄に記載する。\n\n### 1. 曲名\nプロデューサー：\nxxx\nゲスト：\nxxx（いない場合は省略）\nトラック解説文\nフック："英語歌詞"\n（日本語訳）（フックがない曲は省略）\n\n---\n\n## 参考\n実際に参照した可能性が高いソースのみ箇条書きで列挙すること。URLは不要。関係のないソースは省く。\n例：\n- Discogs\n- AllMusic\n- Genius\n- Wikipedia\n\nアーティスト：${artist}\nアルバム：${albumTitle}\nリリース：${year}\nレーベル：\nカタログ番号：${catalog}\n収録曲：${tracklistText}`;
    navigator.clipboard.writeText(prompt).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fas fa-check"></i> プロンプトをコピーしました';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fas fa-copy"></i> Ask AI';
        }, 2000);
    });
}

// ── Spotify embed & registration mode (?spotify=1) ───────────────────────────
// spotify_candidates.js is ~650KB, so it is only loaded when an edit mode is
// active — normal visitors never download it.
function loadSpotifyCandidates() {
    if (typeof SPOTIFY_CANDIDATES !== 'undefined' || document.getElementById('spotifyCandidatesScript')) return;
    const script = document.createElement('script');
    script.id = 'spotifyCandidatesScript';
    script.src = 'spotify_candidates.js';
    script.onload = () => {
        // Refresh the open modal so freshly loaded candidates appear
        if (modalCurrentAlbum && albumModal.classList.contains('active')) {
            showAlbumModal(modalCurrentAlbum, false);
        }
    };
    document.head.appendChild(script);
}

// spotifyId can be a 22-char id, an array of ids (multi-disc sets that Spotify
// splits into separate albums), or "none" (checked — not on Spotify).
function albumSpotifyIds(album) {
    const v = spotifyOverrides[album.id] !== undefined ? spotifyOverrides[album.id] : album.spotifyId;
    if (v === 'none') return { ids: [], none: true };
    const arr = Array.isArray(v) ? v : (typeof v === 'string' ? [v] : []);
    return { ids: arr.filter(x => typeof x === 'string' && /^[A-Za-z0-9]{22}$/.test(x)), none: false };
}

function setSpotifyOverride(album, value) {
    if (Array.isArray(value)) {
        value = value.length === 0 ? '' : value.length === 1 ? value[0] : value;
    }
    spotifyOverrides[album.id] = value;
    localStorage.setItem('obi_spotify', JSON.stringify(spotifyOverrides));
    updateSpotifyCount();
    showAlbumModal(album, false);
}

function extractSpotifyAlbumId(text) {
    if (!text) return null;
    const t = text.trim();
    const m = t.match(/album[/:]([A-Za-z0-9]{22})/);
    if (m) return m[1];
    return /^[A-Za-z0-9]{22}$/.test(t) ? t : null;
}

function spotifyEmbedHTML(album) {
    const { ids, none } = albumSpotifyIds(album);
    const players = ids.map(id => `
        <div class="spotify-embed">
            <iframe src="https://open.spotify.com/embed/album/${escapeHTML(id)}" width="100%" height="352" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Spotify player"></iframe>
        </div>`).join('');
    if (!spotifyMode) return players;
    const state = none
        ? '<span class="spotify-reg-state none">Spotifyになし（確認済み）</span>'
        : ids.length
            ? `<span class="spotify-reg-state ok">登録済み${ids.length > 1 ? `（${ids.length}件）` : ''}</span>`
            : '<span class="spotify-reg-state">未登録</span>';
    return `
        ${players}
        <div class="spotify-reg">
            <div class="spotify-reg-title"><i class="fab fa-spotify"></i> Spotify埋め込み登録 ${state}</div>
            ${spotifyCandidatesHTML(album, ids)}
            <div class="spotify-reg-row">
                <input type="text" class="spotify-input" placeholder="SpotifyアルバムのURLを貼り付け" data-album-id="${escapeHTML(album.id)}">
                <button class="spotify-reg-btn" data-action="spotify-apply" data-album-id="${escapeHTML(album.id)}">登録</button>
                ${!none && !ids.length ? `<button class="spotify-reg-btn none-btn" data-action="spotify-none" data-album-id="${escapeHTML(album.id)}">なし</button>` : ''}
                ${(none || ids.length) ? `<button class="spotify-reg-btn remove" data-action="spotify-remove" data-album-id="${escapeHTML(album.id)}">解除</button>` : ''}
            </div>
            <div class="spotify-reg-hint">候補をクリックで選択、もう一度クリックで外す（複数選択可＝2枚組対応）。Spotifyに存在しない盤は「なし」で確認済みとして記録</div>
        </div>`;
}

function spotifyCandidatesHTML(album, selectedIds) {
    const cands = (typeof SPOTIFY_CANDIDATES !== 'undefined' && SPOTIFY_CANDIDATES[album.id]) || [];
    if (!cands.length) return '';
    const rows = cands.map(c => {
        const selected = selectedIds.includes(c.id);
        return `
        <div class="spotify-cand${selected ? ' selected' : ''}">
            <button class="spotify-cand-pick" data-action="spotify-pick" data-album-id="${escapeHTML(album.id)}" data-spotify-id="${escapeHTML(c.id)}">
                ${c.image ? `<img src="${escapeHTML(c.image)}" alt="" loading="lazy" decoding="async">` : '<span class="spotify-cand-noimg"><i class="fas fa-compact-disc"></i></span>'}
                <span class="spotify-cand-info">
                    <span class="spotify-cand-name">${escapeHTML(c.name)}</span>
                    <span class="spotify-cand-meta">${escapeHTML(c.artist)}${c.year ? ` · ${escapeHTML(c.year)}` : ''}${c.tracks ? ` · ${escapeHTML(String(c.tracks))}曲` : ''}</span>
                </span>
                ${selected ? '<i class="fas fa-check spotify-cand-check"></i>' : ''}
            </button>
            <a class="spotify-cand-open" href="https://open.spotify.com/album/${escapeHTML(c.id)}" target="_blank" rel="noopener" title="Spotifyで確認"><i class="fas fa-external-link-alt"></i></a>
        </div>`;
    }).join('');
    return `<div class="spotify-cands">${rows}</div>`;
}

function applySpotifyInput(album) {
    const input = modalBody.querySelector('.spotify-input');
    const id = extractSpotifyAlbumId(input ? input.value : '');
    if (!id) {
        if (input) {
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 1500);
        }
        return;
    }
    const { ids } = albumSpotifyIds(album);
    if (!ids.includes(id)) setSpotifyOverride(album, [...ids, id]);
    else showAlbumModal(album, false);
}

function initSpotifyPanel() {
    const panel = document.createElement('div');
    panel.id = 'spotifyPanel';
    panel.className = 'mode-panel';
    panel.innerHTML = `
        <span class="tune-panel-label"><i class="fab fa-spotify"></i> Spotify登録モード — <b id="spotifyCount">0</b>件</span>
        <button class="tune-panel-btn" id="spotifyExport"><i class="fas fa-copy"></i> Export JSON</button>
        <button class="tune-panel-btn" id="spotifyClear"><i class="fas fa-trash"></i> Clear</button>`;
    document.body.appendChild(panel);
    document.getElementById('spotifyExport').addEventListener('click', () => {
        const btn = document.getElementById('spotifyExport');
        navigator.clipboard.writeText(JSON.stringify(spotifyOverrides, null, 2)).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Export JSON'; }, 2000);
        });
    });
    document.getElementById('spotifyClear').addEventListener('click', () => {
        if (!confirm('Spotify登録データをすべて消去しますか？')) return;
        spotifyOverrides = {};
        localStorage.removeItem('obi_spotify');
        updateSpotifyCount();
    });
    updateSpotifyCount();
}

function updateSpotifyCount() {
    const count = document.getElementById('spotifyCount');
    if (count) count.textContent = Object.keys(spotifyOverrides).length;
}

// ── On-site reviews (reviews/<slug>.md + ?review=1 registration) ─────────────
function albumHasPublishedReview(album) {
    return typeof REVIEWS_INDEX !== 'undefined' && REVIEWS_INDEX.includes(album.id);
}

function albumReviewDraft(album) {
    const v = reviewOverrides[album.id];
    return (typeof v === 'string' && v.trim()) ? v : null;
}

function reviewSectionHTML(album) {
    const draft = albumReviewDraft(album);
    if (!draft && !albumHasPublishedReview(album)) return '';
    return `
        <div class="tracklist-accordion review-accordion">
            <button class="tracklist-toggle review-toggle" type="button" data-album-id="${escapeHTML(album.id)}">Review${draft ? '（下書きプレビュー）' : ''} <i class="fas fa-chevron-down"></i></button>
            <div class="tracklist-body review-body" data-loaded="0"></div>
        </div>`;
}

function loadReview(album, body) {
    body.dataset.loaded = '1';
    const draft = albumReviewDraft(album);
    if (draft) {
        body.innerHTML = renderMarkdown(draft);
        return;
    }
    body.innerHTML = '<p class="review-loading">Loading...</p>';
    fetch(`reviews/${albumSlug(album.id)}.md`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(md => { body.innerHTML = renderMarkdown(md); })
        .catch(() => {
            body.innerHTML = '<p class="review-loading">レビューを読み込めませんでした</p>';
            body.dataset.loaded = '0';
        });
}

// Minimal markdown renderer for the Ask AI review format:
// #-#### headings, --- rules, - lists, **bold**, blank-line paragraphs
function renderMarkdown(md) {
    const inline = s => escapeHTML(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    let html = '';
    let para = [];
    let list = null;
    const flushPara = () => { if (para.length) { html += `<p>${para.join('<br>')}</p>`; para = []; } };
    const flushList = () => { if (list) { html += `<ul>${list.join('')}</ul>`; list = null; } };
    md.replace(/\r\n/g, '\n').split('\n').forEach(raw => {
        const t = raw.trim();
        if (!t) { flushPara(); flushList(); return; }
        const heading = t.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            flushPara(); flushList();
            const level = Math.min(heading[1].length + 2, 6);
            html += `<h${level} class="review-h${heading[1].length}">${inline(heading[2])}</h${level}>`;
            return;
        }
        if (/^(-{3,}|\*{3,})$/.test(t)) { flushPara(); flushList(); html += '<hr>'; return; }
        const item = t.match(/^[-*]\s+(.*)$/);
        if (item) { flushPara(); if (!list) list = []; list.push(`<li>${inline(item[1])}</li>`); return; }
        flushList();
        para.push(inline(t));
    });
    flushPara();
    flushList();
    return html;
}

function reviewRegHTML(album) {
    if (!reviewMode) return '';
    const draft = albumReviewDraft(album);
    const removed = reviewOverrides[album.id] === '';
    const published = albumHasPublishedReview(album);
    const state = draft
        ? '<span class="review-reg-state draft">下書きあり（未反映）</span>'
        : removed
            ? '<span class="review-reg-state removed">削除予定</span>'
            : published
                ? '<span class="review-reg-state ok">公開済み</span>'
                : '<span class="review-reg-state">未登録</span>';
    return `
        <div class="review-reg">
            <div class="review-reg-title"><i class="fas fa-file-alt"></i> Review登録 ${state}</div>
            <textarea class="review-input" data-album-id="${escapeHTML(album.id)}" placeholder="Ask AIで生成したレビュー（Markdown）をここに貼り付け" rows="6">${draft ? escapeHTML(draft) : ''}</textarea>
            <div class="review-reg-row">
                <button class="review-reg-btn" data-action="review-apply" data-album-id="${escapeHTML(album.id)}">保存</button>
                ${(draft || published) ? `<button class="review-reg-btn remove" data-action="review-remove" data-album-id="${escapeHTML(album.id)}">削除</button>` : ''}
            </div>
            <div class="review-reg-hint">保存すると上のReviewアコーディオンで即プレビューできる。Export → merge後に全訪問者へ公開＆静的ページにも掲載</div>
        </div>`;
}

function applyReviewInput(album) {
    const input = modalBody.querySelector('.review-input');
    const text = (input ? input.value : '').trim();
    if (!text) {
        if (input) {
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 1500);
        }
        return;
    }
    reviewOverrides[album.id] = text;
    localStorage.setItem('obi_review', JSON.stringify(reviewOverrides));
    updateReviewCount();
    showAlbumModal(album, false);
}

function initReviewPanel() {
    const panel = document.createElement('div');
    panel.id = 'reviewPanel';
    panel.className = 'mode-panel';
    panel.innerHTML = `
        <span class="tune-panel-label"><i class="fas fa-file-alt"></i> Review登録モード — <b id="reviewCount">0</b>件</span>
        <button class="tune-panel-btn" id="reviewExport"><i class="fas fa-copy"></i> Export JSON</button>
        <button class="tune-panel-btn" id="reviewClear"><i class="fas fa-trash"></i> Clear</button>`;
    document.body.appendChild(panel);
    document.getElementById('reviewExport').addEventListener('click', () => {
        const btn = document.getElementById('reviewExport');
        navigator.clipboard.writeText(JSON.stringify(reviewOverrides, null, 2)).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Export JSON'; }, 2000);
        });
    });
    document.getElementById('reviewClear').addEventListener('click', () => {
        if (!confirm('Review下書きをすべて消去しますか？')) return;
        reviewOverrides = {};
        localStorage.removeItem('obi_review');
        updateReviewCount();
    });
    updateReviewCount();
}

function updateReviewCount() {
    const count = document.getElementById('reviewCount');
    if (count) count.textContent = Object.keys(reviewOverrides).length;
}

// ── note article registration mode (?note=1) ─────────────────────────────────
function albumNoteUrl(album) {
    const v = noteOverrides[album.id] !== undefined ? noteOverrides[album.id] : album.note_url;
    return (typeof v === 'string' && /^https:\/\/note\.com\/\S+$/.test(v)) ? v : null;
}

function noteRegHTML(album) {
    if (!noteMode) return '';
    const url = albumNoteUrl(album);
    return `
        <div class="note-reg">
            <div class="note-reg-title"><i class="fas fa-newspaper"></i> note記事登録 <span class="note-reg-state${url ? ' ok' : ''}">${url ? '登録済み' : '未登録'}</span></div>
            ${url ? `<a class="note-reg-current" href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>` : ''}
            <div class="note-reg-row">
                <input type="text" class="note-input" placeholder="note記事のURLを貼り付け（https://note.com/...）" data-album-id="${escapeHTML(album.id)}">
                <button class="note-reg-btn" data-action="note-apply" data-album-id="${escapeHTML(album.id)}">登録</button>
                ${url ? `<button class="note-reg-btn remove" data-action="note-remove" data-album-id="${escapeHTML(album.id)}">解除</button>` : ''}
            </div>
            <div class="note-reg-hint">Ask AIで記事を生成 → noteに投稿 → 記事URLをここに貼る</div>
        </div>`;
}

function applyNoteInput(album) {
    const input = modalBody.querySelector('.note-input');
    const url = (input ? input.value : '').trim();
    if (!/^https:\/\/note\.com\/\S+$/.test(url)) {
        if (input) {
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 1500);
        }
        return;
    }
    noteOverrides[album.id] = url;
    localStorage.setItem('obi_note', JSON.stringify(noteOverrides));
    updateNoteCount();
    showAlbumModal(album, false);
}

function initNotePanel() {
    const panel = document.createElement('div');
    panel.id = 'notePanel';
    panel.className = 'mode-panel';
    panel.innerHTML = `
        <span class="tune-panel-label"><i class="fas fa-newspaper"></i> note記事登録モード — <b id="noteCount">0</b>件</span>
        <button class="tune-panel-btn" id="noteExport"><i class="fas fa-copy"></i> Export JSON</button>
        <button class="tune-panel-btn" id="noteClear"><i class="fas fa-trash"></i> Clear</button>`;
    document.body.appendChild(panel);
    document.getElementById('noteExport').addEventListener('click', () => {
        const btn = document.getElementById('noteExport');
        navigator.clipboard.writeText(JSON.stringify(noteOverrides, null, 2)).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Export JSON'; }, 2000);
        });
    });
    document.getElementById('noteClear').addEventListener('click', () => {
        if (!confirm('note登録データをすべて消去しますか？')) return;
        noteOverrides = {};
        localStorage.removeItem('obi_note');
        updateNoteCount();
    });
    updateNoteCount();
}

function updateNoteCount() {
    const count = document.getElementById('noteCount');
    if (count) count.textContent = Object.keys(noteOverrides).length;
}

// ── Unified edit mode (?edit=1) ──────────────────────────────────────────────
function setEditMode(on) {
    if (on === editMode) return;
    editMode = on;
    tuneMode = spotifyMode = noteMode = reviewMode = on;
    const panel = document.getElementById('editPanel');
    if (on) {
        if (!panel) initEditPanel();
        loadSpotifyCandidates();
    } else if (panel) {
        panel.remove();
    }
    renderAlbums();
    // Refresh the open modal so the registration boxes appear/disappear
    if (modalCurrentAlbum && albumModal.classList.contains('active')) {
        showAlbumModal(modalCurrentAlbum, false);
    }
    syncModePanelHeight();
}

function initEditPanel() {
    const panel = document.createElement('div');
    panel.id = 'editPanel';
    panel.className = 'mode-panel';
    panel.innerHTML = `
        <span class="tune-panel-label"><i class="fas fa-pen"></i> 編集モード —
            Focus <b id="tuneCount">0</b> ·
            Spotify <b id="spotifyCount">0</b> ·
            note <b id="noteCount">0</b> ·
            Review <b id="reviewCount">0</b></span>
        <button class="tune-panel-btn" id="editExport"><i class="fas fa-copy"></i> Export JSON</button>
        <button class="tune-panel-btn" id="editClear"><i class="fas fa-trash"></i> Clear</button>`;
    document.body.appendChild(panel);
    document.getElementById('editExport').addEventListener('click', () => {
        const btn = document.getElementById('editExport');
        const payload = { focus: tuneOverrides, spotify: spotifyOverrides, note: noteOverrides, review: reviewOverrides };
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Export JSON'; }, 2000);
        });
    });
    document.getElementById('editClear').addEventListener('click', () => {
        if (!confirm('編集データ（Focus・Spotify・note・Review）をすべて消去しますか？')) return;
        tuneOverrides = {};
        spotifyOverrides = {};
        noteOverrides = {};
        reviewOverrides = {};
        localStorage.removeItem('obi_tune');
        localStorage.removeItem('obi_spotify');
        localStorage.removeItem('obi_note');
        localStorage.removeItem('obi_review');
        updateTuneCount();
        updateSpotifyCount();
        updateNoteCount();
        updateReviewCount();
        renderAlbums();
    });
    updateTuneCount();
    updateSpotifyCount();
    updateNoteCount();
    updateReviewCount();
}

// ── Focus-tune mode (?tune=1) ────────────────────────────────────────────────
function albumFocus(album) {
    const v = tuneOverrides[album.id] !== undefined ? tuneOverrides[album.id] : album.focus;
    return (typeof v === 'number' && v >= 0 && v <= 100) ? v : 50;
}

function handleTuneInput(e) {
    const input = e.target.closest('.tune-slider input');
    if (!input) return;
    const value = Number(input.value);
    tuneOverrides[input.dataset.albumId] = value;
    localStorage.setItem('obi_tune', JSON.stringify(tuneOverrides));
    const img = input.closest('.album-image-container')?.querySelector('.album-image');
    if (img) img.style.objectPosition = `${value}% 50%`;
    updateTuneCount();
}

function initTunePanel() {
    const panel = document.createElement('div');
    panel.id = 'tunePanel';
    panel.className = 'mode-panel';
    panel.innerHTML = `
        <span class="tune-panel-label"><i class="fas fa-crop-alt"></i> Focus調整モード — <b id="tuneCount">0</b>件</span>
        <button class="tune-panel-btn" id="tuneExport"><i class="fas fa-copy"></i> Export JSON</button>
        <button class="tune-panel-btn" id="tuneClear"><i class="fas fa-trash"></i> Clear</button>`;
    document.body.appendChild(panel);
    document.getElementById('tuneExport').addEventListener('click', () => {
        const btn = document.getElementById('tuneExport');
        navigator.clipboard.writeText(JSON.stringify(tuneOverrides, null, 2)).then(() => {
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Export JSON'; }, 2000);
        });
    });
    document.getElementById('tuneClear').addEventListener('click', () => {
        if (!confirm('調整データをすべて消去しますか？')) return;
        tuneOverrides = {};
        localStorage.removeItem('obi_tune');
        updateTuneCount();
        renderAlbums();
    });
    updateTuneCount();
}

function updateTuneCount() {
    const count = document.getElementById('tuneCount');
    if (count) count.textContent = Object.keys(tuneOverrides).length;
}

function togglePin(album, position) {
    const existingPinIndex = pinnedAlbums.findIndex(p => p.position === position);
    if (existingPinIndex >= 0) pinnedAlbums.splice(existingPinIndex, 1);
    else pinnedAlbums.push({ album, position });
    renderAlbums();
}

function showRandomAlbum() {
    if (!allAlbums.length) return;
    if (shuffleHistory.length >= allAlbums.length) shuffleHistory = [];
    const unshown = allAlbums.filter(a => !shuffleHistory.includes(a.id));
    const random = unshown[Math.floor(Math.random() * unshown.length)];
    shuffleHistory.push(random.id);
    showAlbumModal(random);
}

// ── Stats dashboard ──────────────────────────────────────────────────────────
function statsBarRows(entries, total) {
    const max = entries.length ? Math.max(...entries.map(([, c]) => c)) : 1;
    return entries.map(([label, count]) => `
        <div class="stats-bar-row">
            <span class="stats-bar-label">${escapeHTML(label)}</span>
            <span class="stats-bar-track"><span class="stats-bar-fill" style="width:${Math.max(2, Math.round(count / max * 100))}%"></span></span>
            <span class="stats-bar-count">${count}</span>
        </div>`).join('');
}

function showStatsModal() {
    let versionCount = 0;
    let tracklistCount = 0;
    const decadeCounts = new Map();
    const labelCounts = new Map();
    const genreCounts = new Map();
    const gapCounts = new Map([['Same year', 0], ['+1 year', 0], ['+2–3 years', 0], ['+4–9 years', 0], ['+10 years (reissue)', 0]]);
    let gapTotal = 0, gapSum = 0;

    allAlbums.forEach(album => {
        versionCount += album.versions.length;
        if (album.tracklist) tracklistCount++;
        const y = album._year !== 9999 ? album._year : null;
        if (y) {
            const decade = `${Math.floor(y / 10) * 10}s`;
            decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
        }
        if (album._label) labelCounts.set(album._label, (labelCounts.get(album._label) || 0) + 1);
        let cat;
        if (album.artist === 'V.A.') cat = 'V.A.';
        else if (album.artist === 'O.S.T.') cat = 'O.S.T.';
        else cat = album.genre || 'hiphop';
        genreCounts.set(cat, (genreCounts.get(cat) || 0) + 1);
        album.versions.forEach(v => {
            if (v.year && v.yearJP && v.yearJP >= v.year) {
                const gap = v.yearJP - v.year;
                gapTotal++;
                gapSum += gap;
                if (gap === 0) gapCounts.set('Same year', gapCounts.get('Same year') + 1);
                else if (gap === 1) gapCounts.set('+1 year', gapCounts.get('+1 year') + 1);
                else if (gap <= 3) gapCounts.set('+2–3 years', gapCounts.get('+2–3 years') + 1);
                else if (gap <= 9) gapCounts.set('+4–9 years', gapCounts.get('+4–9 years') + 1);
                else gapCounts.set('+10 years (reissue)', gapCounts.get('+10 years (reissue)') + 1);
            }
        });
    });

    const decades = [...decadeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const topLabels = [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]);
    const avgGap = gapTotal ? (gapSum / gapTotal).toFixed(1) : '-';

    modalBody.innerHTML = `
        <div class="stats-container">
            <h2 class="stats-title"><i class="fas fa-chart-bar"></i> Collection Stats</h2>
            <div class="stats-summary">
                <div class="stats-summary-item"><span class="stats-summary-num">${allAlbums.length}</span><span class="stats-summary-label">Albums</span></div>
                <div class="stats-summary-item"><span class="stats-summary-num">${versionCount}</span><span class="stats-summary-label">Pressings</span></div>
                <div class="stats-summary-item"><span class="stats-summary-num">${labelCounts.size}</span><span class="stats-summary-label">Labels</span></div>
                <div class="stats-summary-item"><span class="stats-summary-num">${tracklistCount}</span><span class="stats-summary-label">Tracklists</span></div>
            </div>
            <div class="stats-section"><h3>Original Release by Decade</h3>${statsBarRows(decades, allAlbums.length)}</div>
            <div class="stats-section"><h3>Top 10 Labels (Catalog Prefix)</h3>${statsBarRows(topLabels, allAlbums.length)}</div>
            <div class="stats-section"><h3>Category</h3>${statsBarRows(genres, allAlbums.length)}</div>
            <div class="stats-section"><h3>US → Japan Release Gap <span class="stats-note">avg ${avgGap} yrs</span></h3>${statsBarRows([...gapCounts.entries()], gapTotal)}</div>
        </div>`;
    modalCurrentAlbum = null;
    modalNavAlbums = null;
    modalPrev.style.display = 'none';
    modalNext.style.display = 'none';
    openModalA11y();
}

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function searchOnYouTube(artist, album) {
    const q = encodeURIComponent(`${artist} ${album}`);
    if (isMobile) { window.location.href = `vnd.youtube://results?search_query=${q}`; setTimeout(() => window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank'), 1000); }
    else window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
}

function searchOnSpotify(artist, album) {
    const q = encodeURIComponent(`${artist} ${album}`);
    if (isMobile) { window.location.href = `spotify:search:${q}`; setTimeout(() => window.open(`https://open.spotify.com/search/${q}`, '_blank'), 1000); }
    else window.open(`https://open.spotify.com/search/${q}`, '_blank');
}

function openSearch(url) { window.open(url, '_blank'); }
function searchOnDiscogs(artist, album) { const q = (artist === 'V.A.' || artist === 'O.S.T.') ? album : `${artist} ${album}`; openSearch(`https://www.discogs.com/search/?q=${encodeURIComponent(q)}&type=all`); }
function searchOnGenius(artist, album) { openSearch(`https://genius.com/search?q=${encodeURIComponent(`${artist} ${album}`)}`); }
function searchOnMercari(artist, album) { openSearch(`https://jp.mercari.com/search?keyword=${encodeURIComponent(`${artist} ${album}`)}`); }
function searchOnYahooAuction(artist, album) {
    const q = encodeURIComponent(`${artist} ${album}`);
    openSearch(`https://auctions.yahoo.co.jp/search/search?p=${q}`);
}
function searchOnWhoSampled(artist) { openSearch(`https://www.whosampled.com/search/?q=${encodeURIComponent(artist)}`); }
function showLoading(show) { loadingSpinner.style.display = show ? 'block' : 'none'; }
function showNoResults(show) { noResults.style.display = show ? 'block' : 'none'; }
function updateResultCount(count) { if (resultCount) resultCount.textContent = count; }

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => { clearTimeout(timeout); func(...args); }, wait);
    };
}

function renderTracklist(tracklist) {
    let html = '', inList = false;
    tracklist.forEach(t => {
        if (/^\[.*\]$/.test(t)) {
            if (inList) { html += '</ol>'; inList = false; }
            html += `<div class="tracklist-disc-label">${escapeHTML(t.slice(1, -1))}</div>`;
        } else {
            if (!inList) { html += '<ol>'; inList = true; }
            html += `<li>${escapeHTML(t.replace(/^\d+\.\s*/, ''))}</li>`;
        }
    });
    if (inList) html += '</ol>';
    return html;
}

// ── Image viewer ─────────────────────────────────────────────────────────────
let imgViewer = null, ivImg = null, ivScale = 1, ivTx = 0, ivTy = 0;
let ivPointers = {}, ivDragStart = null;

function initImageViewer() {
    imgViewer = document.createElement('div');
    imgViewer.id = 'img-viewer';
    ivImg = document.createElement('img');
    imgViewer.appendChild(ivImg);
    document.body.appendChild(imgViewer);
    imgViewer.addEventListener('click', e => { if (e.target === imgViewer) closeImageViewer(); });
    ivImg.addEventListener('pointerdown', ivPointerDown);
    ivImg.addEventListener('pointermove', ivPointerMove);
    ivImg.addEventListener('pointerup', ivPointerUp);
    ivImg.addEventListener('pointercancel', ivPointerUp);
    ivImg.addEventListener('dragstart', e => e.preventDefault());
}

function openImageViewer(src) {
    if (!imgViewer) initImageViewer();
    ivImg.src = src;
    ivScale = 1; ivTx = 0; ivTy = 0; ivPointers = {}; ivDragStart = null;
    ivApplyTransform();
    imgViewer.style.display = 'block';
}

function closeImageViewer() {
    if (imgViewer) imgViewer.style.display = 'none';
}

function ivApplyTransform() {
    ivImg.style.transform = `translate(calc(-50% + ${ivTx}px), calc(-50% + ${ivTy}px)) scale(${ivScale})`;
}

function ivPointerDown(e) {
    e.preventDefault();
    ivImg.setPointerCapture(e.pointerId);
    ivPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    ivImg.classList.add('grabbing');
    if (Object.keys(ivPointers).length === 1) {
        ivDragStart = { x: e.clientX, y: e.clientY, tx: ivTx, ty: ivTy, lastDist: null };
    }
}

function ivPointerMove(e) {
    e.preventDefault();
    ivPointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(ivPointers);
    if (ids.length === 2) {
        const [p1, p2] = ids.map(k => ivPointers[k]);
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (ivDragStart && ivDragStart.lastDist) {
            ivScale = Math.max(0.5, Math.min(8, ivScale * (dist / ivDragStart.lastDist)));
        }
        if (ivDragStart) ivDragStart.lastDist = dist;
    } else if (ids.length === 1 && ivDragStart) {
        ivTx = ivDragStart.tx + (e.clientX - ivDragStart.x);
        ivTy = ivDragStart.ty + (e.clientY - ivDragStart.y);
    }
    ivApplyTransform();
}

function ivPointerUp(e) {
    delete ivPointers[e.pointerId];
    ivImg.classList.remove('grabbing');
    const ids = Object.keys(ivPointers);
    if (ids.length === 1) {
        const r = ivPointers[ids[0]];
        ivDragStart = { x: r.x, y: r.y, tx: ivTx, ty: ivTy, lastDist: null };
    } else if (ids.length === 0) {
        ivDragStart = null;
    }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (imgViewer && imgViewer.style.display !== 'none') { closeImageViewer(); return; }
        if (albumModal.classList.contains('active')) closeModal();
    }
    if (e.key === 'Tab' && albumModal.classList.contains('active')) { trapModalFocus(e); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && albumModal.classList.contains('active') && (!imgViewer || imgViewer.style.display === 'none')) {
        navigateModal(e.key === 'ArrowLeft' ? -1 : 1);
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); }
    if (e.key === 'r' && !searchInput.matches(':focus') && !albumModal.classList.contains('active')) showRandomAlbum();
    if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey
        && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        setEditMode(!editMode);
    }
});

function trapModalFocus(e) {
    const focusable = albumModal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
    const visible = [...focusable].filter(el => el.offsetParent !== null);
    if (!visible.length) return;
    const first = visible[0];
    const last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}
})();
