import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState } from 'react-native';

import { nextColor } from '@/lib/colors';
import { planImport, type GroupBackup } from '@/lib/backup';
import { newId } from '@/lib/id';
import { registerForPushNotifications } from '@/lib/push';
import { dateKey, planRecurrence, resumeDate } from '@/lib/recurring';
import {
  categoryToRow,
  expenseToRow,
  recurringToRow,
  GROUP_SELECT,
  memberToRow,
  rowToGroup,
  storagePrefix,
  supabase,
  supabaseConfigured,
} from '@/lib/supabase';
import type { Category, Expense, Group, GroupType, Member, RecurringExpense } from '@/lib/types';

/** Last data fetched from the server, so groups can be viewed offline. */
const CACHE_KEY = `${storagePrefix}:cache:v2`;
/** Which member "I" am in each group, per device: { [groupId]: memberId }. */
const ME_KEY = `${storagePrefix}:me:v1`;
/** Data from the first, local-only version of the app. Uploaded once, then removed. */
const LEGACY_KEY = `${storagePrefix}:groups:v1`;

export type GroupInput = {
  name: string;
  emoji?: string | null;
  currency: string;
  members: Member[];
  /** Only used when creating; the type can't change later. */
  type?: GroupType;
};
export type ExpenseInput = Omit<Expense, 'id'>;
export type SyncStatus = 'connecting' | 'online' | 'offline' | 'not-configured';

type Result = { error: unknown };

type GroupsContextValue = {
  ready: boolean;
  status: SyncStatus;
  /** This device's (anonymous) user id, once signed in. */
  userId: string | null;
  groups: Group[];
  me: Record<string, string>;
  refresh: () => Promise<void>;
  /** Creates the group on the server. Throws if it fails. Returns the new id. */
  createGroup: (input: GroupInput) => Promise<string>;
  /** Joins a group with its invite code. Throws if the code is wrong. Returns the group id. */
  joinGroup: (code: string) => Promise<string>;
  updateGroup: (id: string, input: GroupInput) => Promise<boolean>;
  leaveGroup: (id: string) => Promise<boolean>;
  /** Mutes or unmutes the group's push notifications (only for me). */
  setMuted: (id: string, muted: boolean) => Promise<boolean>;
  /** Hides or shows the group in my list (only for me). */
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  /** Deletes the group for everyone. Only its creator can. */
  deleteGroup: (id: string) => Promise<boolean>;
  addMember: (groupId: string, name: string) => Promise<string | null>;
  /** Creates a custom category in the group. Returns its id, or null if saving failed. */
  addCategory: (groupId: string, input: Omit<Category, 'id'>) => Promise<string | null>;
  deleteCategory: (groupId: string, categoryId: string) => Promise<boolean>;
  setMe: (groupId: string, memberId: string) => void;
  /** Returns the new expense id, or null if saving failed. */
  addExpense: (groupId: string, input: ExpenseInput) => Promise<string | null>;
  /** Puts back an expense that was just deleted (for "Deshacer"), keeping its id. */
  restoreExpense: (groupId: string, expense: Expense) => Promise<boolean>;
  updateExpense: (groupId: string, expenseId: string, input: ExpenseInput) => Promise<boolean>;
  deleteExpense: (groupId: string, expenseId: string) => Promise<boolean>;
  /**
   * Repeats an expense every month on the day of its date. If that date is today or earlier,
   * the first expense is added now; the server creates the following ones.
   */
  addRecurring: (groupId: string, input: ExpenseInput) => Promise<boolean>;
  /**
   * Creates a new group from a backup (new ids everywhere, recurring rules paused).
   * All or nothing: if any step fails the partial group is deleted. Returns the new group id.
   */
  importGroup: (backup: GroupBackup) => Promise<string>;
  /** Pauses or resumes a rule. Resuming doesn't back-fill the months it was paused. */
  setRecurringActive: (groupId: string, id: string, active: boolean) => Promise<boolean>;
  /** Deletes a rule; the expenses it already created are kept. */
  deleteRecurring: (groupId: string, id: string) => Promise<boolean>;
};

const GroupsContext = createContext<GroupsContextValue | null>(null);

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Runs server calls in order and stops at the first error. */
async function sequence(...steps: (() => PromiseLike<Result>)[]): Promise<Result> {
  for (const step of steps) {
    const { error } = await step();
    if (error) return { error };
  }
  return { error: null };
}

async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

