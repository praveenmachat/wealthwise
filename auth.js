// Verified Supabase accounts and per-account cloud profiles.
const WW = {
  url: 'https://rblslvckvcanqrpdstix.supabase.co',
  key: 'sb_publishable_Z5oSDw7-gn-jeUHGS4tZUA_1gKKd0Ae',
  revision: null,
  saveChain: Promise.resolve(),
  refreshFlight: null,
  getSession() {
    try {
      const session = JSON.parse(localStorage.getItem('ww_verified_session'));
      if (!session?.access_token || !session?.user?.id) return null;
      return { ...session, id: session.user.id, email: session.user.email,
        name: session.user.user_metadata?.full_name || session.user.email };
    } catch { return null; }
  },
  setSession(session) { localStorage.setItem('ww_verified_session', JSON.stringify(session)); },
  clearSession() { localStorage.removeItem('ww_verified_session'); },
  isLoggedIn() { return Boolean(this.getSession()); },
  getUsers() { return []; },
  getUserDataKey(id) { return 'ww_verified_data_' + id; },
  getUserData(id) {
    try { return JSON.parse(localStorage.getItem(this.getUserDataKey(id))); } catch { return null; }
  },
  status(message, failed = false) {
    let el = document.getElementById('cloud-status');
    if (!el) {
      el = document.createElement('div'); el.id = 'cloud-status'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;padding:10px 14px;background:#fff;border:1px solid #aaa;border-radius:8px;max-width:400px';
      document.body.append(el);
    }
    el.textContent = message; el.style.color = failed ? '#b91c1c' : '#166534';
  },
  async token() {
    const session = this.getSession();
    if (!session) throw new Error('Sign in to save your portfolio.');
    if (session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
    if (!this.refreshFlight) this.refreshFlight = this.authRequest('/token?grant_type=refresh_token',
      { refresh_token: session.refresh_token }).then(next => {
        if (this.getSession()?.id !== session.id) throw new Error('Your account changed. Reload the page.');
        this.setSession(next); return next.access_token;
      }).finally(() => { this.refreshFlight = null; });
    return this.refreshFlight;
  },
  async authRequest(path, body) {
    const response = await fetch(this.url + '/auth/v1' + path, {
      method:'POST', headers:{ apikey:this.key, 'Content-Type':'application/json' },
      body:JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.msg || result.error_description || result.message || 'Sign-in failed.');
    return result;
  },
  async login(email, password) {
    const session = await this.authRequest('/token?grant_type=password', {email,password});
    this.setSession(session); return this.getSession();
  },
  async register(name,email,password) {
    const result = await this.authRequest('/signup', {email,password,data:{full_name:name}});
    if (result.access_token) this.setSession(result);
    return result;
  },
  async rpc(name, body = {}) {
    const token = await this.token();
    const response = await fetch(this.url + '/rest/v1/rpc/' + name, {
      method:'POST', headers:{apikey:this.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Cloud connection failed.');
    return result;
  },
  async loadProfile() {
    const id = this.getSession()?.id;
    const profile = await this.rpc('wealthwise_load_profile');
    if (this.getSession()?.id !== id) throw new Error('Your account changed. Reload the page.');
    this.revision = profile.revision;
    localStorage.setItem(this.getUserDataKey(id), JSON.stringify(profile.data));
    return profile.data;
  },
  saveUserData(id, data) {
    if (id !== this.getSession()?.id) throw new Error('The signed-in account changed.');
    const snapshot = JSON.parse(JSON.stringify(data));
    const write = this.saveChain.then(async () => {
      if (id !== this.getSession()?.id) throw new Error('The signed-in account changed.');
      if (this.revision === null) throw new Error('Reload to reconnect before saving.');
      this.status('Saving to your database…');
      try {
        this.revision = await this.rpc('wealthwise_save_profile', {profile_data:snapshot,expected_revision:this.revision});
        localStorage.setItem(this.getUserDataKey(id), JSON.stringify(snapshot));
        this.status('Saved to your database');
      } catch (error) {
        this.revision = null;
        throw error;
      }
    });
    this.saveChain = write.catch(error => this.status(error.message, true));
    return write;
  },
  async apiRequestLegacy(options) { return this.api(JSON.parse(options.body)); },
  async api(body) {
    return fetch('/api/wealthwise-assistant', {method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+await this.token()},
      body:JSON.stringify(body)});
  },
  logout() { this.clearSession(); window.location.href='login.html'; }
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


    renderAi();

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

  async function syncWealthWiseData(mode) {
    if (mode === 'write' && typeof D !== 'undefined') return WW.saveUserData(WW.getSession().id,D);
    return null;
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
      const r = await WW.apiRequestLegacy({ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'chat', message:text, messages:AI_MESSAGES.slice(-8), context:aiPortfolioContext() }) });
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
      const r = await WW.apiRequestLegacy({ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'extract', importType:gv('ai-import-type') || 'auto', image, context:aiPortfolioContext() }) });
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
