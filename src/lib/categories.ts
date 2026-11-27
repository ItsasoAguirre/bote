import { t } from '@/i18n';

import type { Category, Group } from './types';

/**
 * Built-in categories, available in every group. Their ids are stored in expenses, so
 * never change or reuse an id; only add new ones. Names follow the app language (getters, so
 * they're read at use time).
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', emoji: '🍽️', get name() { return t('categoryNames.food'); } },
  { id: 'groceries', emoji: '🛒', get name() { return t('categoryNames.groceries'); } },
  { id: 'transport', emoji: '🚗', get name() { return t('categoryNames.transport'); } },
  { id: 'lodging', emoji: '🏠', get name() { return t('categoryNames.lodging'); } },
  { id: 'drinks', emoji: '🍻', get name() { return t('categoryNames.drinks'); } },
  { id: 'leisure', emoji: '🎉', get name() { return t('categoryNames.leisure'); } },
  { id: 'tickets', emoji: '🎟️', get name() { return t('categoryNames.tickets'); } },
  { id: 'shopping', emoji: '🛍️', get name() { return t('categoryNames.shopping'); } },
  { id: 'health', emoji: '💊', get name() { return t('categoryNames.health'); } },
  { id: 'other', emoji: '📦', get name() { return t('categoryNames.other'); } },
];

/** Shown for expenses without a category, or whose custom category was deleted. */
export const UNCATEGORIZED: Category = { id: 'none', emoji: '🧾', get name() { return t('categoryNames.none'); } };
export const TRANSFER_CATEGORY: Category = { id: 'transfer', emoji: '💸', get name() { return t('categoryNames.transfer'); } };
/** Shown for incomes without a category. */
export const INCOME_CATEGORY: Category = { id: 'income', emoji: '💰', get name() { return t('categoryNames.income'); } };

export function groupCategories(group: Group): Category[] {
  return [...DEFAULT_CATEGORIES, ...(group.categories ?? [])];
}

export function findCategory(group: Group, id: string | null | undefined): Category {
  if (!id) return UNCATEGORIZED;
  return groupCategories(group).find((c) => c.id === id) ?? UNCATEGORIZED;
}
