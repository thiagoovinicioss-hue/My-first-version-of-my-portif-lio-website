import { t, getOptions, subscribe } from './i18n/index.js';
import { whatsappUrl, isBackendConfigured } from './config.js';
import { saveLead } from './backend.js';
import { escapeHtml } from './ui.js';

const STEPS = [
  { id: 1, fields: ['name', 'companyType'] },
  { id: 2, fields: ['goals', 'objective'] },
  { id: 3, fields: ['budget'] },
  { id: 4, fields: [] },
];

export function initQuote() {
  const shell = document.querySelector('#quoteShell');
  if (!shell) return null;
  return new QuoteFlow(shell);
}

class QuoteFlow {
  constructor(shell) {
    this.shell = shell;
    this.form = shell.querySelector('#quoteForm');
    this.panels = [...shell.querySelectorAll('.quote-step-panel')];
    this.stepEls = [...shell.querySelectorAll('.quote-step')];
    this.progressFill = shell.querySelector('#quoteProgressFill');
    this.progressBar = shell.querySelector('.quote-progress');
    this.nextBtn = shell.querySelector('#quoteNext');
    this.prevBtn = shell.querySelector('#quotePrev');
    this.submitBtn = shell.querySelector('#quoteSubmit');
    this.reviewEl = shell.querySelector('#quoteReview');
    this.successEl = shell.querySelector('#quoteSuccess');
    this.formError = shell.querySelector('#quoteFormError');
    this.backBtn = shell.querySelector('#quoteBack');
    this.doneBtn = shell.querySelector('#quoteDone');
    this.waLink = shell.querySelector('#quoteWaLink');
    this.savedNote = shell.querySelector('#quoteSavedNote');
    this.budgetOptions = [...shell.querySelectorAll('.budget-option')];
    this.hpInput = shell.querySelector('[name="hp"]');

    this.step = 1;
    this.budgetIndex = null;
    this.data = { name: '', company: '', companyType: '', goals: '', objective: '', details: '', budget: '', extra: '' };
    this.submitting = false;

    this.populateSelects();
    this.bind();
    subscribe(() => {
      this.populateSelects();
      this.renderBudget();
      this.renderReview();
      this.syncStep();
    });
  }

