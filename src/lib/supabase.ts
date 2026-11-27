import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { CLOUD, LOCAL_DEFAULT_KEY, parseAppEnv, type AppEnv } from '@/config/environments';

import type { Category, Expense, Group, Member, RecurringExpense } from './types';

/**
 * Which environment this build is (local / dev / prod). Read from EXPO_PUBLIC_APP_ENV, which is
 * written into the code on every platform. (App config `extra` doesn't reach the web version,
 * which made web fall back to http://localhost.) Keep `process.env.EXPO_PUBLIC_APP_ENV` written
 * out in full: that is what gets replaced at build time.
 */
export const appEnv: AppEnv = parseAppEnv(process.env.EXPO_PUBLIC_APP_ENV);

/**
 * Local Supabase runs on the computer: native gets its Wi-Fi address from app.config.ts;
 * web runs on that same computer, so localhost works.
 */
function localSupabase(): { url: string; key: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string };
  return {
    url: extra.supabaseUrl ?? 'http://localhost:54321',
    key: extra.supabaseKey ?? LOCAL_DEFAULT_KEY,
  };
}

const { url, key } = appEnv === 'local' ? localSupabase() : CLOUD[appEnv];

/**
 * Prefix for this device's saved data, so environments don't mix when switching in Expo Go.
 * Dev keeps the original keys (no prefix) so existing data stays.
 */
export const storagePrefix = appEnv === 'dev' ? 'tricount' : `tricount:${appEnv}`;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: {
    storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh the session token while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// ─── Row types and mapping ────────────────────────────────────────────────

type MemberRow = { id: string; group_id: string; name: string; position: number; color: string | null };
type CategoryRow = { id: string; group_id: string; emoji: string; name: string; created_at?: string };
type ExpenseRow = {
  id: string;
  group_id: string;
  kind: Expense['kind'];
  title: string;
  amount: number;
  paid_by: string;
  split_among: string[];
  date: string;
  category: string | null;
  split_mode: 'equal' | 'shares' | 'amounts';
  split_values: Record<string, number> | null;
  payers: Record<string, number> | null;
  recurring_id: string | null;
};
type RecurringRow = Omit<ExpenseRow, 'date' | 'recurring_id'> & {
  day_of_month: number;
  next_date: string;
  active: boolean;
  last_error: string | null;
};
type GroupRow = {
  id: string;
  name: string;
  type: 'expenses' | 'loan';
  emoji: string | null;
  currency: string;
  invite_code: string;
  created_at: string;
  created_by: string | null;
  /** RLS only returns my own access row, so this has 0 or 1 items. */
  group_access: { archived: boolean; muted: boolean; member_id: string | null }[];
  members: MemberRow[];
  categories: CategoryRow[];
  expenses: ExpenseRow[];
  recurring_expenses: RecurringRow[];
};

export const GROUP_SELECT =
  'id, name, type, emoji, currency, invite_code, created_at, created_by, group_access(archived, muted, member_id), members(*), categories(*), expenses(*), recurring_expenses(*)';

export function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    emoji: row.emoji,
    currency: row.currency,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    createdBy: row.created_by,
    archived: row.group_access?.[0]?.archived ?? false,
    muted: row.group_access?.[0]?.muted ?? false,
    serverMe: row.group_access?.[0]?.member_id ?? null,
    members: [...row.members]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ id: m.id, name: m.name, color: m.color })),
    categories: [...(row.categories ?? [])]
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .map((c) => ({ id: c.id, emoji: c.emoji, name: c.name })),
    expenses: row.expenses.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      amount: e.amount,
      paidBy: e.paid_by,
      splitAmong: e.split_among,
      date: e.date,
      category: e.category,
      splitMode: e.split_mode,
      splitValues: e.split_values,
      payers: e.payers,
      recurringId: e.recurring_id,
    })),
    recurring: (row.recurring_expenses ?? []).map(
      (r): RecurringExpense => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        amount: r.amount,
        paidBy: r.paid_by,
        splitAmong: r.split_among,
        splitMode: r.split_mode,
        splitValues: r.split_values,
        payers: r.payers,
        category: r.category,
        dayOfMonth: r.day_of_month,
        nextDate: r.next_date,
        active: r.active,
        lastError: r.last_error,
      }),
    ),
  };
}

export function memberToRow(groupId: string, m: Member, position: number): MemberRow {
  return { id: m.id, group_id: groupId, name: m.name, position, color: m.color ?? null };
}

export function categoryToRow(groupId: string, c: Category): CategoryRow {
  return { id: c.id, group_id: groupId, emoji: c.emoji, name: c.name };
}

export function expenseToRow(groupId: string, e: Expense) {
  return {
    id: e.id,
    group_id: groupId,
    kind: e.kind,
    title: e.title,
    amount: e.amount,
    paid_by: e.paidBy,
    split_among: e.splitAmong,
    date: e.date,
    category: e.kind === 'transfer' ? null : (e.category ?? null),
    split_mode: e.splitMode ?? 'equal',
    split_values: e.splitMode && e.splitMode !== 'equal' ? (e.splitValues ?? null) : null,
    payers: e.payers && Object.keys(e.payers).length > 1 ? e.payers : null,
    recurring_id: e.recurringId ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function recurringToRow(groupId: string, r: RecurringExpense) {
  const { id: _id, date: _date, recurring_id: _recurring, updated_at: _updated, ...fields } = expenseToRow(groupId, {
    ...r,
    date: '',
  });
  return {
    ...fields,
    id: r.id,
    day_of_month: r.dayOfMonth,
    next_date: r.nextDate,
    active: r.active,
    last_error: r.lastError ?? null,
  };
}
