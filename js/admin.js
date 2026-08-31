import { CONFIG, isAuthConfigured } from './config.js';
import { t, getLang, subscribe } from './i18n/index.js';
import { signIn, signOut, getSession, fetchLeads, updateLeadStatus, deleteLead, getMFAStatus, getFactors, challengeMFA, verifyMFA, enrollMFA, unEnrollMFA } from './backend.js';
import { escapeHtml, showToast, formatDate } from './ui.js';

export class Admin {
  constructor(root) {
    this.root = root;
    this.login = root.querySelector('#adminLogin');
    this.dashboard = root.querySelector('#adminDashboard');
    this.notConfigured = root.querySelector('#adminNotConfigured');

    this.loginForm = root.querySelector('#adminLoginForm');
    this.userInput = root.querySelector('#adminUser');
    this.passwordInput = root.querySelector('#adminPassword');
    this.loginBtn = root.querySelector('#adminLoginBtn');
    this.loginError = root.querySelector('#adminLoginError');
    this.backBtn = root.querySelector('#adminBackBtn');

    this.mfaSection = root.querySelector('#mfaSection');
    this.mfaForm = root.querySelector('#mfaForm');
    this.mfaCodeInput = root.querySelector('#mfaCode');
    this.mfaVerifyBtn = root.querySelector('#mfaVerifyBtn');
    this.mfaError = root.querySelector('#mfaError');
    this.mfaBackBtn = root.querySelector('#mfaBackBtn');

    this.mfaSetupSection = root.querySelector('#mfaSetupSection');
    this.mfaSetupQr = root.querySelector('#mfaSetupQr');
    this.mfaSetupSecret = root.querySelector('#mfaSetupSecret');
    this.mfaSetupCode = root.querySelector('#mfaSetupCode');
    this.mfaSetupBtn = root.querySelector('#mfaSetupBtn');
    this.mfaSetupError = root.querySelector('#mfaSetupError');
    this.mfaSetupBack = root.querySelector('#mfaSetupBack');

    this.logoutBtn = root.querySelector('#adminLogout');
    this.welcome = root.querySelector('#adminWelcome');
    this.statsEl = root.querySelector('#adminStats');
    this.filtersEl = root.querySelector('#adminFilters');
    this.loaderEl = root.querySelector('#adminLoader');
    this.emptyEl = root.querySelector('#adminEmpty');
    this.errorEl = root.querySelector('#adminError');
    this.listEl = root.querySelector('#leadsList');

    this.leads = [];
    this.filter = 'all';
    this.loading = false;

    this.bind();
    subscribe(() => { if (!this.root.hidden && !this.dashboard.hidden) this.render(); });
  }

