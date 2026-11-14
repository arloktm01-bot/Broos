import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  AccountingState,
  AccountingSummary,
  TransactionType,
} from '../types/accounting';
import { formatCurrency, formatPercent } from '../utils/calculations';
import { InteractivePieChart } from './InteractivePieChart';

interface PettyCashPageProps {
  state: AccountingState;
  summary: AccountingSummary;
  isAdmin: boolean;
  onOpenTransactionModal: (type: TransactionType) => void;
  onDeleteTransaction: (id: string) => Promise<void>;
}

export const PettyCashPage: React.FC<PettyCashPageProps> = ({
  state,
  summary,
  isAdmin,
  onOpenTransactionModal,
  onDeleteTransaction,
}) => {
  const { currency } = state;
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteTransaction(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const pettyCashLedger = useMemo(() => {
    const relevant = state.transactions
      .filter(
        (t) =>
          t.type === 'petty_cash_expense' || t.type === 'petty_cash_replenish'
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      );

    let running = 0;
    const withBalance = relevant.map((tx) => {
      if (tx.type === 'petty_cash_replenish') {
        running += tx.amount;
      } else {
        running -= tx.amount;
      }
      return { ...tx, runningBalance: running };
    });

    return withBalance.reverse();
  }, [state.transactions]);

  const utilizationPct =
    state.pettyCashLimit > 0
      ? (summary.pettyCashBalance / state.pettyCashLimit) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Petty Cash Imprest KPI Strip */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        } gap-4`}
      >
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Petty Cash Balance Available
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.pettyCashBalance, currency)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Target Imprest Limit</span>
            <span className="font-mono tabular-nums font-medium">
              {formatCurrency(state.pettyCashLimit, currency)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Total Disbursed (Expenses)
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.totalPettyCashExpenses, currency)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Voucher Count</span>
            <span className="font-mono tabular-nums font-medium">
              {
                state.transactions.filter((t) => t.type === 'petty_cash_expense')
                  .length
              }{' '}
              vouchers
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Total Replenished
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-teal-700">
            {formatCurrency(summary.totalPettyCashReplenished, currency)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Fund Coverage</span>
            <span className="font-mono tabular-nums font-medium">
              {formatPercent(utilizationPct)} of limit
            </span>
          </div>
        </div>

        {isAdmin && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-medium text-slate-500">
                Quick Petty Cash Actions
              </span>
              <p className="text-xs text-slate-600 mt-1">
                Record small cash vouchers or reimburse the imprest box.
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                onClick={() => onOpenTransactionModal('petty_cash_expense')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Petty Cash Expense
              </button>
              <button
                type="button"
                onClick={() => onOpenTransactionModal('petty_cash_replenish')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Replenish Fund
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Breakdown Pie Chart + Imprest Rule Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">
              Petty Cash Spend by Category
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Interactive breakdown of all petty cash disbursements ({formatCurrency(summary.totalPettyCashExpenses, currency)})
            </p>
          </div>
          <InteractivePieChart
            slices={summary.pettyCashByCategory}
            variant="pie"
            currency={currency}
            emptyMessage="No petty cash expenses recorded yet."
          />
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Imprest Fund Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Replenishments transfer cash from your operating bank without double-counting expenses.
            </p>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Opening & Replenishments</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {formatCurrency(summary.totalPettyCashReplenished, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Less: Petty Cash Vouchers</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  -{formatCurrency(summary.totalPettyCashExpenses, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="font-semibold text-slate-900">
                  Cash on Hand in Petty Box
                </span>
                <span className="font-mono tabular-nums font-bold text-teal-700 text-base">
                  {formatCurrency(summary.pettyCashBalance, currency)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
              <span>Imprest Capacity Remaining</span>
              <span className="font-mono tabular-nums font-medium">
                {formatPercent(Math.min(100, Math.max(0, utilizationPct)))}
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, utilizationPct))}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Petty Cash Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Petty Cash Voucher Register
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological record of disbursements and replenishments with running balance
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Date</th>
                <th className="py-2.5 px-4">Voucher #</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Disbursed / Added</th>
                <th className="py-2.5 px-6 text-right">Running Balance</th>
                {isAdmin && (
                  <th className="py-2.5 px-6 text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pettyCashLedger.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-10 px-6 text-center text-slate-500">
                    No petty cash entries yet. Replenish your petty cash fund to begin tracking vouchers.
                  </td>
                </tr>
              ) : (
                pettyCashLedger.map((tx) => {
                  const isReplenish = tx.type === 'petty_cash_replenish';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-6 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {tx.reference}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {tx.description}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {isReplenish ? (
                          <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            Replenishment
                          </span>
                        ) : (
                          tx.category
                        )}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          isReplenish ? 'text-teal-700' : 'text-slate-900'
                        }`}
                      >
                        {isReplenish ? '+' : '-'}
                        {formatCurrency(tx.amount, currency)}
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums font-medium text-slate-700 whitespace-nowrap">
                        {formatCurrency(tx.runningBalance, currency)}
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
                              aria-label={`Delete petty cash voucher ${tx.reference}`}
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
