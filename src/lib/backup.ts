import { t } from '@/i18n';

import { validateExpense } from './split';
import type { Category, Expense, ExpenseKind, Group, GroupType, Member, RecurringExpense, SplitMode } from './types';

/**
 * Group backups: a JSON file with everything needed to recreate a group in Bote
 * (members, custom categories, expenses, incomes, repayments, recurring rules).
 * Importing creates a NEW group with new ids, so the same file can be imported twice.
 */

export const BACKUP_FORMAT = 'bote-group-backup';
export const BACKUP_VERSION = 1;

export type GroupBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  group: {
    name: string;
    emoji: string | null;
    currency: string;
    type: GroupType;
    members: Member[];
    categories: Category[];
    expenses: Expense[];
    recurring: RecurringExpense[];
  };
};

/** Error with a message ready to show to the user. */
export class BackupError extends Error {}

export function buildBackup(group: Group, now = new Date()): GroupBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    group: {
      name: group.name,
      emoji: group.emoji ?? null,
      currency: group.currency,
      type: group.type ?? 'expenses',
      members: group.members.map((m) => ({ id: m.id, name: m.name, color: m.color ?? null })),
      categories: group.categories ?? [],
      expenses: group.expenses,
      recurring: group.recurring ?? [],
    },
  };
}

/** File name like "bote-viaje-a-lisboa-2026-11-27.json". */
export function backupFileName(group: Pick<Group, 'name'>, now = new Date()): string {
  const slug =
    group.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'grupo';
  return `bote-${slug}-${now.toISOString().slice(0, 10)}.json`;
}

// ─── Reading a backup ─────────────────────────────────────────────────────

const KINDS: ExpenseKind[] = ['expense', 'transfer', 'income'];
const MODES: SplitMode[] = ['equal', 'shares', 'amounts'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isCents = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isCentsMap = (v: unknown): v is Record<string, number> =>
  isObject(v) && Object.values(v).every((x) => Number.isInteger(x) && (x as number) >= 0);

function fail(message: string): never {
  throw new BackupError(message);
}

/** Checks the fields an expense or recurring rule shares, against the backup's members. */
function checkMovement(e: Record<string, unknown>, memberIds: Set<string>, what: string) {
  if (!KINDS.includes(e.kind as ExpenseKind)) fail(t('backup.errors.unknownKind', { what }));
  if (!isText(e.title, 200)) fail(t('backup.errors.noTitle', { what }));
  if (!isCents(e.amount)) fail(t('backup.errors.badAmount', { what }));
  if (typeof e.paidBy !== 'string' || !memberIds.has(e.paidBy)) fail(t('backup.errors.payerNotInGroup', { what }));
  if (!Array.isArray(e.splitAmong) || e.splitAmong.length === 0 || !e.splitAmong.every((id) => memberIds.has(id))) {
    fail(t('backup.errors.participantNotInGroup', { what }));
  }
  if (e.splitMode !== undefined && !MODES.includes(e.splitMode as SplitMode)) fail(t('backup.errors.unknownSplit', { what }));
  for (const key of ['splitValues', 'payers'] as const) {
    const v = e[key];
    if (v === undefined || v === null) continue;
    if (!isCentsMap(v) || !Object.keys(v).every((id) => memberIds.has(id))) fail(t('backup.errors.badSplit', { what }));
  }
  const problem = validateExpense(e as unknown as Omit<Expense, 'id'>);
  if (problem) fail(t('backup.errors.invalid', { what, problem }));
}

/** Parses and validates a backup file. Throws BackupError with a message for the user. */
export function parseBackup(text: string): GroupBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail(t('backup.errors.notJson'));
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT) fail(t('backup.errors.notBackup'));
  if (data.version !== BACKUP_VERSION) {
    fail(t('backup.errors.newerVersion'));
  }
  const g = data.group;
  if (!isObject(g)) fail(t('backup.errors.incomplete'));
  if (!isText(g.name, 100)) fail(t('backup.errors.badGroupName'));
  if (typeof g.currency !== 'string' || g.currency.length !== 3) fail(t('backup.errors.badCurrency'));
  if (g.type !== 'expenses' && g.type !== 'loan') fail(t('backup.errors.unknownGroupType'));
  if (!Array.isArray(g.members) || g.members.length === 0) fail(t('backup.errors.noMembers'));

  const memberIds = new Set<string>();
  for (const m of g.members) {
    if (!isObject(m) || typeof m.id !== 'string' || !isText(m.name, 60)) fail(t('backup.errors.memberWithoutName'));
    if (memberIds.has(m.id)) fail(t('backup.errors.duplicateMembers'));
    memberIds.add(m.id);
  }
  for (const c of (g.categories ?? []) as unknown[]) {
    if (!isObject(c) || typeof c.id !== 'string' || !isText(c.emoji, 16) || !isText(c.name, 40)) {
      fail(t('backup.errors.badCategory'));
    }
  }
  if (!Array.isArray(g.expenses)) fail(t('backup.errors.noExpenses'));
  g.expenses.forEach((e, i) => {
    if (!isObject(e) || typeof e.id !== 'string' || typeof e.date !== 'string' || Number.isNaN(Date.parse(e.date))) {
      fail(t('backup.errors.badDate', { what: t('backup.movement', { number: i + 1 }) }));
    }
    checkMovement(e, memberIds, t('backup.movementWithTitle', { number: i + 1, title: String(e.title ?? '') }));
  });
  for (const [i, r] of ((g.recurring ?? []) as unknown[]).entries()) {
    if (!isObject(r) || typeof r.id !== 'string') fail(t('backup.errors.invalidRule', { what: t('backup.recurring', { number: i + 1 }) }));
    if (!Number.isInteger(r.dayOfMonth) || (r.dayOfMonth as number) < 1 || (r.dayOfMonth as number) > 31) {
      fail(t('backup.errors.badDay', { what: t('backup.recurring', { number: i + 1 }) }));
    }
    if (typeof r.nextDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.nextDate)) fail(t('backup.errors.badDate', { what: t('backup.recurring', { number: i + 1 }) }));
    checkMovement(r, memberIds, t('backup.recurring', { number: i + 1 }));
  }
  return {
    ...(data as GroupBackup),
    group: { ...(g as GroupBackup['group']), categories: (g.categories ?? []) as Category[], recurring: (g.recurring ?? []) as RecurringExpense[] },
  };
}

