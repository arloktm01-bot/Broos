import React, { useMemo, useState } from 'react';
import { Download, Plus, Search, Trash2 } from 'lucide-react';
import {
  AccountingState,
  AccountingSummary,
  TransactionType,
} from '../types/accounting';
import { formatCurrency } from '../utils/calculations';

interface TransactionsPageProps {
  state: AccountingState;
  summary: AccountingSummary;
  isAdmin: boolean;
  onOpenTransactionModal: (type: TransactionType) => void;
  onDeleteTransaction: (id: string) => Promise<void>;
}

const FILTER_TABS: { id: 'all' | TransactionType; label: string }[] = [
  { id: 'all', label: 'All Entries' },
  { id: 'sale', label: 'Sales' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'petty_cash_expense', label: 'Petty Cash' },
  { id: 'operating_expense', label: 'Operating Expenses' },
  { id: 'petty_cash_replenish', label: 'Replenishments' },
];

const TYPE_LABEL: Record<TransactionType, string> = {
  sale: 'Sale',
  purchase: 'Inventory Purchase',
  petty_cash_expense: 'Petty Cash Expense',
  operating_expense: 'Operating Expense',
  petty_cash_replenish: 'Petty Cash Replenish',
};

export const TransactionsPage: React.FC<TransactionsPageProps> = ({
  state,
  summary,
  isAdmin,
  onOpenTransactionModal,
  onDeleteTransaction,
}) => {
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bucketMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of state.budgetRules) {
      map[r.id] = r.name;
    }
    return map;
  }, [state.budgetRules]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...state.transactions]
      .filter((tx) => (filterType === 'all' ? true : tx.type === filterType))
      .filter((tx) => {
        if (!q) return true;
        return (
          tx.description.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q) ||
          tx.reference.toLowerCase().includes(q) ||
          tx.paymentMethod.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      );
  }, [state.transactions, filterType, searchQuery]);

  const filteredStats = useMemo(() => {
    let sales = 0;
    let outflows = 0;
    for (const tx of filtered) {
      if (tx.type === 'sale') sales += tx.amount;
      else if (tx.type !== 'petty_cash_replenish') outflows += tx.amount;
    }
    return { sales, outflows, count: filtered.length };
  }, [filtered]);

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Reference',
      'Type',
      'Description',
      'Category',
      'Payment Method',
      'Amount',
      'COGS',
      'Budget Bucket',
    ];
    const rows = filtered.map((tx) => [
      tx.date,
      tx.reference,
      TYPE_LABEL[tx.type],
      `"${tx.description.replace(/"/g, '""')}"`,
      `"${tx.category.replace(/"/g, '""')}"`,
      tx.paymentMethod,
      tx.amount.toFixed(2),
      tx.cogs !== undefined ? tx.cogs.toFixed(2) : '',
      tx.budgetBucketId ? `"${bucketMap[tx.budgetBucketId] || tx.budgetBucketId}"` : '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledgercraft-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteTransaction(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Income Statement Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Total Sales</span>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.totalSales, state.currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Cost of Goods Sold</span>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.totalCogs, state.currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Gross Profit</span>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-teal-700">
            {formatCurrency(summary.grossProfit, state.currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Operating & Petty Cash</span>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.totalExpenses, state.currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Net Profit (Net Income)</span>
          <div
            className={`mt-1 text-lg font-bold font-mono tabular-nums ${
              summary.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'
            }`}
          >
            {formatCurrency(summary.netProfit, state.currency)}
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filterType === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onOpenTransactionModal('sale')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Entry
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by description, voucher, reference, or category..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-3 font-mono tabular-nums">
              <span>{filteredStats.count} entries</span>
              <span aria-hidden="true">·</span>
              <span>
                Sales: <strong className="text-slate-900">{formatCurrency(filteredStats.sales, state.currency)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Outflows: <strong className="text-slate-900">{formatCurrency(filteredStats.outflows, state.currency)}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Date</th>
                <th className="py-2.5 px-4">Reference</th>
                <th className="py-2.5 px-4">Description & Category</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4 text-right">COGS</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                {isAdmin && (
                  <th className="py-2.5 px-6 text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-12 px-6 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No matching transactions found
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try clearing your search filter or record a new transaction.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const isSale = tx.type === 'sale';
                  const isReplenish = tx.type === 'petty_cash_replenish';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-6 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {tx.reference}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{tx.description}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <span>{tx.category}</span>
                          {tx.recurringRuleId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-700 font-medium">
                                Recurring
                              </span>
                            </>
                          )}
                          {tx.budgetBucketId && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-teal-700">
                                Budget: {bucketMap[tx.budgetBucketId] || tx.budgetBucketId}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {TYPE_LABEL[tx.type]}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {tx.paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {tx.cogs !== undefined ? formatCurrency(tx.cogs, state.currency) : '—'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          isSale
                            ? 'text-teal-700'
                            : isReplenish
                              ? 'text-slate-700'
                              : 'text-slate-900'
                        }`}
                      >
                        {isSale ? '+' : isReplenish ? '' : '-'}
                        {formatCurrency(tx.amount, state.currency)}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-6 text-right whitespace-nowrap">
                          {confirmDeleteId === tx.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === tx.id}
                                onClick={() => handleConfirmDelete(tx.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                              >
                                {deletingId === tx.id ? 'Voiding...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(tx.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                              aria-label={`Void transaction ${tx.reference}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
