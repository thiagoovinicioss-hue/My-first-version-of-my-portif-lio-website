import { t, getLang } from './i18n/index.js';

const LANG_LOCALE = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

export function calculateMonthlyImpact({ hoursPerExecution, hourlyCost, numberOfPeople, executionsPerMonth }) {
  const clamp = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const hours = clamp(hoursPerExecution);
  const cost = clamp(hourlyCost);
  const people = clamp(numberOfPeople);
  const executions = clamp(executionsPerMonth);

  const monthlyHours = hours * executions * people;
  const monthlyCost = monthlyHours * cost;
  return { monthlyHours, monthlyCost };
}

function formatHours(value) {
  const hours = Math.round(value * 10) / 10;
  return `${hours}h`;
}

function formatCurrency(value, lang) {
  const locale = LANG_LOCALE[lang] || 'pt-BR';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  } catch (_) {
    return `R$ ${Math.round(value)}`;
  }
}

export function initCalculator() {
  const shell = document.querySelector('[data-calculator]');
  if (!shell) return null;

  const hourMap = {
    hoursPerExecution: { el: shell.querySelector('#calcHours'), defaultValue: 2 },
    hourlyCost: { el: shell.querySelector('#calcCost'), defaultValue: 30 },
    numberOfPeople: { el: shell.querySelector('#calcPeople'), defaultValue: 1 },
    executionsPerMonth: { el: shell.querySelector('#calcFrequency'), defaultValue: 20 },
  };
  const resultEl = shell.querySelector('#calcResult');

  function readInputs() {
    const input = {};
    for (const key of Object.keys(hourMap)) {
      input[key] = Number(hourMap[key].el.value);
    }
    return input;
  }

  // Some browsers clear/revalidate `type="number"` inputs when the document
  // `lang` attribute changes, leaving `.value` empty (→ result 0). On a
  // language switch, restore any field that no longer holds a valid number to
  // its initial value so the result never zeroes out. User-typed values on
  // `input` events are left untouched.
  function restoreCleared() {
    for (const { el, defaultValue } of Object.values(hourMap)) {
      const num = Number(el.value);
      if (el.value.trim() === '' || !Number.isFinite(num)) el.value = defaultValue;
    }
  }

  function render() {
    const { monthlyHours, monthlyCost } = calculateMonthlyImpact(readInputs());
    const lang = getLang();

    resultEl.innerHTML = `
      <span class="calc-result-main">${t('calc.result.main', { hours: formatHours(monthlyHours) })}</span>
      <span class="calc-result-cost">${t('calc.result.cost', { cost: formatCurrency(monthlyCost, lang) })}</span>
    `;
  }

  Object.values(hourMap).forEach(({ el }) => {
    el.addEventListener('input', render);
  });

  document.addEventListener('i18n:change', () => {
    restoreCleared();
    render();
  });

  render();

  return { render };
}
