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

const DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const LONG = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

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
    dates.length > 0 ? `${DAY.format(dates[0])} – ${DAY.format(dates[dates.length - 1])}` : 'Sin movimientos';

  const signed = (cents: number) =>
    cents > 0 ? `<span class="pos">+${money(cents)}</span>` : cents < 0 ? `<span class="neg">${money(cents)}</span>` : '0';

  const who = (m: Expense) =>
    m.kind === 'transfer'
      ? `${e(nameOf(m.paidBy))} → ${e(nameOf(m.splitAmong[0]))}`
      : m.kind === 'income'
        ? `Recibió ${e(nameOf(m.paidBy))} · para ${names(m.splitAmong)}`
        : `Pagó ${names(Object.keys(expensePayments(m)))} · para ${names(m.splitAmong)}`;

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
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${e(group.name)}</title>
<style>
  @page { margin: 16mm 14mm; }
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
  <div class="sub">${e(period)} · ${group.expenses.length} movimientos · ${group.members.length} personas · ${e(group.currency)}</div>

  <div class="tiles">
    <div class="tile"><div class="label">Gasto total</div><div class="value">${money(spent)}</div></div>
    <div class="tile"><div class="label">Por persona</div><div class="value">${money(Math.round(spent / Math.max(group.members.length, 1)))}</div></div>
    ${income > 0 ? `<div class="tile"><div class="label">Ingresos</div><div class="value pos">+${money(income)}</div></div>` : ''}
  </div>

  <h2>Saldos</h2>
  <table>
    <tr><th>Persona</th><th class="num">Pagó</th><th class="num">Su parte</th><th class="num">Saldo</th></tr>
    ${perMember
      .map(
        ({ member, paid, share }) =>
          `<tr><td>${e(member.name)}</td><td class="num">${money(paid)}</td><td class="num">${money(share)}</td><td class="num">${signed(balances[member.id] ?? 0)}</td></tr>`,
      )
      .join('\n    ')}
  </table>

  <h2>Cómo saldar cuentas</h2>
  ${
    settlements.length === 0
      ? '<p>Todo está saldado. Nadie debe nada.</p>'
      : `<ul>${settlements.map((s) => `<li>${e(nameOf(s.from))} paga ${money(s.amount)} a ${e(nameOf(s.to))}</li>`).join('')}</ul>`
  }

  ${
    categories.length > 0
      ? `<h2>Gasto por categoría</h2>
  <table>
    <tr><th>Categoría</th><th class="num">Gastos</th><th class="num">Importe</th><th class="num">%</th></tr>
    ${categories
      .map(
        (c) =>
          `<tr><td>${c.category.emoji} ${e(c.category.name)}</td><td class="num">${c.count}</td><td class="num">${money(c.amount)}</td><td class="num">${spent > 0 ? Math.round((c.amount / spent) * 100) : 0}%</td></tr>`,
      )
      .join('\n    ')}
  </table>`
      : ''
  }

  <h2>Movimientos</h2>
  ${
    movements.length === 0
      ? '<p class="muted">Todavía no hay movimientos.</p>'
      : `<table>
    <tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Quién</th><th class="num">Importe</th></tr>
    ${movements
      .map(
        (m) =>
          `<tr><td>${e(DAY.format(new Date(m.date)))}</td><td>${e(m.title)}${m.recurringId ? ' 🔁' : ''}</td><td>${categoryOf(m)}</td><td>${who(m)}</td><td class="num">${amountCell(m)}</td></tr>`,
      )
      .join('\n    ')}
  </table>`
  }

  <div class="foot">Generado con Bote el ${e(LONG.format(now))}.</div>
</body>
</html>`;
}
