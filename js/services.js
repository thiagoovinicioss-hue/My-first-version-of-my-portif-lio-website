// Centralized complementary-services catalog for the quote flow.
//
// Each add-on has a STABLE internal id used in the DB payload ({selected_addons})
// and in generated links across the app. Human-readable labels and benefits are
// translated in the UI (js/i18n/strings.js: addons.<id>.title / addons.<id>.benefit).
// This file centralizes what is offered and how recommendations are derived from
// the primary service (and objective) the visitor already selected.

export const ADDONS = [
  { id: 'landing_page' },
  { id: 'conversion' },
  { id: 'support_automation' },
  { id: 'lead_organization' },
];

export function addonById(id) {
  return ADDONS.find((a) => a.id === id) || null;
}

// Recommended add-on ids per primary service ("goals" select value).
const BY_GOAL = {
  landing: ['conversion', 'support_automation', 'lead_organization'],
  conversion: ['landing_page', 'support_automation', 'lead_organization'],
  support_automation: ['landing_page', 'conversion', 'lead_organization'],
  lead_organization: ['landing_page', 'conversion', 'support_automation'],
};

// For any other primary service, derive recommendations from the main objective
// the visitor reported.
const BY_OBJECTIVE = {
  leads: ['conversion', 'landing_page', 'support_automation', 'lead_organization'],
  sales: ['landing_page', 'conversion', 'support_automation', 'lead_organization'],
  support: ['support_automation', 'landing_page', 'conversion', 'lead_organization'],
  organization: ['lead_organization', 'landing_page', 'conversion', 'support_automation'],
};

const DEFAULT_RECS = ['landing_page', 'conversion', 'support_automation', 'lead_organization'];

// Returns 2-4 relevant complementary services for the selected primary service.
// The first suggestion is flagged as "recommended" (badge only — never pre-selected).
export function recommendAddons({ primaryGoal = '', objectiveValue = '' } = {}) {
  const list = BY_GOAL[primaryGoal] || BY_OBJECTIVE[objectiveValue] || DEFAULT_RECS;
  return list.slice(0, 4).map((id, i) => ({ id, recommended: i === 0 }));
}
