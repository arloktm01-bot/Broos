import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Plus,
  SlidersHorizontal,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  AccountingState,
  AccountingSummary,
  InventoryItem,
  TransactionType,
} from '../types/accounting';
import { formatCurrency, formatPercent } from '../utils/calculations';
import { InteractivePieChart } from './InteractivePieChart';
import {
  OverviewDetailPanel,
  OverviewPanelDetailsModal,
} from './OverviewPanelDetailsModal';

export type AppSection =
  | 'overview'
  | 'transactions'
  | 'recurring'
  | 'petty_cash'
  | 'budget'
  | 'inventory';

interface OverviewPageProps {
  state: AccountingState;
  summary: AccountingSummary;
  isAdmin: boolean;
  onNavigate: (section: AppSection) => void;
  onOpenTransactionModal: (type: TransactionType, skuId?: string) => void;
  onOpenInventoryModal: (item?: InventoryItem | null) => void;
  onDeleteInventory: (id: string) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
}

const TX_TYPE_LABEL: Record<TransactionType, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  petty_cash_expense: 'Petty Cash Expense',
  operating_expense: 'Operating Expense',
  petty_cash_replenish: 'Petty Cash Replenish',
};

export const OverviewPage: React.FC<OverviewPageProps> = ({
  state,
  summary,
  isAdmin,
  onNavigate,
  onOpenTransactionModal,
  onOpenInventoryModal,
  onDeleteInventory,
  onDeleteTransaction,
}) => {
  const { currency } = state;
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<string | null>(null);
  const [deletingInvId, setDeletingInvId] = useState<string | null>(null);
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [detailPanel, setDetailPanel] = useState<OverviewDetailPanel | null>(null);

  const handleConfirmDeleteInv = async (id: string) => {
    setDeletingInvId(id);
    try {
      await onDeleteInventory(id);
      setConfirmDeleteInvId(null);
    } finally {
      setDeletingInvId(null);
    }
  };

  const handleConfirmDeleteTx = async (id: string) => {
    setDeletingTxId(id);
    try {
      await onDeleteTransaction(id);
      setConfirmDeleteTxId(null);
    } finally {
      setDeletingTxId(null);
    }
  };

  const budgetSlices = summary.budgetAllocations.map((b) => ({
    id: b.id,
    name: b.name,
    value: b.allocatedAmount,
    percentage: b.percentage,
    color: b.color,
    subtitle: b.description,
  }));

  const costSlices = summary.costComposition.map((c) => ({
    id: c.id,
    name: c.name,
    value: c.value,
    color: c.color,
  }));

  const recentTransactions = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const pendingCount = state.pendingRecurring?.length || 0;

  return (
    <div className="space-y-6">
      {pendingCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-slate-900">
                {pendingCount} recurring{' '}
                {pendingCount === 1 ? 'transaction' : 'transactions'} awaiting approval
              </span>
              <span className="text-slate-500 ml-2 hidden sm:inline">
                Review scheduled amounts and dates before posting to the general ledger.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('recurring')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Review Queue
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4-Column At-a-Glance Summary Strip */}
      <section aria-label="Key Financial and Inventory Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Total Stock Levels
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {state.inventory.length} SKUs
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {summary.totalStockLevels.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">units stocked</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Units Sold</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {summary.totalUnitsSold.toLocaleString()} units
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailPanel('stock_levels')}
                className="w-full inline-flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50/80 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <span>See Details</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Stocks Remaining
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {formatPercent(summary.stockUtilizationPct)} on hand
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {summary.totalStocksRemaining.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">units available</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Cost Valuation</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {formatCurrency(summary.inventoryAssetValue, currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailPanel('stocks_remaining')}
                className="w-full inline-flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50/80 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <span>See Details</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Total Sales
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {summary.salesCount} orders
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {formatCurrency(summary.totalSales, currency)}
                </span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Gross Profit</span>
                <span className="font-mono tabular-nums font-medium text-teal-700">
                  {formatCurrency(summary.grossProfit, currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailPanel('total_sales')}
                className="w-full inline-flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50/80 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <span>See Details</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Profit Margins
                </span>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  Gross {formatPercent(summary.grossMarginPct)}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    summary.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'
                  }`}
                >
                  {formatPercent(summary.netMarginPct)}
                </span>
                <span className="text-xs text-slate-500">net margin</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Net Income</span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    summary.netProfit >= 0 ? 'text-slate-900' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(summary.netProfit, currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailPanel('profit_margins')}
                className="w-full inline-flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50/80 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <span>See Details</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Pie Charts Row */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Net Income Budget Allocation
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Interactive split of {formatCurrency(Math.max(0, summary.netProfit), currency)} net profit across target funds
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('budget')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {isAdmin ? 'Adjust Split' : 'View Allocation'}
            </button>
          </div>

          <InteractivePieChart
            slices={budgetSlices}
            variant="pie"
            currency={currency}
            emptyMessage={`Net Income is currently ${formatCurrency(0, currency)} or negative.`}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Revenue, Cost & Profit Distribution
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Breakdown of {formatCurrency(summary.totalSales, currency)} gross sales across COGS, expenses, and profit
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('petty_cash')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Wallet className="w-3.5 h-3.5" />
                Petty Cash
              </button>
            </div>

            <InteractivePieChart
              slices={costSlices}
              variant="donut"
              currency={currency}
              centerLabel="Total Sales"
              centerValue={formatCurrency(summary.totalSales, currency)}
              emptyMessage="Record sales or expenses to inspect financial distribution."
            />
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Petty Cash Balance</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm mt-0.5 block">
                {formatCurrency(summary.pettyCashBalance, currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Total Purchases</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm mt-0.5 block">
                {formatCurrency(summary.totalPurchases, currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Operating + Petty Cash</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm mt-0.5 block">
                {formatCurrency(summary.totalExpenses, currency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Inventory Management Status at a Glance */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Inventory Management Status
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Stock levels, remaining units, unit profit margins, and reorder readiness
              {summary.lowStockCount > 0 && (
                <span>
                  {' '}
                  · <strong className="text-amber-700 font-medium">{summary.lowStockCount} low stock</strong>
                </span>
              )}
              {summary.outOfStockCount > 0 && (
                <span>
                  {' '}
                  · <strong className="text-red-700 font-medium">{summary.outOfStockCount} out of stock</strong>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={() => onOpenInventoryModal(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Inventory SKU
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
            >
              Manage Full Inventory
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">SKU & Product</th>
                <th className="py-2.5 px-4 text-right">Total Stocked</th>
                <th className="py-2.5 px-4 text-right">Remaining</th>
                <th className="py-2.5 px-4 w-44">Stock Level</th>
                <th className="py-2.5 px-4 text-right">Unit Margin</th>
                <th className="py-2.5 px-4">Status</th>
                {isAdmin && (
                  <th className="py-2.5 px-6 text-right">Quick Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {state.inventory.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-10 px-6 text-center text-slate-500 text-sm">
                    No inventory SKUs recorded yet.
                  </td>
                </tr>
              ) : (
                state.inventory.map((item) => {
                  const pctRemaining =
                    item.totalStockLevel > 0
                      ? (item.stockRemaining / item.totalStockLevel) * 100
                      : 0;
                  const unitMarginPct =
                    item.sellingPrice > 0
                      ? ((item.sellingPrice - item.unitCost) / item.sellingPrice) * 100
                      : 0;
                  const isOut = item.stockRemaining <= 0;
                  const isLow =
                    !isOut && item.stockRemaining <= item.reorderLevel;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-6">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{item.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {item.totalStockLevel.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {item.stockRemaining.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isOut
                                  ? 'bg-red-500'
                                  : isLow
                                    ? 'bg-amber-500'
                                    : 'bg-teal-600'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, pctRemaining))}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500 w-10 text-right">
                            {Math.round(pctRemaining)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span className="font-medium text-slate-900">
                          {formatPercent(unitMarginPct)}
                        </span>
                        <span className="text-xs text-slate-400 block">
                          {formatCurrency(item.sellingPrice - item.unitCost, currency)}/ea
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            In Stock
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-6 text-right whitespace-nowrap">
                          {confirmDeleteInvId === item.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingInvId === item.id}
                                onClick={() => handleConfirmDeleteInv(item.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                              >
                                {deletingInvId === item.id ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteInvId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isOut}
                                onClick={() => onOpenTransactionModal('sale', item.id)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-md transition-colors"
                              >
                                Sell
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenTransactionModal('purchase', item.id)}
                                className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                              >
                                Restock
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteInvId(item.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
      </section>

      {/* Recent Transactions Preview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Recent Ledger Activity
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Latest sales, inventory purchases, petty cash vouchers, and operating expenses
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={() => onOpenTransactionModal('petty_cash_expense')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Petty Cash Expense
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
            >
              View Full Ledger
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Date</th>
                <th className="py-2.5 px-4">Ref</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Entry Type</th>
                <th className="py-2.5 px-6 text-right">Amount</th>
                {isAdmin && (
                  <th className="py-2.5 px-6 text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="py-8 px-6 text-center text-slate-500">
                    No transactions recorded yet. Click Record Transaction to add your first entry.
                  </td>
                </tr>
              ) : (
                recentTransactions.map((tx) => {
                  const isInflow = tx.type === 'sale' || tx.type === 'petty_cash_replenish';
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
                        <div className="text-xs text-slate-500">
                          {tx.category} · {tx.paymentMethod}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {TX_TYPE_LABEL[tx.type]}
                      </td>
                      <td
                        className={`py-3 px-6 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          tx.type === 'sale'
                            ? 'text-teal-700'
                            : tx.type === 'petty_cash_replenish'
                              ? 'text-slate-700'
                              : 'text-slate-900'
                        }`}
                      >
                        {tx.type === 'sale' ? '+' : isInflow ? '' : '-'}
                        {formatCurrency(tx.amount, currency)}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-6 text-right whitespace-nowrap">
                          {confirmDeleteTxId === tx.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingTxId === tx.id}
                                onClick={() => handleConfirmDeleteTx(tx.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                              >
                                {deletingTxId === tx.id ? 'Voiding...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTxId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTxId(tx.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                              aria-label={`Delete transaction ${tx.reference}`}
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
      </section>

      <OverviewPanelDetailsModal
        panel={detailPanel}
        state={state}
        summary={summary}
        onSelectPanel={setDetailPanel}
        onClose={() => setDetailPanel(null)}
      />
    </div>
  );
};
