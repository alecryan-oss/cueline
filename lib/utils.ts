import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Turn a snake_case slug into a human-readable, sentence-case label.
 * `pricing_objection_call` → `Pricing objection call`
 * `discovery_question`     → `Discovery question`
 * Falls back to the input untouched if it's empty.
 */
export function humanize(slug: string | null | undefined): string {
  if (!slug) return '';
  const spaced = slug.replace(/_/g, ' ').trim();
  if (spaced.length === 0) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
