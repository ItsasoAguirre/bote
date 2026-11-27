import { currentLanguage, formatDate, t } from '@/i18n';

import { computeBalances, computeSettlements, totalSpent } from './balances';
import { findCategory, INCOME_CATEGORY, TRANSFER_CATEGORY } from './categories';
import { formatMoney } from './money';
import { expensePayments } from './split';
import { categoryTotals, memberTotals, totalIncome } from './stats';
import type { Expense, Group } from './types';

/**
 * HTML for the group's PDF summary (printed with expo-print). Pure function, so it can be tested.
 * Everything typed by people (names, concepts) is escaped.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const day = (date: Date | string) => formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
const long = (date: Date) => formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' });

export function buildSummaryHtml(group: Group, now = new Date()): string {
  const e = escapeHtml;
  const money = (cents: number) => e(formatMoney(cents, group.currency));
  const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? '?';
  const names = (ids: string[]) => ids.map((id) => e(nameOf(id))).join(', ');

  const spent = totalSpent(group);
  const income = totalIncome(group);
  const balances = computeBalances(group);
  const settlements = computeSettlements(balances);
  const perMember = memberTotals(group);
  const categories = categoryTotals(group);
  const movements = [...group.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const dates = movements.map((m) => new Date(m.date));
  const period =
    dates.length > 0 ? `${day(dates[0])} – ${day(dates[dates.length - 1])}` : t('summary.noMovementsPeriod');

  const signed = (cents: number) =>
    cents > 0 ? `<span class="pos">+${money(cents)}</span>` : cents < 0 ? `<span class="neg">${money(cents)}</span>` : '0';

  const who = (m: Expense) =>
    m.kind === 'transfer'
      ? `${e(nameOf(m.paidBy))} → ${e(nameOf(m.splitAmong[0]))}`
      : m.kind === 'income'
        ? t('summary.whoIncome', { name: e(nameOf(m.paidBy)), names: names(m.splitAmong) })
        : t('summary.whoExpense', { payers: names(Object.keys(expensePayments(m))), names: names(m.splitAmong) });

  const categoryOf = (m: Expense) => {
    const c =
      m.kind === 'transfer'
        ? TRANSFER_CATEGORY
        : m.kind === 'income' && !m.category
          ? INCOME_CATEGORY
          : findCategory(group, m.category);
    return `${c.emoji} ${e(c.name)}`;
  };

  const amountCell = (m: Expense) =>
    m.kind === 'income'
      ? `<span class="pos">+${money(m.amount)}</span>`
      : m.kind === 'transfer'
        ? `<span class="muted">${money(m.amount)}</span>`
        : money(m.amount);

  return `<!doctype html>
<html lang="${currentLanguage()}">
<head>
<meta charset="utf-8" />
<title>${e(group.name)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: -apple-system, Roboto, "Segoe UI", sans-serif; color: #111418; font-size: 11pt; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1px solid #E1E4EA; padding-bottom: 3pt; }
  .sub { color: #5F6670; font-size: 9.5pt; margin-bottom: 10pt; }
  .tiles { display: flex; gap: 8pt; }
  .tile { flex: 1; border: 1px solid #E1E4EA; border-radius: 6pt; padding: 7pt 9pt; }
  .tile .label { color: #5F6670; font-size: 9pt; }
  .tile .value { font-size: 14pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { text-align: left; color: #5F6670; font-weight: 600; font-size: 9pt; border-bottom: 1px solid #E1E4EA; padding: 4pt 4pt; }
  td { border-bottom: 1px solid #F0F1F4; padding: 4pt 4pt; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr { page-break-inside: avoid; }
  .pos { color: #2B8A3E; font-weight: 600; }
  .neg { color: #C92A2A; font-weight: 600; }
  .muted { color: #5F6670; }
  ul { margin: 0; padding-left: 16pt; }
  .foot { color: #5F6670; font-size: 8.5pt; margin-top: 18pt; }
</style>
</head>
<body>
  <h1>${e(group.emoji ?? '👥')} ${e(group.name)}</h1>
  <div class="sub">${e(period)} · ${e(t('summary.movementCount', { count: group.expenses.length }))} · ${e(t('summary.peopleCount', { count: group.members.length }))} · ${e(group.currency)}</div>

  <div class="tiles">
    <div class="tile"><div class="label">${e(t('summary.totalSpent'))}</div><div class="value">${money(spent)}</div></div>
    <div class="tile"><div class="label">${e(t('summary.perPerson'))}</div><div class="value">${money(Math.round(spent / Math.max(group.members.length, 1)))}</div></div>
    ${income > 0 ? `<div class="tile"><div class="label">${e(t('summary.income'))}</div><div class="value pos">+${money(income)}</div></div>` : ''}
  </div>

  <h2>${e(t('summary.balances'))}</h2>
  <table>
    <tr><th>${e(t('summary.person'))}</th><th class="num">${e(t('summary.paid'))}</th><th class="num">${e(t('summary.share'))}</th><th class="num">${e(t('summary.balance'))}</th></tr>
    ${perMember
      .map(
        ({ member, paid, share }) =>
          `<tr><td>${e(member.name)}</td><td class="num">${money(paid)}</td><td class="num">${money(share)}</td><td class="num">${signed(balances[member.id] ?? 0)}</td></tr>`,
      )
      .join('\n    ')}
  </table>

  <h2>${e(t('summary.settleUp'))}</h2>
  ${
    settlements.length === 0
      ? `<p>${e(t('summary.allSettled'))}</p>`
      : `<ul>${settlements.map((s) => `<li>${t('summary.settlement', { from: e(nameOf(s.from)), amount: money(s.amount), to: e(nameOf(s.to)) })}</li>`).join('')}</ul>`
  }

  ${
    categories.length > 0
      ? `<h2>${e(t('summary.byCategory'))}</h2>
  <table>
    <tr><th>${e(t('summary.category'))}</th><th class="num">${e(t('summary.expenses'))}</th><th class="num">${e(t('summary.amount'))}</th><th class="num">%</th></tr>
    ${categories
      .map(
        (c) =>
          `<tr><td>${c.category.emoji} ${e(c.category.name)}</td><td class="num">${c.count}</td><td class="num">${money(c.amount)}</td><td class="num">${spent > 0 ? Math.round((c.amount / spent) * 100) : 0}%</td></tr>`,
      )
      .join('\n    ')}
  </table>`
      : ''
  }

  <h2>${e(t('summary.movements'))}</h2>
  ${
    movements.length === 0
      ? `<p class="muted">${e(t('summary.noMovements'))}</p>`
      : `<table>
    <tr><th>${e(t('summary.date'))}</th><th>${e(t('summary.title'))}</th><th>${e(t('summary.category'))}</th><th>${e(t('summary.who'))}</th><th class="num">${e(t('summary.amount'))}</th></tr>
    ${movements
      .map(
        (m) =>
          `<tr><td>${e(day(m.date))}</td><td>${e(m.title)}${m.recurringId ? ' 🔁' : ''}</td><td>${categoryOf(m)}</td><td>${who(m)}</td><td class="num">${amountCell(m)}</td></tr>`,
      )
      .join('\n    ')}
  </table>`
  }

  <div class="foot">${e(t('summary.footer', { date: long(now) }))}</div>
</body>
</html>`;
}