  populateSelects() {
    const configs = [
      { el: this.form.querySelector('[name="companyType"]'), key: 'quote.ctype.options' },
      { el: this.form.querySelector('[name="goals"]'), key: 'quote.goals.options' },
      { el: this.form.querySelector('[name="objective"]'), key: 'quote.objective.options' },
    ];
    configs.forEach(({ el, key }) => {
      const current = el.value;
      el.innerHTML = '';
      const def = document.createElement('option');
      def.value = '';
      def.textContent = t(key.replace('.options', '.default'));
      el.appendChild(def);
      getOptions(key).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.v;
        o.textContent = opt.label;
        el.appendChild(o);
      });
      if (current) el.value = current;
    });
  }

  bind() {
    this.nextBtn.addEventListener('click', () => this.go(this.step + 1));
    this.prevBtn.addEventListener('click', () => this.go(this.step - 1));
    this.backBtn.addEventListener('click', () => location.hash = '#/');
    this.doneBtn.addEventListener('click', () => location.hash = '#/');

    this.budgetOptions.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.budgetIndex = i;
        this.renderBudget();
      });
    });

    // Clicking a step indicator returns to that step (only if already visited)
    this.stepEls.forEach((stepEl, i) => {
      stepEl.addEventListener('click', () => {
        if (i + 1 < this.step) this.go(i + 1);
        else if (i + 1 === this.step) this.go(i + 1);
      });
    });

    const form = this.form;
    form.addEventListener('submit', (e) => e.preventDefault());

    ['name', 'company', 'companyType', 'goals', 'objective', 'details', 'extra'].forEach((name) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (!el) return;
      el.addEventListener('input', () => { if (name !== 'details' && name !== 'extra' && this.step === 4) this.renderReview(); });
    });

    this.submitBtn.addEventListener('click', () => this.submit());
  }

  collect() {
    this.data.name = this.form.querySelector('[name="name"]').value.trim();
    this.data.company = this.form.querySelector('[name="company"]').value.trim();
    this.data.companyType = this.form.querySelector('[name="companyType"]').selectedOptions[0].textContent;
    this.data.goals = this.form.querySelector('[name="goals"]').selectedOptions[0].textContent;
    this.data.objective = this.form.querySelector('[name="objective"]').selectedOptions[0].textContent;
    this.data.details = this.form.querySelector('[name="details"]').value.trim();
    this.data.budget = this.budgetIndex !== null ? t(`quote.budget.o${this.budgetIndex + 1}`) : '';
    this.data.extra = this.form.querySelector('[name="extra"]').value.trim();
  }

  validateStep(step) {
    this.collect();
    let ok = true;
    const setError = (name, msg) => {
      const errEl = this.form.querySelector(`[data-error-for="${name}"]`);
      const fieldEl = this.form.querySelector(`[name="${name}"]`);
      if (errEl) {
        ok = false;
        errEl.textContent = msg || t('quote.error.required');
        if (fieldEl) fieldEl.setAttribute('aria-invalid', 'true');
      }
    };
    const clearError = (name) => {
      const errEl = this.form.querySelector(`[data-error-for="${name}"]`);
      const fieldEl = this.form.querySelector(`[name="${name}"]`);
      if (errEl) errEl.textContent = '';
      if (fieldEl) fieldEl.removeAttribute('aria-invalid');
    };

    ['name', 'companyType', 'goals', 'objective', 'details', 'extra'].forEach(clearError);
    this.formError.hidden = true;
    const elBudgetError = this.form.querySelector('[data-error-for="budget"]');

    if (step === 1) {
      if (!this.data.name) setError('name');
      if (!this.data.companyType) setError('companyType');
    } else if (step === 2) {
      if (!this.data.goals) setError('goals');
      if (!this.data.objective) setError('objective');
    } else if (step === 3) {
      if (this.budgetIndex === null) {
        ok = false;
        elBudgetError.textContent = t('quote.error.budget');
      } else {
        elBudgetError.textContent = '';
      }
    }
    return ok;
  }

  go(next) {
    if (this.submitting) return;
    if (next > this.step) {
      if (!this.validateStep(this.step)) return;
    }
    this.step = Math.min(Math.max(next, 1), 4);
    if (this.step === 4) this.renderReview();
    this.syncStep();
  }

  renderBudget() {
    this.budgetOptions.forEach((el, i) => {
      el.classList.toggle('is-selected', i === this.budgetIndex);
      el.setAttribute('aria-pressed', i === this.budgetIndex ? 'true' : 'false');
    });
    const errEl = this.form.querySelector('[data-error-for="budget"]');
    if (errEl) errEl.textContent = '';
  }

  renderReview() {
    const rows = [
      ['name', this.data.name],
      ['company', this.data.company || t('quote.review.none')],
      ['ctype', this.data.companyType || t('quote.review.none')],
      ['goals', this.data.goals || t('quote.review.none')],
      ['objective', this.data.objective || t('quote.review.none')],
      ['details', this.data.details || t('quote.review.none')],
      ['budget', this.data.budget || t('quote.review.none')],
      ['extra', this.data.extra || t('quote.review.none')],
    ];
    this.reviewEl.innerHTML = '';
    const rowMap = { name: 1, company: 1, ctype: 1, goals: 2, objective: 2, details: 2, budget: 3, extra: 3 };
    rows.forEach(([key, value]) => {
      const div = document.createElement('div');
      div.className = 'quote-review-row';
      div.setAttribute('data-step', rowMap[key]);
      div.innerHTML = `<dt>${t(`quote.review.${key}`)}</dt><dd>${escapeHtml(value)}</dd><span class="quote-review-edit" aria-hidden="true">✎</span>`;
      div.addEventListener('click', () => this.go(rowMap[key]));
      this.reviewEl.appendChild(div);
    });
  }

  syncStep() {
    this.panels.forEach((panel) => {
      const p = Number(panel.dataset.panel);
      panel.hidden = p !== this.step;
      if (p === this.step) {
        window.requestAnimationFrame(() => {
          const title = panel.querySelector('.quote-title');
          title.focus({ preventScroll: true });
        });
      }
    });
    this.stepEls.forEach((el, i) => {
      el.classList.toggle('is-done', i + 1 < this.step);
      el.classList.toggle('is-current', i + 1 === this.step);
      el.setAttribute('aria-current', i + 1 === this.step ? 'step' : 'false');
      el.style.pointerEvents = i + 1 <= this.step ? '' : 'none';
    });
    this.progressFill.style.width = `${((this.step - 1) / 3) * 100}%`;
    this.progressBar.setAttribute('aria-valuenow', String(this.step));
    const last = this.step === 4;
    this.nextBtn.hidden = last;
    this.submitBtn.hidden = !last;
    this.prevBtn.hidden = this.step === 1;
    this.formError.hidden = true;
  }

  showLoading(show) {
    const screen = document.querySelector('#loadingScreen');
    if (show) {
      screen.hidden = false;
      requestAnimationFrame(() => screen.classList.add('is-visible'));
    } else {
      screen.classList.remove('is-visible');
      window.setTimeout(() => { screen.hidden = true; }, 400);
    }
  }

  async submit() {
    if (this.submitting) return;
    this.collect();
    if (!this.validateStep(this.step)) return;

    // Honeypot: bots fill the hidden field -> silently "succeed" without side effects.
    const isBot = this.hpInput.value.trim() !== '';
    if (isBot) {
      this.showSuccess(false);
      return;
    }

    const message = this.buildMessage();
    const payload = {
      name: this.data.name,
      company_name: this.data.company || null,
      company_type: this.data.companyType,
      goals: this.data.goals,
      objective: this.data.objective,
      budget: this.data.budget,
      details: this.data.details || null,
      additional_info: this.data.extra || null,
    };

    let saved = false;
    if (isBackendConfigured()) {
      this.submitting = true;
      this.showLoading(true);
      this.submitBtn.classList.add('is-loading');
      try {
        await saveLead(payload);
        saved = true;
      } catch (err) {
        console.error('lead save failed', err);
        saved = false;
      } finally {
        this.showLoading(false);
        this.submitBtn.classList.remove('is-loading');
        this.submitting = false;
      }
    }

    this.waLink.href = whatsappUrl(message);
    this.showSuccess(saved);
    window.open(this.waLink.href, '_blank', 'noopener');
  }

  buildMessage() {
    const intro = this.data.company
      ? t('wa.intro.company', { name: this.data.name, company: this.data.company })
      : t('wa.intro.name', { name: this.data.name });
    const lines = [
      intro,
      '',
      `• ${t('wa.what')}: ${this.data.goals}`,
      `• ${t('wa.objective')}: ${this.data.objective}`,
      `• ${t('wa.budget')}: ${this.data.budget}`,
    ];
    if (this.data.extra) lines.push(`• ${t('wa.extra')}: ${this.data.extra}`);
    return lines.join('\n');
  }

  showSuccess(saved) {
    this.form.hidden = true;
    this.prevBtn.hidden = true;
    this.nextBtn.hidden = true;
    this.submitBtn.hidden = true;
    this.successEl.hidden = false;
    this.savedNote.hidden = !saved;
    this.progressBar.hidden = true;

    window.requestAnimationFrame(() => {
      const el = this.successEl;
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity .5s ease, transform .5s ease';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    });
  }
}