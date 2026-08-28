// Small shared UI helpers.

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;

export function showToast(message, opts = {}) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.toggle('toast-error', Boolean(opts.error));
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => { toast.hidden = true; }, 300);
  }, opts.duration || 3600);
}

export function formatDate(iso, lang) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch (_) {
    return String(iso).replace('T', ' ').slice(0, 16);
  }
}