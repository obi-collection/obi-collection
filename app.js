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

document.addEventListener('DOMContentLoaded', () => {
    allAlbums = COLLECTION_DATA.albums;
    prepareAlbums();
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
});

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
    sortSelect.addEventListener('change', applyAlphabetFilter);
    alphabetSelect.addEventListener('change', applyAlphabetFilter);
    modalOverlay.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    albumModal.addEventListener('click', e => { if (e.target === albumModal) closeModal(); });
    collectionContainer.addEventListener('click', handleCollectionClick);
    modalBody.addEventListener('click', handleModalClick);
}

function handleCollectionClick(e) {
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

function handleModalClick(e) {
    const tracklistToggle = e.target.closest('.tracklist-toggle');
    if (tracklistToggle) {
        tracklistToggle.closest('.tracklist-accordion')?.classList.toggle('open');
        return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const album = albumById.get(actionBtn.dataset.albumId);
    const versionIndex = Number(actionBtn.dataset.versionIndex || 0);
    const version = album?.versions?.[versionIndex] || album?.versions?.[0] || {};
    if (!album && actionBtn.dataset.action !== 'claude') return;

    switch (actionBtn.dataset.action) {
        case 'youtube':
            searchOnYouTube(album.artist, album.album);
            break;
        case 'apple-music':
            searchOnAppleMusic(album.artist, album.album);
            break;
        case 'ask-ai':
            copyAIPrompt(actionBtn, album.artist, album.album, version.year, version.catalog || '', album.id);
            break;
        case 'claude':
            window.open('https://claude.ai', '_blank');
            break;
        case 'note':
            if (album.note_url) window.open(album.note_url, '_blank');
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
        album._albumKey = album.album.toLowerCase();
        album._year = firstVersion.year || 9999;
        album._yearJP = firstVersion.yearJP || 9999;
        const tracklistText = (album.tracklist || []).join(' ');
        album._searchText = `${album.artist} ${album.album} ${tracklistText}`.toLowerCase();
        albumById.set(album.id, album);
    });
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
    if (alphabetFilter === 'soundtrack') {
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
    if (filteredAlbums.length === 0) { showNoResults(true); updateResultCount(0); return; }
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
    initLazyLoading();
    updateAlphaBar();
}

function createAlbumCard(album, index = null, isPinned = false) {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.dataset.albumId = album.id;
    card.dataset.sortArtist = getSortName(album.artist_sort || album.artist);
    if (index !== null) card.dataset.position = index;
    const firstVersion = album.versions[0];
    const versionCount = album.versions.length;
    card.innerHTML = `
        <div class="album-image-container">
            <img class="album-image lazy-load" data-src="${escapeHTML(firstVersion.image)}" alt="${escapeHTML(album.album)}" loading="lazy" decoding="async">
            ${versionCount > 1 ? `<div class="version-badge">${versionCount} versions</div>` : ''}
            ${index !== null ? `<button class="pin-btn ${isPinned ? 'pinned' : ''}" data-album-id="${escapeHTML(album.id)}" data-position="${index}" title="${isPinned ? 'ピン留め解除' : 'ピン留め'}"><i class="fas fa-thumbtack"></i></button>` : ''}
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

function showAlbumModal(album) {
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
                    <div class="action-buttons action-buttons-left">
                        <button class="action-btn youtube" data-action="youtube" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fab fa-youtube"></i> YouTube</button>
                        <button class="action-btn apple-music" data-action="apple-music" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fab fa-apple"></i> Apple Music</button>
                        <button class="action-btn ask-ai" data-action="ask-ai" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-copy"></i> Ask AI</button>
                        <button class="action-btn claude-ai" data-action="claude"><i class="fas fa-robot"></i> Claude</button>
                    </div>
                    <div class="action-buttons action-buttons-right">
                        ${album.note_url ? `<button class="action-btn note" data-action="note" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-newspaper"></i> note</button>` : '<div class="action-btn-placeholder"></div>'}
                        <button class="action-btn discogs" data-action="discogs" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-record-vinyl"></i> Discogs</button>
                        <button class="action-btn whosampled" data-action="whosampled" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-headphones"></i> WhoSampled</button>
                        <button class="action-btn genius" data-action="genius" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-music"></i> Genius</button>
                        <button class="action-btn mercari" data-action="mercari" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-tag"></i> Mercari</button>
                        <button class="action-btn yahooauction" data-action="yahooauction" data-album-id="${escapeHTML(album.id)}" data-version-index="${index}"><i class="fas fa-gavel"></i> Yahoo Auction</button>
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
        </div>`;

    modalBody.querySelectorAll('.modal-album-image').forEach(img => {
        let pressTimer;
        img.addEventListener('touchstart', () => { img.dataset.longPress = 'false'; pressTimer = setTimeout(() => { img.dataset.longPress = 'true'; }, 500); });
        img.addEventListener('touchend', () => { clearTimeout(pressTimer); setTimeout(() => { img.dataset.longPress = 'false'; }, 100); });
        img.addEventListener('touchmove', () => clearTimeout(pressTimer));
        img.addEventListener('click', () => { if (img.dataset.longPress !== 'true') openImageViewer(img.src.replace('f_auto,q_auto,w_600', 'f_auto,q_100,w_2400')); });
    });
    albumModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() { albumModal.classList.remove('active'); document.body.style.overflow = 'auto'; }

function openClaude(artist, albumTitle, year, catalog) {
    const prompt = `このアルバムについて、下記の構成で日本語で教えてください。\nテーブル形式・マークダウンテーブルは絶対に使わないでください。すべて箇条書きか文章で書いてください。\n\n【アルバム紹介】\n・作品の概要（リリース背景、位置づけ）\n・主なプロデューサー陣と全体のサウンドの特徴\n・主な客演ラッパー・シンガー一覧\n・ヒップホップシーンにおける評価・影響\n\n【収録曲ガイド】\n各曲を必ず以下のフォーマットで、縦に並べて記載してください：\n\n1. 曲名\nプロデューサー：xxx\n客演：xxx（いない場合は省略）\n聴きどころ：xxx\n\n2. 曲名\nプロデューサー：xxx\n...\n\nアーティスト：${artist}\nアルバム：${albumTitle}\nリリース：${year}\nレーベル：\nカタログ番号：${catalog}\n収録曲：`;
    window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank');
}

function copyAIPrompt(btn, artist, albumTitle, year, catalog, albumId) {
    const albumData = albumId ? albumById.get(albumId) : null;
    const tracklist = albumData && albumData.tracklist ? albumData.tracklist : null;
    const tracklistText = tracklist ? '\n' + tracklist.join('\n') : '';
    const prompt = `このアルバムについて、下記の構成で日本語で教えてください。\nマークダウンテーブルは絶対に使わないでください。見出しは##（大セクション）・###（小セクション）を使ってください。本文は箇条書きか文章で書いてください。\n先頭に字下げ（インデント）を入れないこと。すべて左揃えで出力すること。\n\n各曲のプロデューサー・ゲスト情報は、Discogs・WhoSampled・AllMusic・Wikipediaなど複数のソースを検索して可能な限り正確に埋めること。時間がかかっても構わないので、不明のまま放置しないこと。\n\nパンチラインの紹介は一切しないこと。フック（サビ）の歌詞はGeniusの楽曲ページで[Chorus:]と表記されている部分のみを掲載する。Geniusに歌詞が登録されていない曲、または[Chorus:]の表記がない曲はフックの項目を省略する。掲載する場合はフック全文と日本語訳を載せる。\n\nサウンドトラック作品の場合、監督名は記載しないこと。\n\n「クリスプ」「シルキー」「シミリー」「BAR」など日本語のヒップホップシーンで一般的でない英語カタカナ表現は使わないこと。「サイファー」など日本のヒップホップシーンに定着している言葉は使って構わない。\n\n英語圏の音楽批評で使われるスラングや専門用語をそのままカタカナにした表現は使わないこと。「モブスタイル」「ギャングスタ」のような、日本の一般読者に意味が伝わりにくい表現は、具体的な日本語で言い換えること。\n\nWikipedia・Albumism・AllMusicなどの出典名は本文中に記載しないこと。\n\nサンプリングネタを言及する場合は「アーティスト名の「曲名」」という形式で統一すること（例：Brother to Brotherの「The Affair」をサンプリングした）。\n\nアーティストの本名を括弧書きで添えないこと（例：「Illa J（本名John Yancey）」のような表記は不要）。\n\n英語の直訳的・翻訳調の言い回しを避け、自然な日本語で書くこと。\n\n評価・影響のセクションでは断定を避け、裏付けの強さに応じた言い方にすること（「〜とも言える」「〜という声もある」「〜が根強い」など）。\n\n文体は全体を通じて落ち着いた記事体で統一すること。「最強の年」「圧巻」「ノリノリ」など感情的・口語的な表現は使わないこと。\n\n日本語の一般読者に馴染みのないカタカナ学術用語・批評用語は使わないこと。「ユーロセントリック」「ダイアスポラ」「ヘゲモニー」「ポストコロニアル」「インタポレート」など、音楽に詳しくない日本語話者に意味が伝わらない用語は平易な日本語に言い換えること。\n\n出力の冒頭は「アーティスト名『アルバムタイトル』——日本語サブタイトル」の構成で始めること（例：「50 Cent『Before I Self Destruct』——街に戻った男の剥き出しの自画像」）。ダッシュは全角ダッシュ2つ（——）を使うこと。サブタイトルは読者がnoteで読みたくなるような日本語にすること。\n\n## アルバム紹介\n### 作品の概要\n\n### 主なプロデューサー陣と全体のサウンドの特徴\n（各プロデューサーを箇条書きで列挙、担当曲名は不要）\n\n### ヒップホップシーンにおける評価・影響\n\n## 収録曲ガイド\n各曲を必ず以下のフォーマットで記載し、各曲の間には必ず横棒（---）を入れること。\n曲名・プロデューサー・ゲスト・解説・フックはそれぞれ必ず改行で区切ること。\n本文はすべて一文ごとに改行すること。複数の文を続けて書かないこと。\nゲストアーティストがいない曲は「〇〇独演」などと書かず、ゲストの行自体を省略すること。\n曲名に「(feat. 〇〇)」「(featuring 〇〇)」の表記は含めないこと。ゲスト情報はゲスト欄に記載する。\n\n### 1. 曲名\nプロデューサー：\nxxx\nゲスト：\nxxx（いない場合は省略）\nトラック解説文\nフック："英語歌詞"\n（日本語訳）（フックがない曲は省略）\n\n---\n\n## 参考\n実際に参照した可能性が高いソースのみ箇条書きで列挙すること。URLは不要。関係のないソースは省く。\n例：\n- Discogs\n- AllMusic\n- Genius\n- Wikipedia\n\nアーティスト：${artist}\nアルバム：${albumTitle}\nリリース：${year}\nレーベル：\nカタログ番号：${catalog}\n収録曲：${tracklistText}`;
    navigator.clipboard.writeText(prompt).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fas fa-check"></i> プロンプトをコピーしました';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fas fa-copy"></i> Ask AI';
        }, 2000);
    });
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

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function searchOnYouTube(artist, album) {
    const q = encodeURIComponent(`${artist} ${album}`);
    if (isMobile) { window.location.href = `vnd.youtube://results?search_query=${q}`; setTimeout(() => window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank'), 1000); }
    else window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank');
}

function searchOnAppleMusic(artist, album) {
    const q = encodeURIComponent(`${artist} ${album}`);
    if (isMobile) { window.location.href = `music://music.apple.com/search?term=${q}`; setTimeout(() => window.open(`https://music.apple.com/search?term=${q}`, '_blank'), 1000); }
    else window.open(`https://music.apple.com/search?term=${q}`, '_blank');
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
function shareOnX(artist, album, catalog, imageUrl) {
    const overlay = document.getElementById('xShareOverlay');
    const img = document.getElementById('xShareImage');
    const okBtn = document.getElementById('xShareOkBtn');
    img.src = imageUrl;
    overlay.classList.add('active');
    okBtn.onclick = () => {
        overlay.classList.remove('active');
        const text = `${artist} - ${album}`;
        openSearch(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`);
    };
}

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
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); }
    if (e.key === 'r' && !searchInput.matches(':focus')) showRandomAlbum();
});
})();
