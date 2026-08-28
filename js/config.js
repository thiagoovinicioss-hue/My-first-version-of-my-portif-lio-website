// Centralized site configuration.
// Values here are public by design (served to the browser).
// NEVER put secrets here. Database access is protected server-side (RLS + Supabase Auth).

export const CONFIG = {
  // Basic identity
  name: 'Thiago Vinícius',
  brand: ['Thiago', 'Vinícius'],
  country: 'Brasil',

  // Profile image (about / hero). Optimized WebP in /assets.
  profileImage: 'assets/profile.webp',
  profileImageWidth: 480,
  profileImageHeight: 600,

  // Social & contact links.
  social: {
    linkedin: 'https://www.linkedin.com/in/thiago-vinicius-b-araujo-vinicius-81108b341',
    instagram: 'https://www.instagram.com/thiagovinnicius14/',
    whatsapp: '#', // filled below from whatsapp.number
    youtube: 'https://www.youtube.com/@Thiago_maker',
    github: 'https://github.com/thiagoovinicioss-hue',
  },

  // WhatsApp number used for the quote flow.
  // Format: country code + area code + number, digits only.
  // TODO: replace with your real number, e.g. '5511999998888'.
  whatsapp: {
    number: '5500000000000',
  },

  // Lead storage backend (Supabase).
  // Leave url/key empty to run in "frontend-only" mode: the quote flow still
  // generates the WhatsApp link, but leads are not persisted.
  // Setup: create a project, run supabase/schema.sql, then paste the project URL
  // and the public "anon" key below (they are public by design with RLS enabled).
  supabase: {
    url: '',
    anonKey: '',
    leadsTable: 'leads',
  },

  // Lead status values used in the admin panel.
  statuses: ['new', 'contacted', 'negotiation', 'won', 'lost'],
};

export function whatsappUrl(message) {
  if (!CONFIG.whatsapp.number) return '#';
  return `https://wa.me/${CONFIG.whatsapp.number}?text=${encodeURIComponent(message)}`;
}

export function isBackendConfigured() {
  return Boolean(CONFIG.supabase.url && CONFIG.supabase.anonKey);
}