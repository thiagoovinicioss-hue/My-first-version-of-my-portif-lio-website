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
  whatsapp: {
    number: '5544988562515',
  },

  // Lead storage backend (Supabase).
  // The publishable/anon key below is PUBLIC by design (safe to ship to the
  // browser) — real protection comes from Row Level Security. The secret key
  // (sb_secret_*) is NEVER placed here or anywhere in this repository: it lives
  // only in your local, gitignored .env.local and must never be committed.
  supabase: {
    url: 'https://eimtmksxkojpqjsdiwmn.supabase.co',
    anonKey: 'sb_publishable_CQjrAVAReTakJU4jMiuR5A_AWmJTqyn',
    leadsTable: 'leads',
  },

  // Lead status values used in the admin panel.
  statuses: ['new', 'contacted', 'negotiation', 'won', 'lost'],

  // Authentication / private-area backend.
  // This is the ONLY public value the frontend needs for the private area: the
  // base URL of the small server-side API that authenticates against WordPress
  // and proxies private data. All credentials/sessions live server-side.
  // Leave empty to run the site with the private area disabled.
  auth: {
    // e.g. 'https://api.example.com'  (no trailing slash)
    apiBaseUrl: '',
  },
};

export function whatsappUrl(message) {
  if (!CONFIG.whatsapp.number) return '#';
  return `https://wa.me/${CONFIG.whatsapp.number}?text=${encodeURIComponent(message)}`;
}

export function isBackendConfigured() {
  return Boolean(CONFIG.supabase.url && CONFIG.supabase.anonKey);
}

export function isAuthConfigured() {
  return Boolean(CONFIG.auth.apiBaseUrl);
}