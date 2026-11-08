'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    open: false,
    messages: [],
    sending: false,
  };

  const safeText = (value) => String(value ?? '');
  const esc = (value) => safeText(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function ensureOpen() {
    const panel = $('aiPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    state.open = true;
    const text = $('aiInput');
    setTimeout(() => text && text.focus(), 80);
    renderMessages();
  }

  function closePanel() {
    const panel = $('aiPanel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    state.open = false;
    $('aiFab')?.focus();
  }

  function renderMessages() {
    const list = $('aiMessages');
    if (!list) return;
    const html = state.messages.map((msg) => {
      const side = msg.role === 'assistant' ? 'justify-start' : 'justify-end';
      const bubble = msg.role === 'assistant' ? 'bg-white text-ink border border-line' : 'bg-ink text-white';
      return `<div class="flex ${side}"><div class="max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${bubble}">${esc(msg.content).replace(/\n/g, '<br>')}</div></div>`;
    }).join('');
    list.innerHTML = html || '<p class="text-sm text-muted">Ask me about a topic, a chapter, or how to study.</p>';
    list.scrollTop = list.scrollHeight;
  }

  function pushMessage(role, content) {
    state.messages.push({ role, content });
    renderMessages();
  }

  async function sendPrompt(content) {
    const next = content.trim();
    if (!next || state.sending) return;
    state.sending = true;
    $('aiSend').disabled = true;
    pushMessage('user', next);
    $('aiInput').value = '';
    const typing = $('aiTyping');
    if (typing) typing.classList.remove('hidden');

    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({
          messages: state.messages.slice(-10),
          context: window.M500.context(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data && data.error === 'rate_limited' ? 'You are asking very quickly. Please wait a few minutes.' : data && data.error === 'ai_unavailable' ? 'The assistant is not set up yet.' : 'Something went wrong. Please try again.');
      }
      pushMessage('assistant', data.reply || 'Sorry, I could not answer that.');
    } catch (err) {
      pushMessage('assistant', err.message || 'Something went wrong. Please try again.');
    } finally {
      state.sending = false;
      $('aiSend').disabled = false;
      if (typing) typing.classList.add('hidden');
    }
  }

  function attachEvents() {
    $('aiFab')?.addEventListener('click', () => {
      if (state.open) closePanel(); else ensureOpen();
    });
    $('aiClose')?.addEventListener('click', closePanel);
    $('aiSend')?.addEventListener('click', () => sendPrompt($('aiInput').value));
    $('aiInput')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendPrompt($('aiInput').value);
      }
      if (event.key === 'Escape') closePanel();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.open) closePanel();
    });
    document.querySelectorAll('[data-ai-suggest]').forEach((button) => {
      button.addEventListener('click', () => sendPrompt(button.dataset.aiSuggest));
    });
  }

  function buildUI() {
    const existing = $('aiPanel');
    if (existing) return;
    const panel = document.createElement('div');
    panel.id = 'aiPanel';
    panel.className = 'fixed inset-x-0 bottom-0 z-[60] hidden flex-col rounded-t-[32px] border border-line bg-bg shadow-2xl md:bottom-6 md:right-6 md:left-auto md:w-[380px] md:rounded-[28px]';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'aiTitle');
    panel.innerHTML = `
      <div class="flex items-center justify-between border-b border-line px-4 py-3 md:px-5">
        <div class="flex items-center gap-2">
          <span class="grid h-9 w-9 place-items-center rounded-xl bg-ink text-volt"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg></span>
          <h2 id="aiTitle" class="font-display text-xl font-extrabold">Study assistant</h2>
        </div>
        <button id="aiClose" type="button" aria-label="Close assistant" class="grid h-10 w-10 place-items-center rounded-full border border-line text-muted hover:bg-ink hover:text-white">✕</button>
      </div>
      <div class="flex flex-wrap gap-2 border-b border-line p-3 md:p-4">
        <button type="button" data-ai-suggest="Explain this topic simply" class="rounded-full border border-line bg-white px-3 py-2 text-xs font-bold text-ink">Explain this topic simply</button>
        <button type="button" data-ai-suggest="Give me 3 practice questions" class="rounded-full border border-line bg-white px-3 py-2 text-xs font-bold text-ink">Give me 3 practice questions</button>
        <button type="button" data-ai-suggest="How should I study this?" class="rounded-full border border-line bg-white px-3 py-2 text-xs font-bold text-ink">How should I study this?</button>
      </div>
      <div id="aiMessages" class="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite"></div>
      <div id="aiTyping" class="hidden px-4 pb-2 text-sm text-muted">Typing…</div>
      <div class="border-t border-line p-3 md:p-4">
        <label class="sr-only" for="aiInput">Ask the AI</label>
        <textarea id="aiInput" rows="3" maxlength="1000" class="w-full resize-none rounded-2xl border border-line bg-white p-3 text-sm text-ink outline-none focus:border-ink" placeholder="Ask about a topic or exam strategy..."></textarea>
        <div class="mt-3 flex items-center justify-between gap-3">
          <p class="text-[11px] text-muted">AI can make mistakes. Check important facts in your textbook.</p>
          <button id="aiSend" type="button" class="inline-flex min-h-[44px] items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-cyan disabled:opacity-50">Send</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    const fab = document.createElement('button');
    fab.id = 'aiFab';
    fab.type = 'button';
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-label', 'Ask the AI study assistant');
    fab.className = 'fixed right-4 z-50 grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-ink text-volt shadow-xl shadow-black/20 hover:bg-cyan md:bottom-6 md:right-6';
    fab.style.bottom = 'calc(env(safe-area-inset-bottom) + 76px)';
    fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
    document.body.appendChild(fab);
    attachEvents();
  }

  if (window.location.pathname === '/login.html') return;
  buildUI();
})();
