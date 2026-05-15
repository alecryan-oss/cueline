// Maps Stage-1 intent labels to the kb_chunks intent_tags we want retrieved
// for Stage 2. Per docs/rag.md the retrieval filters by tenant + tag overlap
// BEFORE the similarity sort, so picking the right tag set per intent is the
// dominant lever on suggestion quality.

import type { IntentLabel } from './gate';

const MAP: Record<IntentLabel, string[]> = {
  objection_pricing: ['objection', 'pricing'],
  objection_timing: ['objection'],
  objection_authority: ['objection', 'qualifying_criteria'],
  objection_need: ['objection', 'discovery_question'],
  objection_competitor: ['objection', 'competitor', 'case_study'],
  discovery_question: ['discovery_question', 'product_fact'],
  buying_signal: ['qualifying_criteria', 'product_fact'],
  request_for_info: ['product_fact', 'pricing'],
};

export function intentTagsForIntent(intent: IntentLabel): string[] {
  return MAP[intent];
}
