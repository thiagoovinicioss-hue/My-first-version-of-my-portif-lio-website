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

  const hoursEl = shell.querySelector('#calcHours');
  const costEl = shell.querySelector('#calcCost');
  const peopleEl = shell.querySelector('#calcPeople');
  const frequencyEl = shell.querySelector('#calcFrequency');
  const resultEl = shell.querySelector('#calcResult');

  function render() {
    const input = {
      hoursPerExecution: Number(hoursEl.value),
      hourlyCost: Number(costEl.value),
      numberOfPeople: Number(peopleEl.value),
      executionsPerMonth: Number(frequencyEl.value),
    };
    const { monthlyHours, monthlyCost } = calculateMonthlyImpact(input);
    const lang = getLang();

    resultEl.innerHTML = `
      <span class="calc-result-main">${t('calc.result.main', { hours: formatHours(monthlyHours) })}</span>
      <span class="calc-result-cost">${t('calc.result.cost', { cost: formatCurrency(monthlyCost, lang) })}</span>
    `;
  }

  [hoursEl, costEl, peopleEl, frequencyEl].forEach((el) => {
    el.addEventListener('input', render);
  });

  document.addEventListener('i18n:change', render);

  render();

  return { render };
}
