// WealthWise Auth System v2
// Supports email/password + Google OAuth
// Data stored in localStorage per user

const WW = {

  // ── Session ──
  getSession() {
    try { return JSON.parse(localStorage.getItem('ww_session')); } catch(e) { return null; }
  },
  setSession(user) {
    localStorage.setItem('ww_session', JSON.stringify({
      id: user.id, name: user.name, email: user.email,
      picture: user.picture||null, loginMethod: user.loginMethod||'email',
      ts: Date.now()
    }));
  },
  clearSession() { localStorage.removeItem('ww_session'); },
  isLoggedIn() {
    const s = this.getSession();
    if (!s) return false;
    if (Date.now() - s.ts > 7 * 24 * 3600 * 1000) { this.clearSession(); return false; }
    return true;
  },

  // ── Users ──
  getUsers() {
    try { return JSON.parse(localStorage.getItem('ww_users')) || []; } catch(e) { return []; }
  },
  saveUsers(users) { localStorage.setItem('ww_users', JSON.stringify(users)); },
  findUser(email) {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  findUserById(id) { return this.getUsers().find(u => u.id === id); },

  // ── Password hash (simple, client-side only) ──
  hashPassword(pwd) {
    let hash = 0;
    const str = pwd + 'wealthwise_salt_2026';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  // ── Register (email/password) ──
  register(name, email, password) {
    if (!name || !email || !password) return {ok:false, msg:'All fields are required.'};
    if (password.length < 6) return {ok:false, msg:'Password must be at least 6 characters.'};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false, msg:'Please enter a valid email address.'};
    if (this.findUser(email)) return {ok:false, msg:'An account with this email already exists. Please sign in.'};
    const users = this.getUsers();
    const user = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: name.trim(), email: email.trim().toLowerCase(),
      password: this.hashPassword(password),
      createdAt: new Date().toISOString(),
      isAdmin: users.length === 0,
      loginMethod: 'email'
    };
    users.push(user);
    this.saveUsers(users);
    this.setSession(user);
    return {ok:true, user};
  },

  // ── Login (email/password) ──
  login(email, password) {
    if (!email || !password) return {ok:false, msg:'Email and password are required.'};
    const user = this.findUser(email);
    if (!user) return {ok:false, msg:'No account found with this email.'};
    if (user.loginMethod === 'google') return {ok:false, msg:'This account uses Google Sign-In. Please use the Google button above.'};
    if (user.password !== this.hashPassword(password)) return {ok:false, msg:'Incorrect password. Please try again.'};
    this.setSession(user);
    return {ok:true, user};
  },

  // ── Google login / register ──
  googleLogin(googleUser) {
    const { id, name, email, picture, sub } = googleUser;
    let user = this.findUser(email);
    if (!user) {
      const users = this.getUsers();
      user = {
        id: 'g_' + (sub || id || Date.now()),
        name, email: email.toLowerCase(),
        password: null,
        createdAt: new Date().toISOString(),
        isAdmin: users.length === 0,
        picture, loginMethod: 'google', googleId: sub||id
      };
      users.push(user);
      this.saveUsers(users);
    }
    this.setSession(user);
    return {ok:true, user};
  },

  // ── Per-user data ──
  getUserDataKey(userId) { return 'ww_data_' + userId; },
  getUserData(userId) {
    try { return JSON.parse(localStorage.getItem(this.getUserDataKey(userId))); } catch(e) { return null; }
  },
  saveUserData(userId, data) {
    localStorage.setItem(this.getUserDataKey(userId), JSON.stringify(data));
  },

  // ── Logout ──
  logout() { this.clearSession(); window.location.href = 'login.html'; }
};

