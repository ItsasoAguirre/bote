import type { Group } from './types';

/** Shown for groups without an emoji (e.g. created before emojis existed). */
export const DEFAULT_GROUP_EMOJI = '👥';

export const GROUP_EMOJI_SUGGESTIONS = [
  '✈️', '🏖️', '🏔️', '🏠', '🍕', '🍻', '🎉', '🚗', '⛺', '🎿', '⚽', '🎄', '💼', '❤️', '👨‍👩‍👧', '🐶', '🤝', '🏦',
];

/** Default emoji for a new loan group. */
export const LOAN_EMOJI = '🤝';

export function groupEmoji(group: Pick<Group, 'emoji'>): string {
  return group.emoji || DEFAULT_GROUP_EMOJI;
}
