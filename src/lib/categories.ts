import type { Category, Group } from './types';

/**
 * Built-in categories, available in every group. Their ids are stored in expenses, so
 * never change or reuse an id; only add new ones.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', emoji: '🍽️', name: 'Comida' },
  { id: 'groceries', emoji: '🛒', name: 'Súper' },
  { id: 'transport', emoji: '🚗', name: 'Transporte' },
  { id: 'lodging', emoji: '🏠', name: 'Alojamiento' },
  { id: 'drinks', emoji: '🍻', name: 'Copas' },
  { id: 'leisure', emoji: '🎉', name: 'Ocio' },
  { id: 'tickets', emoji: '🎟️', name: 'Entradas' },
  { id: 'shopping', emoji: '🛍️', name: 'Compras' },
  { id: 'health', emoji: '💊', name: 'Salud' },
  { id: 'other', emoji: '📦', name: 'Otros' },
];

/** Shown for expenses without a category, or whose custom category was deleted. */
export const UNCATEGORIZED: Category = { id: 'none', emoji: '🧾', name: 'Sin categoría' };
export const TRANSFER_CATEGORY: Category = { id: 'transfer', emoji: '💸', name: 'Reembolso' };
/** Shown for incomes without a category. */
export const INCOME_CATEGORY: Category = { id: 'income', emoji: '💰', name: 'Ingreso' };

export function groupCategories(group: Group): Category[] {
  return [...DEFAULT_CATEGORIES, ...(group.categories ?? [])];
}

export function findCategory(group: Group, id: string | null | undefined): Category {
  if (!id) return UNCATEGORIZED;
  return groupCategories(group).find((c) => c.id === id) ?? UNCATEGORIZED;
}