// ─── Turning a backup into a new group ────────────────────────────────────

export type ImportPlan = {
  name: string;
  emoji: string | null;
  currency: string;
  type: GroupType;
  members: Member[];
  categories: Category[];
  expenses: Expense[];
  recurring: RecurringExpense[];
};

/**
 * Gives every member, custom category, expense and rule a new id (ids are global, so a group
 * can't be imported over itself), updating every reference. Recurring rules come in paused:
 * they'd otherwise start creating expenses on their own.
 */
export function planImport(backup: GroupBackup, newId: () => string): ImportPlan {
  const g = backup.group;
  const memberIds = new Map(g.members.map((m) => [m.id, newId()]));
  const categoryIds = new Map(g.categories.map((c) => [c.id, newId()]));
  const ruleIds = new Map(g.recurring.map((r) => [r.id, newId()]));

  const member = (id: string) => memberIds.get(id) ?? id;
  const remapKeys = (values: Record<string, number> | null | undefined) =>
    values ? Object.fromEntries(Object.entries(values).map(([id, v]) => [member(id), v])) : (values ?? null);
  // Built-in categories ("food"…) keep their id; custom ones get the new one.
  const category = (id: string | null | undefined) => (id ? (categoryIds.get(id) ?? id) : null);

  const movement = <T extends Omit<Expense, 'id' | 'date' | 'recurringId'>>(e: T): T => ({
    ...e,
    paidBy: member(e.paidBy),
    splitAmong: e.splitAmong.map(member),
    splitValues: remapKeys(e.splitValues),
    payers: remapKeys(e.payers),
    category: category(e.category),
  });

  return {
    name: g.name,
    emoji: g.emoji,
    currency: g.currency,
    type: g.type,
    members: g.members.map((m) => ({ ...m, id: memberIds.get(m.id)! })),
    categories: g.categories.map((c) => ({ ...c, id: categoryIds.get(c.id)! })),
    recurring: g.recurring.map((r) => ({ ...movement(r), id: ruleIds.get(r.id)!, active: false, lastError: null })),
    expenses: g.expenses.map((e) => ({
      ...movement(e),
      id: newId(),
      date: e.date,
      recurringId: e.recurringId ? (ruleIds.get(e.recurringId) ?? null) : null,
    })),
  };
}
