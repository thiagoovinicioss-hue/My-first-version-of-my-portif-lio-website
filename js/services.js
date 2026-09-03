// Centralized complementary-services catalog for the quote flow.
//
// Each add-on has a STABLE internal id used in the DB payload ({selected_addons})
// and in generated links across the app. Human-readable labels and benefits are
// translated in the UI (js/i18n/strings.js: addons.<id>.title / addons.<id>.benefit).
// This file centralizes what is offered and how recommendations are derived from
// the primary service (and objective) the visitor already selected.

export const ADDONS = [
  { id: 'landing_page' },
  { id: 'whatsapp_ai' },
  { id: 'automation' },
  { id: 'lead_capture' },
  { id: 'follow_up' },
  { id: 'analytics' },
  { id: 'dashboard' },
  { id: 'integration' },
];

export function addonById(id) {
  return ADDONS.find((a) => a.id === id) || null;
}

// Recommended add-on ids per primary service ("goals" select value).
const BY_GOAL = {
  landing: ['whatsapp_ai', 'lead_capture', 'follow_up', 'analytics'],
  institutional: ['analytics', 'lead_capture', 'whatsapp_ai'],
  ecommerce: ['analytics', 'lead_capture', 'follow_up', 'whatsapp_ai'],
  ai: ['landing_page', 'lead_capture', 'dashboard', 'follow_up'],
  automation: ['whatsapp_ai', 'dashboard', 'integration', 'landing_page'],
};

// For custom development and any other primary service, derive recommendations
// from the main objective the visitor reported.
const BY_OBJECTIVE = {
  leads: ['lead_capture', 'follow_up', 'whatsapp_ai', 'analytics'],
  sales: ['analytics', 'lead_capture', 'follow_up', 'whatsapp_ai'],
  brand: ['analytics', 'lead_capture', 'landing_page'],
  automation: ['dashboard', 'integration', 'whatsapp_ai'],
  productivity: ['dashboard', 'integration', 'automation'],
  launch: ['landing_page', 'analytics', 'follow_up', 'lead_capture'],
};

const DEFAULT_RECS = ['integration', 'dashboard', 'analytics', 'whatsapp_ai'];

// Returns 2-4 relevant complementary services for the selected primary service.
// The first suggestion is flagged as "recommended" (badge only — never pre-selected).
export function recommendAddons({ primaryGoal = '', objectiveValue = '' } = {}) {
  const list = BY_GOAL[primaryGoal] || BY_OBJECTIVE[objectiveValue] || DEFAULT_RECS;
  return list.slice(0, 4).map((id, i) => ({ id, recommended: i === 0 }));
}
