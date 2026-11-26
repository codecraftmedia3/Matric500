'use strict';

window.SocialsUI = (() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const svgData = (title, colors = ['#0F2A23', '#C8F25A']) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560"><rect width="900" height="560" fill="${colors[0]}"/><circle cx="720" cy="120" r="210" fill="${colors[1]}" opacity=".92"/><path d="M0 430 C210 330 360 500 560 390 C690 318 790 350 900 260V560H0Z" fill="#fff" opacity=".14"/><text x="56" y="500" fill="#fff" font-family="Arial,sans-serif" font-size="38" font-weight="700">${title}</text></svg>`)}`;

  const state = {
    activePage: 'home', sidebarCollapsed: false, friendsCollapsed: false,
    mobileSidebarOpen: false, mobileFriendsOpen: false, friendsModalOpen: false,
    imageViewer: null, searchQuery: '', loading: false, submitted: false, selectedVideo: null,
    mobileNavOpen: false, searchExpanded: false, feedFilter: 'all', friendsSearchQuery: '',
    dailyLimitReached: false, postingStatus: null,
    selectedImage: null, selectedImageName: '', showCommentsFor: null, showMoreFor: null,
  };

  let mockFriends = [
    { id:'u1', username:'amina_edu', displayName:'Amina Tesfaye', status:'online', accent:'#C8F25A' },
    { id:'u2', username:'dawit.math', displayName:'Dawit Alemu', status:'online', accent:'#72C7A1' },
    { id:'u3', username:'selam_reads', displayName:'Selam Bekele', status:'offline', accent:'#FFB59E' },
    { id:'u4', username:'kaleb.physics', displayName:'Kaleb Yosef', status:'unknown', accent:'#9FB7E8' },
    { id:'u5', username:'lidet.learns', displayName:'Lidet Mulu', status:'online', accent:'#DDA7E8' },
    { id:'u6', username:'yoni.codes', displayName:'Yonatan Kebede', status:'offline', accent:'#F2C94C' },
    { id:'u7', username:'rahel.history', displayName:'Rahel Worku', status:'online', accent:'#80D9CA' },
  ];

  let posts = [
    { id:'p1', author:{ name:'Matric500', username:'matric500', badge:'Official' }, displayName:'Matric500', username:'matric500', avatar:null, createdAt:'18 min', title:'A simple plan for your final revision', body:'Break revision into three parts: recall, practice, and review. Start by rewriting the key ideas without notes, then solve past-paper questions, and finish by marking every weak point for tomorrow.', reactionCount:128, commentCount:24, reacted:false, variant:'standard', images:[svgData('Revision roadmap', ['#0F2A23','#C8F25A'])] },
    { id:'p2', author:{ name:'Amina Tesfaye', username:'amina_edu', badge:'' }, displayName:'Amina Tesfaye', username:'amina_edu', avatar:null, createdAt:'1 hr', title:'Today’s Biology study group', body:'We reviewed cells and microscopy this afternoon. My biggest takeaway: label diagrams twice—once from memory and once from the textbook. Which topic should we tackle next?', reactionCount:64, commentCount:11, reacted:true, variant:'compact', images:[] },
    { id:'p3', author:{ name:'Dawit Alemu', username:'dawit.math', badge:'Top contributor' }, displayName:'Dawit Alemu', username:'dawit.math', avatar:null, createdAt:'3 hr', title:'Mathematics: small wins compound', body:'A worked example is useful only if you explain the reason for each step. I made a one-page checklist for algebra and included the common mistakes I see in mocks.', reactionCount:92, commentCount:18, reacted:false, variant:'media', images:[svgData('Algebra notes', ['#FFD9CE','#0F2A23']),svgData('Practice set', ['#1F6B4F','#C8F25A'])] },
    { id:'p4', author:{ name:'Selam Bekele', username:'selam_reads', badge:'' }, displayName:'Selam Bekele', username:'selam_reads', avatar:null, createdAt:'Yesterday', title:'One habit that improved my reading', body:'I read every passage once for the main idea, then once for evidence. Separating those two passes made timed comprehension much less stressful. Save this for exam week!', reactionCount:41, commentCount:7, reacted:false, variant:'expanded', images:[] },
  ];

  async function loadFriends() {
    try {
      const r = await fetch('/api/friends', { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
      if (!r.ok) return;
      const data = await r.json();
      mockFriends = (data.friends || []).map(friend => ({ id: friend.id, username: friend.username || '', displayName: friend.name, status: 'unknown', accent: '#C8F25A' }));
    } catch {}
  }

  async function loadPosts() {
    try {
      const r = await fetch('/api/posts?limit=50', { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
      if (!r.ok) return;
      const data = await r.json();
      posts = (data.posts || []).map(post => ({
        id: String(post.id), author: { name: post.author?.name || 'Matric500', username: post.author?.username || '', badge: post.kind === 'official' ? 'Official' : '' },
        displayName: post.author?.name || 'Matric500', username: post.author?.username || '', createdAt: new Date(post.createdAt).toLocaleString(),
        title: post.title, body: post.body, reactionCount: post.reactionCount || 0, commentCount: post.commentCount || 0,
        reacted: !!post.currentReaction, variant: post.hasImage ? 'media' : 'standard',
        images: post.hasImage ? [`/api/posts/${encodeURIComponent(post.id)}/image`] : [],
      }));
    } catch {}
  }

  const icons = {
    home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    compass:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4z"/></svg>',
    users:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7M17 15c3 .5 5 2.5 5 6"/></svg>',
    heart:'<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
    comment:'<svg viewBox="0 0 24 24"><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/></svg>',
    share:'<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></svg>',
    refresh:'<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 6"/><path d="M20 4v7h-7"/></svg>',
    image:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg>',
  };

  function initials(name) { return String(name || 'M').split(/\s+/).slice(0,2).map(v => v[0] || '').join('').toUpperCase(); }
  function avatar(user, size='md') {
    const letter = initials(user.displayName || user.name);
    const accent = user.accent || '#C8F25A';
    return `<span class="social-avatar social-avatar-${size}" style="--avatar-accent:${accent}" aria-hidden="true">${esc(letter)}</span>`;
  }

  function sidebar() {
    const items = [{id:'home',label:'Home',icon:icons.home},{id:'search',label:'Search',icon:icons.search},{id:'explore',label:'Explore',icon:icons.compass}];
    return `<aside class="social-sidebar ${state.sidebarCollapsed ? 'is-collapsed' : ''} ${state.mobileSidebarOpen ? 'is-mobile-open' : ''}" aria-label="Social navigation">
      <div class="social-sidebar-top"><span class="social-sidebar-brand">S</span><button class="social-icon-button social-sidebar-toggle" type="button" data-social-action="toggle-sidebar" aria-label="${state.sidebarCollapsed ? 'Expand' : 'Collapse'} social navigation">${state.sidebarCollapsed ? '›' : '‹'}</button></div>
      <nav class="social-nav">${items.map(item => `<button type="button" class="social-nav-item ${state.activePage === item.id ? 'is-active' : ''}" data-social-page="${item.id}" aria-label="${item.label}" ${state.activePage === item.id ? 'aria-current="page"' : ''}><span class="social-nav-icon">${item.icon}</span><span class="social-nav-label">${item.label}</span></button>`).join('')}</nav>
    </aside>
    <div class="social-mobile-nav ${state.mobileNavOpen ? 'is-open' : ''}" aria-label="Mobile Socials navigation">
      <nav>${items.map(item => `<button type="button" class="social-mobile-nav-item ${state.activePage === item.id ? 'is-active' : ''}" data-social-page="${item.id}" aria-label="${item.label}" ${state.activePage === item.id ? 'aria-current="page"' : ''}><span>${item.icon}</span><span>${item.label}</span></button>`).join('')}<button type="button" class="social-mobile-back" data-social-action="back-home" aria-label="Back to Home">${icons.home}<span>Home</span></button></nav>
      <button type="button" class="social-mobile-nav-toggle" data-social-action="toggle-mobile-nav" aria-expanded="${state.mobileNavOpen}" aria-label="${state.mobileNavOpen ? 'Close' : 'Open'} social navigation">${state.mobileNavOpen ? '×' : '›'}</button>
    </div>
    <button type="button" class="social-drawer-backdrop ${state.mobileSidebarOpen ? 'is-visible' : ''}" data-social-action="close-mobile-sidebar" aria-label="Close navigation"></button>`;
  }

  function friendsPanel() {
    const query = state.friendsSearchQuery.trim().toLowerCase();
    const filtered = mockFriends.filter(friend => `${friend.displayName} ${friend.username}`.toLowerCase().includes(query));
    return `<aside class="social-friends ${state.friendsCollapsed ? 'is-collapsed' : ''} ${state.mobileFriendsOpen ? 'is-mobile-open' : ''}" aria-label="Friends">
      <div class="social-friends-head"><div><p class="social-eyebrow">Community</p><h2>Friends</h2></div><div class="social-friends-actions"><button type="button" class="social-icon-button social-friends-toggle" data-social-action="toggle-friends" aria-label="${state.friendsCollapsed ? 'Expand' : 'Collapse'} friends panel">${state.friendsCollapsed ? '›' : '‹'}</button></div></div>
      <div class="social-modal-search social-drawer-search">${icons.search}<input id="socialFriendsDrawerSearch" value="${esc(state.friendsSearchQuery)}" placeholder="Search friends" aria-label="Search friends"></div>
      <div class="social-friends-list">${filtered.slice(0,5).map(friend => friendItem(friend)).join('')}</div>
      <button type="button" class="social-see-friends" data-social-action="open-friends-modal">See all friends <span aria-hidden="true">→</span></button>
    </aside><button type="button" class="social-drawer-backdrop friends-backdrop ${state.mobileFriendsOpen ? 'is-visible' : ''}" data-social-action="close-mobile-friends" aria-label="Close friends panel"></button>`;
  }

  function friendItem(friend, compact=false) {
    return `<button type="button" class="social-friend-item ${compact ? 'is-compact' : ''}" data-social-action="open-profile" data-username="${esc(friend.username)}"><span class="social-presence-wrap">${avatar(friend,'friend')}<span class="social-presence ${esc(friend.status)}" title="${esc(friend.status)}"></span></span><span class="social-friend-copy"><strong>${esc(friend.displayName)}</strong><small>@${esc(friend.username)}</small></span></button>`;
  }

  function postCard(post) {
    const cls = `social-post-card social-post-${post.variant || 'standard'}`;
    const media = post.images?.length ? `<div class="social-post-media media-count-${post.images.length}">${post.images.map((src,index) => `<button type="button" class="social-media-button" data-social-action="open-image" data-image="${esc(src)}" aria-label="Expand post image ${index+1}"><img src="${esc(src)}" alt="Illustration for ${esc(post.title)}" loading="lazy"></button>`).join('')}</div>` : '';
    // Comments section toggle
    const showComments = state.showCommentsFor === post.id;
    // More menu toggle
    const showMore = state.showMoreFor === post.id;
    return `<article class="${cls}" data-post-id="${esc(post.id)}">
      <div class="social-post-author">
        <button type="button" class="social-avatar social-avatar-post" data-social-action="open-profile" data-username="${esc(post.username)}">${esc(initials(post.displayName))}</button>
        <div class="social-author-copy">
          <div>
            <button type="button" class="social-author-link" data-social-action="open-profile" data-username="${esc(post.username)}"><strong>${esc(post.displayName)}</strong></button>
            ${post.author.badge ? `<span class="social-author-badge">${esc(post.author.badge)}</span>` : ''}
          </div>
          <span>@${esc(post.username)} · ${esc(post.createdAt)}</span>
        </div>
        <div class="social-more-menu-wrap">
          <button type="button" class="social-post-more" data-social-action="post-menu" data-post-id="${esc(post.id)}" aria-label="Post options">•••</button>
          ${showMore ? `<ul class="social-more-dropdown"><li><button type="button" data-social-action="share" data-post-id="${esc(post.id)}">Share</button></li><li><button type="button" data-social-action="report" data-post-id="${esc(post.id)}">Report</button></li></ul>` : ''}
        </div>
      </div>
      <div class="social-post-content"><h2>${esc(post.title)}</h2><p>${esc(post.body)}</p>${post.variant === 'expanded' ? '' : post.body.length > 180 ? `<button type="button" class="social-read-more" data-social-action="toggle-post-copy" data-post-id="${esc(post.id)}">Read more</button>` : ''}</div>${media}
      <div class="social-post-actions">
        <button type="button" class="social-reaction ${post.reacted ? 'is-reacted' : ''}" data-social-action="react" data-post-id="${esc(post.id)}" aria-label="React to post"><span class="social-action-icon">${post.reacted ? '♥' : '♡'}</span><span>${post.reactionCount}</span></button>
        <button type="button" data-social-action="comment" data-post-id="${esc(post.id)}" aria-label="View comments"><span class="social-action-icon">${icons.comment}</span><span>${post.commentCount}</span></button>
        <button type="button" class="social-share-action" data-social-action="share" data-post-id="${esc(post.id)}" aria-label="Share post">${icons.share}</button>
      </div>
      ${showComments ? `<div class="social-comments-section"><p class="text-muted">Comments coming soon...</p></div>` : ''}
    </article>`;
  }

  function feedControls() {
    const filters = [{id:'all',label:'All Posts'},{id:'community',label:'Community'},{id:'official',label:'Official'}];
    return `<div class="social-mobile-feed-tools">
      <div class="social-feed-filters" aria-label="Post filters">${filters.map(filter => `<button type="button" data-social-action="set-feed-filter" data-filter="${filter.id}" class="${state.feedFilter === filter.id ? 'is-active' : ''}" ${state.feedFilter === filter.id ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${filter.label}</button>`).join('')}</div>
      <div class="social-mobile-feed-actions">
        <div class="social-mobile-search ${state.searchExpanded ? 'is-expanded' : ''}">${icons.search}<input id="socialMobileSearch" value="${esc(state.searchQuery)}" placeholder="Search posts" aria-label="Search posts"><button type="button" data-social-action="toggle-mobile-search" aria-label="${state.searchExpanded ? 'Close search' : 'Open search'}">${state.searchExpanded ? '×' : ''}</button></div>
        <button type="button" class="social-mobile-create" data-social-action="open-mobile-composer" aria-label="Create post">+</button>
      </div>
    </div>`;
  }

  function PostFeed() {
    const filtered = posts.filter(post => state.feedFilter === 'all' || (state.feedFilter === 'official' ? post.author.badge === 'Official' : post.author.badge !== 'Official'));
    const query = state.searchQuery.trim().toLowerCase();
    const searched = query ? filtered.filter(post => `${post.title} ${post.body} ${post.displayName}`.toLowerCase().includes(query)) : filtered;
    const list = searched.map(postCard).join('');
    return `<section class="social-feed-list" aria-label="Post feed">${list || '<div class="social-empty-state"><h2>No posts</h2><p>Try another filter.</p></div>'}<div class="social-end-state"><span></span><p>You’re all caught up</p><span></span></div></section>`;
  }

  function composer() {
    return `<section class="social-composer" aria-labelledby="composerTitle">
      <div class="social-composer-head"><h2 id="composerTitle">Create a post</h2><button type="button" class="social-composer-reset" data-social-action="reset-composer">Cancel</button></div>
      <form id="socialPostForm">
        <div class="social-composer-row"><span class="social-avatar social-avatar-post">${esc(initials(window.ROADMAP_DATA?.user?.name || 'Student'))}</span><div class="social-composer-fields"><input id="socialPostTitle" maxlength="120" placeholder="Post title" aria-label="Post title"><textarea id="socialPostBody" maxlength="4000" rows="3" placeholder="What's happening?" aria-label="Post description"></textarea></div></div>
        <div id="socialImagePreview" class="social-image-preview ${state.selectedImage ? '' : 'is-hidden'}">${state.selectedImage ? `<img src="${esc(state.selectedImage)}" alt="Selected image preview"><button type="button" data-social-action="remove-image" aria-label="Remove selected image">×</button>` : ''}</div>
        <p id="socialComposerStatus" class="social-composer-status" role="status"></p>
        <div class="social-composer-actions"><label class="social-add-image" for="socialPostImage">${icons.image}<span>Add media</span><input id="socialPostImage" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"></label><button id="socialPublishButton" type="submit" class="social-publish" ${state.dailyLimitReached ? 'disabled' : ''}>${state.dailyLimitReached ? 'Daily limit reached' : 'Publish post'}</button></div>
      </form>
    </section>`;
  }

  function feedHeader() {
    const context = state.activePage === 'home' ? 'Home feed' : state.activePage === 'search' ? 'Search' : 'Explore';
    return `<header class="social-feed-header"><div><p class="social-eyebrow">Matric500 Socials</p><h1>${context}</h1></div><button type="button" class="social-refresh ${state.loading ? 'is-loading' : ''}" data-social-action="refresh-feed" aria-label="Refresh local feed">${icons.refresh}</button></header>`;
  }

  function SearchView() {
    const query = state.searchQuery.trim().toLowerCase();
    const people = mockFriends.filter(f => `${f.displayName} ${f.username}`.toLowerCase().includes(query));
    const foundPosts = posts.filter(p => `${p.title} ${p.body} ${p.displayName}`.toLowerCase().includes(query));
    const hasResults = !!query && (people.length || foundPosts.length);
    return `<section class="social-search-view"><div class="social-search-box">${icons.search}<input id="socialSearchInput" value="${esc(state.searchQuery)}" placeholder="Search people and posts" aria-label="Search Socials">${state.searchQuery ? '<button type="button" data-social-action="clear-search">Clear</button>' : ''}</div>${!query ? `<div class="social-empty-state"><span>${icons.search}</span><h2>Search Socials</h2><p>Find people and posts from this local demonstration.</p></div>` : hasResults ? `<div class="social-search-results">${people.length ? `<section><h2>People</h2><div class="social-search-people">${people.map(friend => friendItem(friend,true)).join('')}</div></section>` : ''}${foundPosts.length ? `<section><h2>Posts</h2>${foundPosts.map(postCard).join('')}</section>` : ''}</div>` : `<div class="social-empty-state"><h2>No results</h2><p>Try another name or topic.</p></div>`}</section>`;
  }

  function ExploreView() {
    const featured = posts.slice(0,3);
    return `<section class="social-explore-view"><div class="social-discovery-grid">${featured.map((post,index) => `<article class="social-discovery-card ${index === 0 ? 'is-featured' : ''}"><button type="button" data-social-action="open-image" data-image="${esc(post.images[0] || svgData(post.title,['#FFD9CE','#0F2A23']))}" aria-label="Open ${esc(post.title)}"><img src="${esc(post.images[0] || svgData(post.title,['#FFD9CE','#0F2A23']))}" alt="" loading="lazy"></button><div><span>Recommended</span><h2>${esc(post.title)}</h2></div></article>`).join('')}</div><div class="social-explore-heading"><h2>Explore posts</h2><button type="button" data-social-action="open-friends-modal">People to know</button></div>${featured.map(postCard).join('')}</section>`;
  }

  function friendsModal() {
    if (!state.friendsModalOpen) return '';
    const query = state.friendsSearchQuery.trim().toLowerCase();
    const filtered = mockFriends.filter(f => `${f.displayName} ${f.username}`.toLowerCase().includes(query));
    return `<div class="social-modal-backdrop" data-social-action="close-friends-modal"><section class="social-friends-modal" role="dialog" aria-modal="true" aria-labelledby="friendsModalTitle"><div class="social-modal-head"><div><p class="social-eyebrow">Community</p><h2 id="friendsModalTitle">Friends</h2></div><button type="button" class="social-modal-close" data-social-action="close-friends-modal" aria-label="Close friends modal">×</button></div><div class="social-modal-search">${icons.search}<input id="socialFriendsSearch" value="${esc(state.friendsSearchQuery)}" placeholder="Search friends" aria-label="Search friends"></div><div class="social-modal-list">${filtered.length ? filtered.map(friend => friendItem(friend,true)).join('') : '<div class="social-modal-empty">No friends match your search.</div>'}</div></section></div>`;
  }

  function imageViewer() {
    if (!state.imageViewer) return '';
    return `<div class="social-modal-backdrop social-image-backdrop" data-social-action="close-image"><section class="social-image-viewer" role="dialog" aria-modal="true" aria-label="Expanded post image"><button type="button" class="social-modal-close" data-social-action="close-image" aria-label="Close image viewer">×</button><img src="${esc(state.imageViewer)}" alt="Expanded post image"></section></div>`;
  }

  function render() {
    const root = document.getElementById('view-forum');
    if (!root) return;
    root.innerHTML = `<div class="socials-shell ${state.sidebarCollapsed ? 'left-collapsed' : ''} ${state.friendsCollapsed ? 'right-collapsed' : ''}">
      ${sidebar()}<main class="social-main-column"><div class="social-mobile-toolbar"><button type="button" data-social-action="open-mobile-friends" aria-label="Open friends panel">${icons.users}</button></div>${feedHeader()}${state.activePage === 'home' ? `<div class="social-feed-view">${feedControls()}${composer()}${PostFeed()}</div>` : state.activePage === 'search' ? SearchView() : ExploreView()}</main>${friendsPanel()}</div>${friendsModal()}${imageViewer()}`;
    bindEvents();
    syncMobileAi();
  }

  function syncMobileAi() {
    const fab = document.getElementById('aiFab');
    if (!fab) return;
    const mobileForum = window.matchMedia('(max-width:767px)').matches && !document.getElementById('view-forum')?.classList.contains('hidden');
    fab.classList.toggle('hidden', mobileForum && !state.mobileNavOpen);
  }

  function bindEvents() {
    if (!outsideMenuListenerBound) {
      document.addEventListener('click', closeMoreMenuOnOutsideClick);
      outsideMenuListenerBound = true;
    }
    const root = document.getElementById('view-forum');
    if (!root) return;
    root.querySelectorAll('[data-social-page]').forEach(button => button.addEventListener('click', () => { state.activePage = button.dataset.socialPage; state.mobileSidebarOpen = false; state.mobileNavOpen = false; render(); }));
    root.querySelectorAll('[data-social-action]').forEach(button => button.addEventListener('click', handleAction));

    const search = root.querySelector('#socialSearchInput');
    if (search) { let timer; search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.searchQuery = search.value; render(); const next = document.querySelector('#socialSearchInput'); next?.focus(); }, 180); }); }
    const friendsSearch = root.querySelector('#socialFriendsSearch');
    if (friendsSearch) friendsSearch.addEventListener('input', () => { state.friendsSearchQuery = friendsSearch.value; const modalList = root.querySelector('.social-modal-list'); if (modalList) render(); });
    const friendsDrawerSearch = root.querySelector('#socialFriendsDrawerSearch');
    if (friendsDrawerSearch) friendsDrawerSearch.addEventListener('input', () => { state.friendsSearchQuery = friendsDrawerSearch.value; render(); const next = document.querySelector('#socialFriendsDrawerSearch'); next?.focus(); });
    const mobileSearch = root.querySelector('#socialMobileSearch');
    if (mobileSearch) mobileSearch.addEventListener('input', () => { state.searchQuery = mobileSearch.value; render(); const next = document.querySelector('#socialMobileSearch'); next?.focus(); });

    const imageInput = root.querySelector('#socialPostImage');
    if (imageInput) imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0]; const status = root.querySelector('#socialComposerStatus');
      if (!file) return;
      const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
      const isVideo = /^video\/(mp4|webm)$/.test(file.type);
      if (!isImage && !isVideo) { if(status) status.textContent='Choose a JPG, PNG, WebP, MP4 or WebM file.'; imageInput.value=''; return; }
      if (isVideo && !state.postingStatus?.admin) { if(status) status.textContent='Only admins can publish video.'; imageInput.value=''; return; }
      if (file.size > (isVideo ? 8 : 5)*1024*1024) { if(status) status.textContent=isVideo?'Video must be 8 MB or smaller.':'Image must be 5 MB or smaller.'; imageInput.value=''; return; }
      const reader = new FileReader(); reader.onload = () => {
        if (isVideo) { state.selectedVideo=String(reader.result); state.selectedImage=null; }
        else { state.selectedImage=String(reader.result); state.selectedVideo=null; }
        state.selectedImageName=file.name; if(status) status.textContent=''; render();
      }; reader.readAsDataURL(file);
    });
    const form = root.querySelector('#socialPostForm');
    if (form) form.addEventListener('submit', publishPost);
  }

  function handleAction(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const action = button.dataset.socialAction;
    if (action === 'toggle-sidebar') state.sidebarCollapsed=!state.sidebarCollapsed;
    else if (action === 'toggle-mobile-nav') state.mobileNavOpen=!state.mobileNavOpen;
    else if (action === 'back-home') { state.activePage='home'; state.mobileNavOpen=false; }
    else if (action === 'set-feed-filter') state.feedFilter=button.dataset.filter;
    else if (action === 'toggle-mobile-search') { state.searchExpanded=!state.searchExpanded; if(!state.searchExpanded) state.searchQuery=''; }
    else if (action === 'open-mobile-composer') { state.mobileNavOpen=false; document.querySelector('#forumMainColumn')?.scrollTo?.({top:0,behavior:'smooth'}); document.querySelector('#socialPostTitle')?.focus(); }
    else if (action === 'toggle-friends') state.friendsCollapsed=!state.friendsCollapsed;
    else if (action === 'open-mobile-sidebar') state.mobileSidebarOpen=true;
    else if (action === 'close-mobile-sidebar') state.mobileSidebarOpen=false;
    else if (action === 'open-mobile-friends') state.mobileFriendsOpen=true;
    else if (action === 'close-mobile-friends') state.mobileFriendsOpen=false;
    else if (action === 'open-friends-modal') { state.friendsSearchQuery=''; state.friendsModalOpen=true; }
    else if (action === 'close-friends-modal') state.friendsModalOpen=false;
    else if (action === 'open-image') state.imageViewer=button.dataset.image;
    else if (action === 'close-image') state.imageViewer=null;
    else if (action === 'clear-search') state.searchQuery='';
    else if (action === 'remove-image') { state.selectedImage=null; state.selectedVideo=null; state.selectedImageName=''; }
    else if (action === 'reset-composer') { state.selectedImage=null; state.selectedImageName=''; resetComposerFields(); }
    else if (action === 'react') { const post=posts.find(p=>p.id===button.dataset.postId); if(post){post.reacted=!post.reacted; post.reactionCount+=post.reacted?1:-1;} }
    else if (action === 'share') { const url=`${location.origin}${location.pathname}#/forum`; navigator.clipboard?.writeText(url).catch(()=>{}); }
    else if (action === 'comment') {
      // Toggle comments section for this post
      const postId = button.dataset.postId;
      state.showCommentsFor = state.showCommentsFor === postId ? null : postId;
    }
    else if (action === 'toggle-post-copy') { button.closest('.social-post-content')?.classList.toggle('is-expanded'); button.textContent=button.closest('.social-post-content')?.classList.contains('is-expanded')?'Show less':'Read more'; }
    else if (action === 'refresh-feed') { state.loading=true; render(); setTimeout(()=>{state.loading=false;render();},600); return; }
    else if (action === 'post-menu') {
      // Toggle More menu for this post
      const postId = button.dataset.postId;
      state.showMoreFor = state.showMoreFor === postId ? null : postId;
    }
    else if (action === 'open-profile') {
      const username = button.dataset.username;
      if (username) location.hash = `#/profile/${encodeURIComponent(username)}`;
    }
    else if (action === 'report') {
      alert('Report post feature coming soon.');
    }
    render();
  }

  let outsideMenuListenerBound = false;
  function closeMoreMenuOnOutsideClick(event) {
    if (state.showMoreFor && !event.target.closest('.social-more-menu-wrap')) {
      state.showMoreFor = null;
      render();
    }
  }

  function resetComposerFields() { const title=document.getElementById('socialPostTitle'); const body=document.getElementById('socialPostBody'); if(title) title.value=''; if(body) body.value=''; }

  async function publishPost(event) {
    event.preventDefault();
    const root=document.getElementById('view-forum');
    const title=root?.querySelector('#socialPostTitle')?.value.trim();
    const body=root?.querySelector('#socialPostBody')?.value.trim();
    const status=root?.querySelector('#socialComposerStatus');
    const button=root?.querySelector('#socialPublishButton');
    if (!title || !body) { if(status) status.textContent=!title?'Add a title for your post.':'Add a description for your post.'; return; }
    if(state.submitted) return;
    state.submitted=true; if(button) button.disabled=true; if(status) status.textContent='Publishing…';
    try {
      const r = await fetch('/api/posts', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({ title, body, kind: 'community', image: state.selectedImage || null, video: state.selectedVideo || null })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 429) status.textContent='Daily post limit reached. You can post again after the reset.';
        else if (data.error === 'bad_image') status.textContent='That image format or size is not supported.';
        else status.textContent='Post could not be published. Please try again.';
        state.submitted=false; if(button) button.disabled=false; return;
      }
      state.selectedImage=null; state.selectedVideo=null; state.selectedImageName=''; state.submitted=false;
      if (!state.postingStatus?.admin) state.dailyLimitReached=true;
      resetComposerFields(); await loadPosts(); render();
    } catch {
      state.submitted=false; if(button) button.disabled=false; if(status) status.textContent='Post could not be published. Please try again.';
    }
  }

  function onKeydown(event) { if(event.key==='Escape'){if(state.friendsModalOpen||state.imageViewer||state.mobileSidebarOpen||state.mobileFriendsOpen||state.mobileNavOpen||state.searchExpanded){state.friendsModalOpen=false;state.imageViewer=null;state.mobileSidebarOpen=false;state.mobileFriendsOpen=false;state.mobileNavOpen=false;state.searchExpanded=false;render();}} }

  async function loadPostingStatus() {
    try {
      const r = await fetch('/api/posts/posting-status', { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } });
      if (!r.ok) return;
      state.postingStatus = await r.json();
      state.dailyLimitReached = !!state.postingStatus.limitReached;
    } catch {}
  }

  function init() { document.removeEventListener('keydown',onKeydown); document.addEventListener('keydown',onKeydown); Promise.all([loadPosts(), loadFriends(), loadPostingStatus()]).finally(() => render()); }
  return { init, render };
})();