(function installWealthWiseAssistant(){
  if (!/app\.html?$/.test(window.location.pathname)) return;

  const css = `
  .ai-shell{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;align-items:start}
  .ai-chat{background:white;border:1px solid var(--paper-mid);border-radius:var(--rl);min-height:560px;display:flex;flex-direction:column;overflow:hidden}
  .ai-log{flex:1;padding:1rem;overflow-y:auto;display:flex;flex-direction:column;gap:8px;background:linear-gradient(180deg,#fff,#faf9f6)}
  .ai-msg{max-width:82%;padding:.65rem .75rem;border-radius:var(--r);font-size:.82rem;line-height:1.5;white-space:pre-wrap}
  .ai-msg.user{align-self:flex-end;background:var(--accent);color:white}.ai-msg.assistant{align-self:flex-start;background:var(--paper-warm);color:var(--ink)}
  .ai-msg.system{align-self:center;background:var(--info-bg);color:var(--info);font-size:.74rem;max-width:92%}
  .ai-compose{border-top:1px solid var(--paper-mid);padding:.75rem;display:grid;grid-template-columns:1fr auto;gap:8px;background:white}
  .ai-compose textarea{min-height:48px;max-height:120px;resize:vertical;border:1.5px solid var(--paper-mid);border-radius:var(--r);padding:.6rem;font-family:var(--sans);font-size:.82rem}
  .ai-side{display:flex;flex-direction:column;gap:10px}.ai-panel{background:white;border:1px solid var(--paper-mid);border-radius:var(--rl);padding:.9rem}
  .ai-panel h3{font-size:.74rem;font-weight:600;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.55rem}
  .ai-upload{border:1px dashed var(--paper-mid);border-radius:var(--r);padding:.8rem;background:var(--paper);display:flex;flex-direction:column;gap:7px}
  .ai-upload input{font-size:.78rem}.ai-review{display:flex;flex-direction:column;gap:8px}
  .ai-review-row{border:1px solid var(--paper-mid);border-radius:var(--r);padding:.65rem;background:var(--paper)}
  .ai-review-row textarea{width:100%;min-height:86px;border:1px solid var(--paper-mid);border-radius:var(--r);padding:.45rem;font-family:ui-monospace,Consolas,monospace;font-size:.72rem;margin-top:.45rem}
  .ai-chip-row{display:flex;gap:6px;flex-wrap:wrap}.ai-chip{border:1px solid var(--paper-mid);background:white;color:var(--ink-soft);border-radius:999px;padding:.25rem .55rem;font-size:.72rem;cursor:pointer}
  .ai-chip:hover{border-color:var(--accent);color:var(--accent)}.ai-status{font-size:.72rem;color:var(--ink-muted);min-height:1rem}
  @media(max-width:900px){.ai-shell{grid-template-columns:1fr}.ai-msg{max-width:94%}}@media(max-width:768px){.ai-compose{grid-template-columns:1fr}}
  `;

  const html = `
  <div class="page" id="page-assistant">
    <div class="ph"><div><div class="pt">AI Assistant</div><div class="ps">Ask about your portfolio, upload screenshots, then review before saving</div></div></div>
    <div class="ai-shell">
      <section class="ai-chat"><div class="ai-log" id="ai-log"></div><div class="ai-compose"><textarea id="ai-input" placeholder="Ask about your portfolio or upload a screenshot..."></textarea><button class="add-btn" onclick="sendAiMessage()">Send</button></div></section>
      <aside class="ai-side">
        <div class="ai-panel"><h3>Screenshot import</h3><div class="ai-upload"><select id="ai-import-type"><option value="auto">Auto detect</option><option value="stocks">Stock holdings</option><option value="fds">Fixed deposits</option><option value="expenses">Expenses</option></select><input id="ai-image" type="file" accept="image/*"><button class="add-btn" onclick="extractAiImage()">Extract from image</button><div class="ai-status" id="ai-status"></div></div></div>
        <div class="ai-panel"><h3>Quick questions</h3><div class="ai-chip-row"><button class="ai-chip" onclick="askAiQuick('Summarise my current net worth and top risks.')">Net worth summary</button><button class="ai-chip" onclick="askAiQuick('Which stock holdings should I review first?')">Stocks to review</button><button class="ai-chip" onclick="askAiQuick('Show my FD and bank deposit summary.')">FD summary</button><button class="ai-chip" onclick="askAiQuick('Summarise my recent expenses.')">Expenses</button></div></div>
        <div class="ai-panel"><h3>Review queue</h3><div class="ai-review" id="ai-review"><div class="empty">No extracted records waiting for review.</div></div></div>
      </aside>
    </div>
  </div>`;

  function ready(fn){ document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn(); }
  ready(() => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const sidebar = document.querySelector('.sidebar');
    const reportBtn = Array.from(document.querySelectorAll('.nav-item')).find(b => b.getAttribute('onclick') === "goTo('report')");
    if (sidebar && reportBtn && !document.querySelector("[onclick=\"goTo('assistant')\"]")) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.setAttribute('onclick', "goTo('assistant')");
      btn.innerHTML = '<span class="ni">AI</span>AI Assistant';
      sidebar.insertBefore(btn, reportBtn);
    }
    const main = document.querySelector('.main');
    if (main && !document.getElementById('page-assistant')) {
      main.insertAdjacentHTML('beforeend', html);
    }
    patchNavigation();
    recoverLocalWealthWiseData();
    renderAi();
    syncWealthWiseData('read').then(j => {
      if (j && j.data && typeof D !== 'undefined' && dataScore(j.data) > dataScore(D)) {
        Object.keys(D).forEach(k => delete D[k]);
        Object.assign(D, j.data);
        ensureAiDataShape();
        try { WW.saveUserData(WW.getSession().id, D); } catch(e) {}
        if (typeof renderAll === 'function') renderAll();
      }
    }).catch(() => {});
  });

  let AI_MESSAGES = [];
  let AI_PENDING = [];

  function patchNavigation(){
    if (window.__wwAiNavPatched) return;
    window.__wwAiNavPatched = true;
    const original = window.goTo;
    window.goTo = function(page){
      if (page === 'assistant') {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.getElementById('page-assistant')?.classList.add('active');
        document.querySelector("[onclick=\"goTo('assistant')\"]")?.classList.add('active');
        renderAi();
        return;
      }
      return original(page);
    };
  }

  function ensureAiDataShape(){
    if (typeof D === 'undefined') return;
    ['stocks','mf','crypto','otherInv','banks','fds','loans','cards','expenses'].forEach(k => { if (!Array.isArray(D[k])) D[k] = []; });
    if (!D.settings) D.settings = { baseCur: 'INR' };
  }

  function dataScore(data){
    if (!data || typeof data !== 'object') return 0;
    return ['stocks','mf','crypto','otherInv','banks','fds','loans','cards','expenses']
      .reduce((sum, key) => sum + (Array.isArray(data[key]) ? data[key].length : 0), 0);
  }

  function recoverLocalWealthWiseData(){
    if (typeof D === 'undefined') return;
    ensureAiDataShape();
    if (dataScore(D) > 0) return;
    const user = WW.getSession();
    if (!user) return;
    let best = null;
    let bestScore = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('ww_data_')) continue;
        const candidate = JSON.parse(localStorage.getItem(key) || 'null');
        const score = dataScore(candidate);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best && bestScore > 0) {
        Object.keys(D).forEach(k => delete D[k]);
        Object.assign(D, best);
        ensureAiDataShape();
        WW.saveUserData(user.id, D);
        if (typeof renderAll === 'function') renderAll();
      }
    } catch(e) {}
  }

  function aiPortfolioContext(){
    ensureAiDataShape();
    return {
      baseCurrency: typeof BASE_CUR !== 'undefined' ? BASE_CUR : 'INR',
      totals: typeof totals === 'function' ? totals() : {},
      stocks: D.stocks || [],
      fixedDeposits: D.fds || [],
      bankAccounts: D.banks || [],
      expenses: D.expenses || [],
      liabilities: { loans: D.loans || [], cards: D.cards || [] }
    };
  }

  function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
  function gv(id){ return document.getElementById(id)?.value?.trim() || ''; }
  function setAiStatus(msg){ const el = document.getElementById('ai-status'); if (el) el.textContent = msg || ''; }

  function renderAi(){
    const log = document.getElementById('ai-log');
    if (!log) return;
    ensureAiDataShape();
    if (AI_MESSAGES.length === 0) AI_MESSAGES = [{role:'assistant',content:'Hi. Upload a stock, FD, or expense screenshot and I will extract the records for review. I can also answer questions using the data already in WealthWise.'}];
    log.innerHTML = AI_MESSAGES.map(m => `<div class="ai-msg ${m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant'}">${escapeHtml(m.content)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    renderAiReview();
  }

  function readImageAsDataUrl(file){
    return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(file); });
  }

  function normalizeAiRecord(type, r){
    const n = Number;
    if (type === 'stock') return { sym: (r.sym || r.symbol || r.name || '').toString().toUpperCase(), qty: n(r.qty || r.quantity || 0), avg: n(r.avg || r.averagePrice || r.buyPrice || 0), ltp: n(r.ltp || r.currentPrice || r.currentValuePerShare || 0) || null, cur: r.cur || r.currency || 'INR', exch: r.exch || r.exchange || 'NSE (India)', note: r.note || 'Imported by AI' };
    if (type === 'fd') return { bank: r.bank || r.institution || '', dtype: r.dtype || r.depositType || 'Fixed Deposit (FD)', prin: n(r.prin || r.principal || r.amount || 0), rate: n(r.rate || r.interestRate || 0), matamt: n(r.matamt || r.maturityAmount || r.currentValue || r.prin || 0), start: r.start || r.startDate || '', matdate: r.matdate || r.maturityDate || '', cur: r.cur || r.currency || 'INR', note: r.note || 'Imported by AI' };
    return { date: r.date || new Date().toISOString().slice(0,10), merchant: r.merchant || r.description || '', category: r.category || 'Uncategorised', amount: n(r.amount || 0), cur: r.cur || r.currency || 'AED', note: r.note || 'Imported by AI' };
  }

  function renderAiReview(){
    const el = document.getElementById('ai-review');
    if (!el) return;
    if (!AI_PENDING.length) { el.innerHTML = '<div class="empty">No extracted records waiting for review.</div>'; return; }
    el.innerHTML = AI_PENDING.map((p, i) => `<div class="ai-review-row"><div><strong>${escapeHtml(p.type)}</strong>${p.confidence ? ` <span class="badge b-info">${Math.round(p.confidence * 100)}%</span>` : ''}</div><textarea id="ai-pending-${i}">${escapeHtml(JSON.stringify(p.record, null, 2))}</textarea><div class="mact"><button class="btn-cancel" onclick="cancelAiPending(${i})">Cancel</button><button class="btn-save" onclick="confirmAiPending(${i})">Confirm save</button></div></div>`).join('');
  }

  async function syncWealthWiseData(mode){
    const user = WW.getSession();
    if (!user) return null;
    try {
      const r = await fetch('/api/wealthwise-assistant', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'sync', mode, user:{ id:user.id, email:user.email, name:user.name }, data: typeof D !== 'undefined' ? D : {} }) });
      return r.ok ? await r.json() : null;
    } catch(e) { return null; }
  }

  window.askAiQuick = function(text){ document.getElementById('ai-input').value = text; window.sendAiMessage(); };
  window.sendAiMessage = async function(){
    const input = document.getElementById('ai-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    AI_MESSAGES.push({role:'user', content:text});
    renderAi();
    setAiStatus('Thinking...');
    try {
      const r = await fetch('/api/wealthwise-assistant', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'chat', message:text, messages:AI_MESSAGES.slice(-8), context:aiPortfolioContext() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Assistant request failed');
      AI_MESSAGES.push({role:'assistant', content:j.reply || 'Done.'});
    } catch(e) {
      AI_MESSAGES.push({role:'assistant', content:'AI service needs configuration: ' + (e?.message || 'WEALTHWISE_OPENAI_API_KEY is not configured in Netlify.')});
    }
    setAiStatus('');
    renderAi();
  };

  window.extractAiImage = async function(){
    const file = document.getElementById('ai-image').files[0];
    if (!file) { setAiStatus('Choose an image first.'); return; }
    setAiStatus('Reading screenshot...');
    try {
      const image = await readImageAsDataUrl(file);
      setAiStatus('Extracting records...');
      const r = await fetch('/api/wealthwise-assistant', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'extract', importType:gv('ai-import-type') || 'auto', image, context:aiPortfolioContext() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Extraction failed');
      AI_PENDING = (j.records || []).map((record, idx) => ({ id:'p_' + Date.now() + '_' + idx, type:record.type, record:normalizeAiRecord(record.type, record.data || record), confidence:record.confidence || null }));
      AI_MESSAGES.push({role:'assistant', content:j.summary || `I found ${AI_PENDING.length} record(s). Please review each one before saving.`});
      setAiStatus(AI_PENDING.length ? 'Review the extracted records below.' : 'No records found.');
    } catch(e) {
      setAiStatus('Extraction failed.');
      AI_MESSAGES.push({role:'assistant', content:'I could not extract that screenshot. Please try a clearer image or choose the import type manually.'});
    }
    renderAi();
  };

  window.cancelAiPending = function(i){ AI_PENDING.splice(i, 1); renderAiReview(); };
  window.confirmAiPending = function(i){
    const item = AI_PENDING[i];
    try { item.record = JSON.parse(document.getElementById('ai-pending-' + i).value); } catch(e) { alert('Please fix the JSON before saving.'); return; }
    ensureAiDataShape();
    if (item.type === 'stock') D.stocks.push(item.record);
    else if (item.type === 'fd') D.fds.push(item.record);
    else D.expenses.push(item.record);
    AI_PENDING.splice(i, 1);
    if (typeof saveData === 'function') saveData();
    syncWealthWiseData('write').catch(() => {});
    if (typeof renderAll === 'function') renderAll();
    AI_MESSAGES.push({role:'system', content:'Saved one ' + item.type + ' record after confirmation.'});
    renderAi();
  };
})();
