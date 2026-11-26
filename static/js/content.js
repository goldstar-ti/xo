// Fixed wording used by the app. The words themselves live in content/text/*.yaml (plan.yaml,
// checkin.yaml, today.yaml, defaults.yaml); this module reads them through text() and keeps the
// names the screens import. The top-level await means an importer runs after the text arrives.
import { loadText, text } from './text.js';

await loadText();

export const PLAN_VARIANTS = text('plan.variants');
export const PLAN = text('plan.sections');
// The workbook says to fill in the good life and support sections before the risk sections.
export const PLAN_FIRST = text('plan.first');
export const GUARD_TEXT = text('plan.guard');
export const SERVICES = text('plan.services');

// Concrete choices, because naming a feeling on the spot is hard.
export const BODY_CHIPS = text('checkin.body_chips');
export const SLEEP_CHIPS = text('checkin.sleep_chips');
export const DAY_CHIPS = text('checkin.day_chips');
export const WEEKLY_QUESTIONS = text('checkin.weekly_questions');

export const LINES = text('today.lines');

export const DEFAULT_ROUTINES = text('defaults.routines');
export const DEFAULT_SETTINGS = text('defaults.settings');