  bind() {
    this.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.doLogin();
    });
    this.backBtn.addEventListener('click', () => { location.hash = '#/'; });
    this.logoutBtn.addEventListener('click', async () => {
      try { await signOut(); } catch (_) { /* ignore */ }
      this.onSession({ authenticated: false });
    });
    this.mfaForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.doVerifyMFA();
    });
    this.mfaBackBtn.addEventListener('click', () => {
      this.setSection(this.login);
      this.loginError.hidden = true;
    });
    this.mfaSetupForm = root.querySelector('#mfaSetupForm');
    this.mfaSetupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.doVerifySetup();
    });
    this.mfaSetupBack.addEventListener('click', () => {
      this.setSection(this.login);
      this.loginError.hidden = true;
    });
  }

  async show() {
    if (!isAuthConfigured()) {
      this.setSection(this.notConfigured);
      return;
    }
    this.setSection(this.login);
    this.loginError.hidden = true;
    try {
      const session = await getSession();
      this.onSession(session);
    } catch (err) {
      // Fail closed: if the auth layer is unavailable we do NOT assume the
      // visitor is logged in — they only see the login form with an error.
      this.setSection(this.login);
      this.loginError.textContent = this.errorMessage(err.message);
      this.loginError.hidden = false;
    }
  }

  setSection(el) {
    [this.login, this.mfaSection, this.mfaSetupSection, this.dashboard, this.notConfigured].forEach((s) => { s.hidden = s !== el; });
  }

  onSession(session) {
    const authed = Boolean(session?.authenticated);
    this.setSection(authed ? this.dashboard : this.login);
    if (authed) this.loadLeads();
  }

  errorMessage(code) {
    switch (code) {
      case 'unauthorized':
      case 'invalid_credentials': return t('admin.login.error.invalid');
      case 'rate_limited': return t('admin.login.error.rate');
      case 'unavailable': return t('admin.login.error.unavailable');
      default: return t('admin.login.error.generic');
    }
  }

  async doLogin() {
    const login = this.userInput.value.trim();
    const password = this.passwordInput.value;
    let invalid = false;
    const setErr = (name, msg) => {
      const el = this.loginForm.querySelector(`[data-error-for="${name}"]`);
      if (el) { el.textContent = msg; invalid = true; }
    };
    const clear = (name) => { const el = this.loginForm.querySelector(`[data-error-for="${name}"]`); if (el) el.textContent = ''; };
    clear('user'); clear('password'); this.loginError.hidden = true;
    if (!login) setErr('user', t('quote.error.required'));
    if (!password) setErr('password', t('quote.error.required'));
    if (invalid) return;

    this.loginBtn.classList.add('is-loading');
    this.loginBtn.disabled = true;
    try {
      await signIn(login, password);

      const session = await getSession();
      if (!session.authenticated) {
        // Not seen by the backend as the authorized admin at AAL2. This means
        // the admin either has no MFA and can set it up, or has MFA and must
        // complete the challenge. Route accordingly.
        const mfa = await getMFAStatus();
        if (mfa.mfaEnabled) {
          this.showMFA();
        } else {
          this.showMFASetup();
        }
        return;
      }
      this.onSession(session);
    } catch (err) {
      console.error('doLogin error:', err);
      this.loginError.textContent = this.errorMessage(err.message);
      this.loginError.hidden = false;
    } finally {
      this.loginBtn.classList.remove('is-loading');
      this.loginBtn.disabled = false;
    }
  }

  showMFA() {
    this.setSection(this.mfaSection);
    this.mfaError.hidden = true;
    this.mfaCodeInput.value = '';
    this.mfaCodeInput.focus();
  }

  async showMFASetup() {
    this.setSection(this.mfaSetupSection);
    this.mfaSetupError.hidden = true;
    this.mfaSetupCode.value = '';
    this.mfaSetupBtn.disabled = true;
    try {
      // Clean up any half-set-up (unverified) factors first, so a fresh QR
      // code is always generated.
      const existing = await getFactors();
      for (const f of existing) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          try { await unEnrollMFA(f.id); } catch (_) { /* best effort */ }
        }
      }

      const enroll = await enrollMFA();
      this.pendingFactor = enroll.id;
      this.mfaSetupSecret.value = enroll.totp?.secret || '';
      this.mfaSetupQr.src = enroll.totp?.qr_code || '';
      this.mfaSetupBtn.disabled = false;
    } catch (err) {
      console.error('showMFASetup error:', err);
      this.mfaSetupError.textContent = t('admin.mfa.setup.error');
      this.mfaSetupError.hidden = false;
    }
  }

  async doVerifySetup() {
    const code = this.mfaSetupCode.value.replace(/\s/g, '');
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      this.mfaSetupError.textContent = t('admin.mfa.error.invalid');
      this.mfaSetupError.hidden = false;
      return;
    }
    this.mfaSetupBtn.classList.add('is-loading');
    this.mfaSetupBtn.disabled = true;
    try {
      const challenge = await challengeMFA(this.pendingFactor);
      await verifyMFA(this.pendingFactor, challenge.id, code);

      const session = await getSession();
      if (!session.authenticated) {
        // MFA was set up, but the backend still isn't seeing an AAL2 token.
        // Ask them to complete the second step now.
        this.showMFA();
        return;
      }
      this.onSession(session);
    } catch (err) {
      console.error('doVerifySetup error:', err);
      this.mfaSetupError.textContent = t('admin.mfa.error.invalid');
      this.mfaSetupError.hidden = false;
    } finally {
      this.mfaSetupBtn.classList.remove('is-loading');
      this.mfaSetupBtn.disabled = false;
    }
  }

  async doVerifyMFA() {
    const code = this.mfaCodeInput.value.replace(/\s/g, '');
    this.mfaError.hidden = true;
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      this.mfaError.textContent = t('admin.mfa.error.invalid');
      this.mfaError.hidden = false;
      return;
    }

    this.mfaVerifyBtn.classList.add('is-loading');
    this.mfaVerifyBtn.disabled = true;
    try {
      const factors = await getFactors();
      const totp = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');
      if (!totp) {
        // No completed factor found — fall back to (re)enrolling so a fresh
        // QR code with the correct secret is shown.
        this.showMFASetup();
        return;
      }

      const challenge = await challengeMFA(totp.id);
      await verifyMFA(totp.id, challenge.id, code);

      const session = await getSession();
      if (!session.authenticated) {
        this.mfaError.textContent = t('admin.mfa.error.invalid');
        this.mfaError.hidden = false;
        return;
      }
      this.onSession(session);
    } catch (err) {
      console.error('doVerifyMFA error:', err);
      this.mfaError.textContent = t('admin.mfa.error.invalid');
      this.mfaError.hidden = false;
    } finally {
      this.mfaVerifyBtn.classList.remove('is-loading');
      this.mfaVerifyBtn.disabled = false;
    }
  }

  async loadLeads() {
    this.loading = true;
    this.loaderEl.hidden = false;
    this.errorEl.hidden = true;
    try {
      this.leads = await fetchLeads();
      await this.render();
    } catch (err) {
      console.error('loadLeads failed', err);
      if (err.message === 'unauthorized') {
        // Session no longer valid (expired/revoked) -> back to login.
        this.onSession({ authenticated: false });
        this.errorEl.hidden = true;
        return;
      }
      this.errorEl.textContent = t('admin.error.load');
      this.errorEl.hidden = false;
      this.leads = [];
      this.listEl.innerHTML = '';
    } finally {
      this.loading = false;
      this.loaderEl.hidden = true;
    }
  }

  render() {
    this.welcome.textContent = t('admin.dash.welcome');
    this.renderStats();
    this.renderFilters();
    this.renderList();
  }

  renderStats() {
    const counts = {};
    CONFIG.statuses.forEach((s) => { counts[s] = 0; });
    this.leads.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });

    const items = [
      ['total', t('admin.stats.total'), this.leads.length, ''],
      ...CONFIG.statuses.map((s) => [s, t(`admin.stats.${s}`), counts[s] || 0, s]),
    ];

    this.statsEl.innerHTML = items.map(([key, label, value, cls]) => `
      <div class="admin-stat ${cls ? `stat-${cls}` : ''}">
        <span class="admin-stat-value">${value}</span>
        <span class="admin-stat-label">${escapeHtml(label)}</span>
      </div>
    `).join('');
  }

  renderFilters() {
    const statuses = ['all', ...CONFIG.statuses];
    const total = this.leads.length;
    this.filtersEl.innerHTML = statuses.map((s) => {
      const count = s === 'all' ? total : this.leads.filter((l) => l.status === s).length;
      const label = s === 'all' ? t('admin.filter.all') : t(`admin.status.${s}`);
      const cls = this.filter === s ? 'is-active' : '';
      const aria = this.filter === s ? 'true' : 'false';
      return `<button type="button" class="admin-filter ${cls}" data-filter="${s}" role="tab" aria-selected="${aria}">
        ${escapeHtml(label)} <span class="admin-filter-count">${count}</span>
      </button>`;
    }).join('');

    this.filtersEl.querySelectorAll('.admin-filter').forEach((btn) => {
      btn.addEventListener('click', () => { this.filter = btn.dataset.filter; this.renderFilters(); this.renderList(); });
    });
  }

  filteredLeads() {
    if (this.filter === 'all') return this.leads;
    return this.leads.filter((l) => l.status === this.filter);
  }

  renderList() {
    const list = this.filteredLeads();
    if (!list.length) {
      this.emptyEl.hidden = false;
      this.emptyEl.innerHTML = '';
      this.emptyEl.appendChild(document.createTextNode(t('admin.empty')));
      this.listEl.innerHTML = '';
      return;
    }
    this.emptyEl.hidden = true;
    this.listEl.innerHTML = list.map((lead) => this.leadCard(lead)).join('');
    this.listEl.querySelectorAll('[data-status-select]').forEach((sel) => {
      sel.addEventListener('change', (e) => this.onStatusChange(sel.dataset.statusSelect, e.target.value, sel));
    });
    this.listEl.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => this.onDelete(btn.dataset.delete));
    });
  }

  leadCard(lead) {
    const date = formatDate(lead.created_at, getLang());
    const statusOptions = CONFIG.statuses.map((s) => {
      const sel = lead.status === s ? ' selected' : '';
      return `<option value="${s}"${sel}>${escapeHtml(t(`admin.status.${s}`))}</option>`;
    }).join('');

    const detail = (label, value) => value
      ? `<div class="lead-detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
      : '';

    return `
      <article class="lead-card ${lead.status === 'new' ? 'is-new' : ''}">
        <div class="lead-head">
          <div class="lead-id">
            <h4>${escapeHtml(lead.name)}</h4>
            <p class="lead-date">${escapeHtml(date)}</p>
          </div>
          <label class="lead-status-field">
            <span class="sr-only">${escapeHtml(t('admin.status.new'))}</span>
            <select data-status-select="${escapeHtml(lead.id)}">
              ${statusOptions}
            </select>
          </label>
        </div>
        <dl class="lead-details">
          ${detail(t('admin.lead.company'), lead.company_name)}
          ${detail(t('admin.lead.ctype'), lead.company_type)}
          ${detail(t('admin.lead.goals'), lead.goals)}
          ${detail(t('admin.lead.objective'), lead.objective)}
          ${detail(t('admin.lead.budget'), lead.budget)}
          ${detail(t('admin.lead.extra'), lead.additional_info || lead.details)}
        </dl>
        <div class="lead-actions">
          <button type="button" class="btn-ghost-mini" data-delete="${escapeHtml(lead.id)}">${escapeHtml(t('admin.lead.delete'))}</button>
        </div>
      </article>
    `;
  }

  async onStatusChange(id, status, select) {
    const previous = this.leads.find((l) => l.id === id)?.status;
    select.disabled = true;
    try {
      await updateLeadStatus(id, status);
      const lead = this.leads.find((l) => l.id === id);
      if (lead) lead.status = status;
      this.renderStats();
      this.renderFilters();
    } catch (err) {
      console.error(err);
      if (err.message === 'unauthorized') {
        this.onSession({ authenticated: false });
        showToast(t('admin.login.error.invalid'), { error: true });
        return;
      }
      showToast(t('admin.error.update'), { error: true });
      select.value = previous;
    } finally {
      select.disabled = false;
    }
  }

  async onDelete(id) {
    if (!window.confirm(t('admin.delete.confirm'))) return;
    try {
      await deleteLead(id);
      this.leads = this.leads.filter((l) => l.id !== id);
      this.render();
    } catch (err) {
      console.error(err);
      if (err.message === 'unauthorized') {
        this.onSession({ authenticated: false });
        showToast(t('admin.login.error.invalid'), { error: true });
        return;
      }
      showToast(t('admin.error.delete'), { error: true });
    }
  }
}

export function initAdmin() {
  const el = document.querySelector('.admin-view');
  if (!el) return null;
  return new Admin(el);
}