/** Creates the group and its members atomically. Safe to retry with the same id. */
async function createOnServer(id: string, input: GroupInput, expenses: Expense[] = []): Promise<Result> {
  return sequence(
    () =>
      supabase.rpc('create_group', {
        p_id: id,
        p_name: input.name,
        p_currency: input.currency,
        p_members: input.members.map((m) => ({ id: m.id, name: m.name, color: m.color ?? null })),
        p_emoji: input.emoji ?? null,
        p_type: input.type ?? 'expenses',
      }),
    () =>
      expenses.length
        ? supabase.from('expenses').upsert(expenses.map((e) => expenseToRow(id, e)))
        : Promise.resolve({ error: null }),
  );
}

/** Uploads groups created with the local-only version of the app. */
async function migrateLegacy(): Promise<void> {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  const legacy = parse<Group[] | null>(raw, null);
  if (!legacy) return;
  for (const g of legacy) {
    const { error } = await createOnServer(g.id, g, g.expenses);
    if (error) return; // Try again on the next sync.
  }
  await AsyncStorage.removeItem(LEGACY_KEY);
}

export function GroupsProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [me, setMeMap] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(supabaseConfigured ? 'connecting' : 'not-configured');
  const [userId, setUserId] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** "group:member" pairs already sent to the server, so each is sent once. */
  const sentMe = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data, error } = await supabase
      .from('groups')
      .select(GROUP_SELECT)
      .order('created_at', { ascending: false });
    if (error || !data) {
      setStatus('offline');
      return;
    }
    setGroups(data.map(rowToGroup));
    setStatus('online');
  }, []);

  const sync = useCallback(async () => {
    if (!supabaseConfigured) return;
    try {
      if (!(await ensureSession())) {
        setStatus('offline');
        return;
      }
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user.id ?? null);
      await migrateLegacy();
      await refresh();
    } catch {
      setStatus('offline');
    }
  }, [refresh]);

  // Load the offline cache first, then sync with the server.
  useEffect(() => {
    AsyncStorage.multiGet([CACHE_KEY, ME_KEY])
      .then(([[, cache], [, meRaw]]) => {
        // Older caches have no categories field.
        setGroups(parse<Group[]>(cache, []).map((g) => ({ ...g, categories: g.categories ?? [], recurring: g.recurring ?? [] })));
        setMeMap(parse<Record<string, string>>(meRaw, {}));
      })
      .catch(() => {})
      .finally(() => {
        setReady(true);
        void sync();
      });
  }, [sync]);

  // Sync again whenever the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => sub.remove();
  }, [sync]);

  // Live updates: any change on the server triggers a (debounced) refetch.
  useEffect(() => {
    if (!userId) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void refresh(), 300);
    };
    const channel = supabase.channel('group-changes');
    for (const table of ['groups', 'members', 'categories', 'expenses', 'recurring_expenses']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
    }
    channel.subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(CACHE_KEY, JSON.stringify(groups)).catch(() => {});
  }, [groups, ready]);

  // Once signed in, register this device for push notifications (asks for permission once).
  useEffect(() => {
    if (userId) void registerForPushNotifications();
  }, [userId]);

  // Tell the server who I am in each group ("¿Quién eres?"), so "te han pagado" reaches me.
  // Also covers choices made before this was stored on the server.
  useEffect(() => {
    if (!userId || status !== 'online') return;
    for (const g of groups) {
      const memberId = me[g.id];
      if (!memberId || g.serverMe === memberId || !g.members.some((m) => m.id === memberId)) continue;
      const key = `${g.id}:${memberId}`;
      if (sentMe.current.has(key)) continue;
      sentMe.current.add(key);
      void supabase.from('group_access').update({ member_id: memberId }).eq('group_id', g.id).eq('user_id', userId);
    }
  }, [groups, me, userId, status]);

  /** Applies a change locally right away, then on the server. Rolls back if the server fails. */
  const mutate = async (change: (gs: Group[]) => Group[], server: () => Promise<Result>) => {
    const previous = groups;
    setGroups(change);
    let failed = false;
    try {
      failed = Boolean((await server()).error);
    } catch {
      failed = true;
    }
    if (failed) {
      setGroups(previous);
      Alert.alert('No se ha podido guardar', 'Comprueba tu conexión a internet e inténtalo de nuevo.');
      void refresh();
    }
    return !failed;
  };

  const mapGroup = (id: string, fn: (g: Group) => Group) => (gs: Group[]) =>
    gs.map((g) => (g.id === id ? fn(g) : g));

  const setMe = (groupId: string, memberId: string) => {
    setMeMap((prev) => {
      const next = { ...prev, [groupId]: memberId };
      AsyncStorage.setItem(ME_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const value: GroupsContextValue = {
    ready,
    status,
    userId,
    groups,
    me,
    refresh,
    setMe,

    createGroup: async (input) => {
      const id = newId();
      const { error } = await createOnServer(id, input);
      if (error) throw new Error('create failed');
      await refresh();
      return id;
    },

    joinGroup: async (code) => {
      const { data, error } = await supabase.rpc('join_group', { p_code: code.trim() });
      if (error || typeof data !== 'string') throw new Error('invalid code');
      await refresh();
      return data;
    },

    updateGroup: (id, input) => {
      const old = groups.find((g) => g.id === id);
      const removed = (old?.members ?? []).filter((m) => !input.members.some((x) => x.id === m.id));
      return mutate(mapGroup(id, (g) => ({ ...g, ...input })), () =>
        sequence(
          () => supabase
              .from('groups')
              .update({ name: input.name, currency: input.currency, emoji: input.emoji ?? null })
              .eq('id', id),
          () => supabase.from('members').upsert(input.members.map((m, i) => memberToRow(id, m, i))),
          () =>
            removed.length
              ? supabase.from('members').delete().in('id', removed.map((m) => m.id))
              : Promise.resolve({ error: null }),
        ),
      );
    },

    leaveGroup: (id) =>
      mutate(
        (gs) => gs.filter((g) => g.id !== id),
        async () => {
          const result = await supabase.rpc('leave_group', { p_group_id: id });
          if (!result.error) {
            setMeMap((prev) => {
              const { [id]: _removed, ...next } = prev;
              AsyncStorage.setItem(ME_KEY, JSON.stringify(next)).catch(() => {});
              return next;
            });
          }
          return result;
        },
      ),

    setMuted: (id, muted) =>
      mutate(
        mapGroup(id, (g) => ({ ...g, muted })),
        async () => supabase.from('group_access').update({ muted }).eq('group_id', id).eq('user_id', userId ?? ''),
      ),

    setArchived: (id, archived) =>
      mutate(
        mapGroup(id, (g) => ({ ...g, archived })),
        async () =>
          supabase.from('group_access').update({ archived }).eq('group_id', id).eq('user_id', userId ?? ''),
      ),

    deleteGroup: (id) =>
      mutate(
        (gs) => gs.filter((g) => g.id !== id),
        async () => supabase.rpc('delete_group', { p_group_id: id }),
      ),

    addMember: async (groupId, name) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return null;
      const member: Member = { id: newId(), name: name.trim(), color: nextColor(group.members) };
      const ok = await mutate(
        mapGroup(groupId, (g) => ({ ...g, members: [...g.members, member] })),
        async () => supabase.from('members').insert(memberToRow(groupId, member, group.members.length)),
      );
      return ok ? member.id : null;
    },

    addCategory: async (groupId, input) => {
      const category: Category = { id: newId(), emoji: input.emoji.trim(), name: input.name.trim() };
      const ok = await mutate(
        mapGroup(groupId, (g) => ({ ...g, categories: [...(g.categories ?? []), category] })),
        async () => supabase.from('categories').insert(categoryToRow(groupId, category)),
      );
      return ok ? category.id : null;
    },

    deleteCategory: (groupId, categoryId) =>
      mutate(
        mapGroup(groupId, (g) => ({ ...g, categories: (g.categories ?? []).filter((c) => c.id !== categoryId) })),
        async () => supabase.from('categories').delete().eq('id', categoryId),
      ),

    addRecurring: async (groupId, input) => {
      const day = new Date(input.date).getDate();
      const first = dateKey(new Date(input.date));
      const plan = planRecurrence(first, day, dateKey(new Date()));
      const { date: _date, recurringId: _rid, ...fields } = input;
      const rule: RecurringExpense = { ...fields, id: newId(), dayOfMonth: day, nextDate: plan.nextDate, active: true };
      // The rule first: the first expense points to it.
      const ok = await mutate(
        mapGroup(groupId, (g) => ({ ...g, recurring: [...(g.recurring ?? []), rule] })),
        async () => supabase.from('recurring_expenses').insert(recurringToRow(groupId, rule)),
      );
      if (!ok) return false;
      if (!plan.createNow) return true;
      const expense: Expense = { ...input, id: newId(), recurringId: rule.id };
      return mutate(
        mapGroup(groupId, (g) => ({ ...g, expenses: [expense, ...g.expenses] })),
        async () => supabase.from('expenses').insert(expenseToRow(groupId, expense)),
      );
    },

    setRecurringActive: (groupId, id, active) => {
      const rule = groups.find((g) => g.id === groupId)?.recurring?.find((r) => r.id === id);
      const nextDate = active && rule ? resumeDate(dateKey(new Date()), rule.dayOfMonth) : rule?.nextDate;
      return mutate(
        mapGroup(groupId, (g) => ({
          ...g,
          recurring: (g.recurring ?? []).map((r) =>
            r.id === id ? { ...r, active, nextDate: nextDate ?? r.nextDate, lastError: null } : r,
          ),
        })),
        async () =>
          supabase
            .from('recurring_expenses')
            .update({ active, next_date: nextDate, last_error: null })
            .eq('id', id),
      );
    },

    deleteRecurring: (groupId, id) =>
      mutate(
        mapGroup(groupId, (g) => ({
          ...g,
          recurring: (g.recurring ?? []).filter((r) => r.id !== id),
          expenses: g.expenses.map((e) => (e.recurringId === id ? { ...e, recurringId: null } : e)),
        })),
        async () => supabase.from('recurring_expenses').delete().eq('id', id),
      ),

    importGroup: async (backup) => {
      const plan = planImport(backup, newId);
      const id = newId();
      const none = () => Promise.resolve({ error: null });
      const { error } = await sequence(
        () =>
          supabase.rpc('create_group', {
            p_id: id,
            p_name: plan.name,
            p_currency: plan.currency,
            p_members: plan.members.map((m) => ({ id: m.id, name: m.name, color: m.color ?? null })),
            p_emoji: plan.emoji,
            p_type: plan.type,
          }),
        () =>
          plan.categories.length
            ? supabase.from('categories').insert(plan.categories.map((c) => categoryToRow(id, c)))
            : none(),
        // Rules before expenses: expenses created by a rule point to it.
        () =>
          plan.recurring.length
            ? supabase.from('recurring_expenses').insert(plan.recurring.map((r) => recurringToRow(id, r)))
            : none(),
        () =>
          plan.expenses.length
            ? supabase.from('expenses').insert(plan.expenses.map((e) => expenseToRow(id, e)))
            : none(),
      );
      if (error) {
        // Don't leave half a group behind (I'm its creator, so I can delete it).
        await supabase.rpc('delete_group', { p_group_id: id });
        throw new Error('import failed');
      }
      await refresh();
      return id;
    },

    addExpense: async (groupId, input) => {
      const expense: Expense = { id: newId(), ...input };
      const ok = await mutate(
        mapGroup(groupId, (g) => ({ ...g, expenses: [expense, ...g.expenses] })),
        async () => supabase.from('expenses').insert(expenseToRow(groupId, expense)),
      );
      return ok ? expense.id : null;
    },

    restoreExpense: (groupId, expense) =>
      mutate(
        mapGroup(groupId, (g) => ({
          ...g,
          expenses: [expense, ...g.expenses.filter((e) => e.id !== expense.id)],
        })),
        // Upsert: safe even if the delete hasn't reached the server yet.
        async () => supabase.from('expenses').upsert(expenseToRow(groupId, expense)),
      ),

    updateExpense: (groupId, expenseId, input) => {
      const expense: Expense = { id: expenseId, ...input };
      const { id: _id, ...row } = expenseToRow(groupId, expense);
      return mutate(
        mapGroup(groupId, (g) => ({ ...g, expenses: g.expenses.map((e) => (e.id === expenseId ? expense : e)) })),
        async () => supabase.from('expenses').update(row).eq('id', expenseId),
      );
    },

    deleteExpense: (groupId, expenseId) =>
      mutate(
        mapGroup(groupId, (g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== expenseId) })),
        async () => supabase.from('expenses').delete().eq('id', expenseId),
      ),
  };

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): GroupsContextValue {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used inside <GroupsProvider>');
  return ctx;
}

export function useGroup(id: string | undefined): Group | undefined {
  return useGroups().groups.find((g) => g.id === id);
}

/** The member id this device has chosen as "me" in the group, if any. */
export function useMe(groupId: string | undefined): string | undefined {
  const { me, groups } = useGroups();
  const memberId = groupId ? me[groupId] : undefined;
  const group = groups.find((g) => g.id === groupId);
  return group?.members.some((m) => m.id === memberId) ? memberId : undefined;
}
