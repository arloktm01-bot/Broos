import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
  XCircle,
} from 'lucide-react';
import {
  AccountingState,
  AccountingSummary,
  InventoryItem,
  Transaction,
} from '../types/accounting';
import { formatCurrency, formatPercent } from '../utils/calculations';

export type OverviewDetailPanel =
  | 'stock_levels'
  | 'stocks_remaining'
  | 'total_sales'
  | 'profit_margins';

interface OverviewPanelDetailsModalProps {
  panel: OverviewDetailPanel | null;
  state: AccountingState;
  summary: AccountingSummary;
  onSelectPanel: (panel: OverviewDetailPanel) => void;
  onClose: () => void;
}

interface CategoryRecordGroup {
  category: string;
  items: InventoryItem[];
  salesTransactions: Transaction[];
  totalStockLevel: number;
  stockRemaining: number;
  unitsSoldInventory: number;
  costValuation: number;
  retailValuation: number;
  lowStockCount: number;
  outOfStockCount: number;
  salesCount: number;
  unitsSoldTransactions: number;
  salesRevenue: number;
  salesCogs: number;
  realizedGrossProfit: number;
  realizedGrossMarginPct: number;
  catalogPotentialRevenue: number;
  catalogPotentialCost: number;
  catalogUnitMarginPct: number;
}

const PANEL_META: Record<
  OverviewDetailPanel,
  { tabLabel: string; title: string; subtitle: string }
> = {
  stock_levels: {
    tabLabel: 'Total Stock Levels',
    title: 'Total Stock Levels by Product Category',
    subtitle:
      'Cumulative stocked units, sold units, and product records grouped by every uploaded category',
  },
  stocks_remaining: {
    tabLabel: 'Stocks Remaining',
    title: 'Stocks Remaining by Product Category',
    subtitle:
      'Available on-hand inventory, cost valuation, and reorder readiness across every product category',
  },
  total_sales: {
    tabLabel: 'Total Sales',
    title: 'Total Sales by Product Category',
    subtitle:
      'Recorded sales revenue, order counts, and transaction entries grouped by product category',
  },
  profit_margins: {
    tabLabel: 'Profit Margins',
    title: 'Profit Margins by Product Category',
    subtitle:
      'Catalog unit margins and realized gross profit performance for every uploaded product category',
  },
};

export const OverviewPanelDetailsModal: React.FC<
  OverviewPanelDetailsModalProps
> = ({ panel, state, summary, onSelectPanel, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!panel) return;
    setSelectedCategory('all');
    setCollapsedCategories({});

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panel, onClose]);

  const categoryGroups = useMemo<CategoryRecordGroup[]>(() => {
    const skuMap = new Map<string, InventoryItem>();
    const groupMap = new Map<
      string,
      { items: InventoryItem[]; salesTransactions: Transaction[] }
    >();

    const ensureGroup = (cat: string) => {
      const key = cat.trim() || 'Uncategorized';
      if (!groupMap.has(key)) {
        groupMap.set(key, { items: [], salesTransactions: [] });
      }
      return groupMap.get(key)!;
    };

    for (const item of state.inventory) {
      skuMap.set(item.id, item);
      ensureGroup(item.category).items.push(item);
    }

    for (const tx of state.transactions) {
      if (tx.type !== 'sale') continue;
      const linkedSku = tx.skuId ? skuMap.get(tx.skuId) : undefined;
      const cat = linkedSku?.category || tx.category || 'Uncategorized Sales';
      ensureGroup(cat).salesTransactions.push(tx);
    }

    const groups: CategoryRecordGroup[] = [];
    for (const [category, { items, salesTransactions }] of groupMap.entries()) {
      let totalStockLevel = 0;
      let stockRemaining = 0;
      let costValuation = 0;
      let retailValuation = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      let catalogPotentialRevenue = 0;
      let catalogPotentialCost = 0;

      for (const item of items) {
        totalStockLevel += item.totalStockLevel;
        stockRemaining += item.stockRemaining;
        costValuation += item.stockRemaining * item.unitCost;
        retailValuation += item.stockRemaining * item.sellingPrice;
        const unitWeight = Math.max(1, item.totalStockLevel);
        catalogPotentialRevenue += unitWeight * item.sellingPrice;
        catalogPotentialCost += unitWeight * item.unitCost;
        if (item.stockRemaining <= 0) {
          outOfStockCount += 1;
        } else if (item.stockRemaining <= item.reorderLevel) {
          lowStockCount += 1;
        }
      }

      const sortedSales = [...salesTransactions].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      );

      let salesRevenue = 0;
      let salesCogs = 0;
      let unitsSoldTransactions = 0;
      for (const tx of sortedSales) {
        salesRevenue += Number(tx.amount) || 0;
        salesCogs += Number(tx.cogs) || 0;
        unitsSoldTransactions += Number(tx.quantity) || 0;
      }

      const realizedGrossProfit = salesRevenue - salesCogs;
      const realizedGrossMarginPct =
        salesRevenue > 0 ? (realizedGrossProfit / salesRevenue) * 100 : 0;
      const catalogUnitMarginPct =
        catalogPotentialRevenue > 0
          ? ((catalogPotentialRevenue - catalogPotentialCost) /
              catalogPotentialRevenue) *
            100
          : 0;

      groups.push({
        category,
        items,
        salesTransactions: sortedSales,
        totalStockLevel,
        stockRemaining,
        unitsSoldInventory: Math.max(0, totalStockLevel - stockRemaining),
        costValuation,
        retailValuation,
        lowStockCount,
        outOfStockCount,
        salesCount: sortedSales.length,
        unitsSoldTransactions,
        salesRevenue,
        salesCogs,
        realizedGrossProfit,
        realizedGrossMarginPct,
        catalogPotentialRevenue,
        catalogPotentialCost,
        catalogUnitMarginPct,
      });
    }

    return groups.sort((a, b) => a.category.localeCompare(b.category));
  }, [state.inventory, state.transactions]);

  if (!panel) return null;

  const { currency } = state;
  const meta = PANEL_META[panel];

  const visibleGroups =
    selectedCategory === 'all'
      ? categoryGroups
      : categoryGroups.filter((g) => g.category === selectedCategory);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const renderPanelHeadlineStat = () => {
    switch (panel) {
      case 'stock_levels':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Categories</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {categoryGroups.length}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Uploaded SKUs</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {state.inventory.length}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Total Stocked</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {summary.totalStockLevels.toLocaleString()} units
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Units Sold</span>
              <span className="text-lg font-bold font-mono tabular-nums text-teal-700">
                {summary.totalUnitsSold.toLocaleString()} units
              </span>
            </div>
          </div>
        );
      case 'stocks_remaining':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Remaining Units</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {summary.totalStocksRemaining.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">On-Hand Ratio</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatPercent(summary.stockUtilizationPct)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Cost Valuation</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.inventoryAssetValue, currency)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Alerts</span>
              <span className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-1 block">
                {summary.lowStockCount} low · {summary.outOfStockCount} out
              </span>
            </div>
          </div>
        );
      case 'total_sales':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Total Sales</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.totalSales, currency)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Sales Orders</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {summary.salesCount}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Total COGS</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.totalCogs, currency)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Gross Profit</span>
              <span className="text-lg font-bold font-mono tabular-nums text-teal-700">
                {formatCurrency(summary.grossProfit, currency)}
              </span>
            </div>
          </div>
        );
      case 'profit_margins':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Gross Margin</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatPercent(summary.grossMarginPct)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Net Margin</span>
              <span
                className={`text-lg font-bold font-mono tabular-nums ${
                  summary.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'
                }`}
              >
                {formatPercent(summary.netMarginPct)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Operating + Petty Cash</span>
              <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.totalExpenses, currency)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <span className="text-xs text-slate-500 block">Net Income</span>
              <span
                className={`text-lg font-bold font-mono tabular-nums ${
                  summary.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'
                }`}
              >
                {formatCurrency(summary.netProfit, currency)}
              </span>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-details-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl max-h-[88vh] shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2
              id="panel-details-title"
              className="text-lg font-semibold text-slate-900"
            >
              {meta.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close details modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Switcher & Category Filter Bar */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(Object.keys(PANEL_META) as OverviewDetailPanel[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onSelectPanel(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  panel === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {PANEL_META[key].tabLabel}
              </button>
            ))}
          </div>

          {categoryGroups.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="detail-category-filter"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Product Category:
              </label>
              <select
                id="detail-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="all">
                  All Categories ({categoryGroups.length})
                </option>
                {categoryGroups.map((g) => (
                  <option key={g.category} value={g.category}>
                    {g.category}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {renderPanelHeadlineStat()}

          {visibleGroups.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl py-12 px-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                No product categories or records uploaded yet
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Once the admin adds inventory SKUs or records sales, every product category and its records will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Category Summary Rollup Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Category Summary
                  </h3>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    {visibleGroups.length}{' '}
                    {visibleGroups.length === 1 ? 'category' : 'categories'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  {panel === 'stock_levels' && (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Product Category</th>
                          <th className="py-2.5 px-4 text-right">SKUs</th>
                          <th className="py-2.5 px-4 text-right">Total Stocked</th>
                          <th className="py-2.5 px-4 text-right">Units Sold</th>
                          <th className="py-2.5 px-4 text-right">Remaining</th>
                          <th className="py-2.5 px-4 text-right">Stock Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {visibleGroups.map((g) => {
                          const sharePct =
                            summary.totalStockLevels > 0
                              ? (g.totalStockLevel / summary.totalStockLevels) * 100
                              : 0;
                          return (
                            <tr key={g.category} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-4 font-medium text-slate-900">
                                {g.category}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                {g.items.length}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {g.totalStockLevel.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                {g.unitsSoldInventory.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                {g.stockRemaining.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-teal-700 font-medium">
                                {formatPercent(sharePct)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {panel === 'stocks_remaining' && (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Product Category</th>
                          <th className="py-2.5 px-4 text-right">Remaining</th>
                          <th className="py-2.5 px-4 text-right">On Hand %</th>
                          <th className="py-2.5 px-4 text-right">Cost Valuation</th>
                          <th className="py-2.5 px-4 text-right">Retail Value</th>
                          <th className="py-2.5 px-4 text-right">Stock Alerts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {visibleGroups.map((g) => {
                          const onHandPct =
                            g.totalStockLevel > 0
                              ? (g.stockRemaining / g.totalStockLevel) * 100
                              : 0;
                          return (
                            <tr key={g.category} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-4 font-medium text-slate-900">
                                {g.category}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                {g.stockRemaining.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                {formatPercent(onHandPct)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                {formatCurrency(g.costValuation, currency)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-teal-700 font-medium">
                                {formatCurrency(g.retailValuation, currency)}
                              </td>
                              <td className="py-2.5 px-4 text-right text-xs font-mono tabular-nums text-slate-600">
                                {g.lowStockCount} low · {g.outOfStockCount} out
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {panel === 'total_sales' && (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Product Category</th>
                          <th className="py-2.5 px-4 text-right">Orders</th>
                          <th className="py-2.5 px-4 text-right">Units Sold</th>
                          <th className="py-2.5 px-4 text-right">Total Sales</th>
                          <th className="py-2.5 px-4 text-right">COGS</th>
                          <th className="py-2.5 px-4 text-right">Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {visibleGroups.map((g) => (
                          <tr key={g.category} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {g.category}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                              {g.salesCount}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                              {g.unitsSoldTransactions.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {formatCurrency(g.salesRevenue, currency)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                              {formatCurrency(g.salesCogs, currency)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-teal-700">
                              {formatCurrency(g.realizedGrossProfit, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {panel === 'profit_margins' && (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Product Category</th>
                          <th className="py-2.5 px-4 text-right">Catalog Margin</th>
                          <th className="py-2.5 px-4 text-right">Realized Sales</th>
                          <th className="py-2.5 px-4 text-right">Realized COGS</th>
                          <th className="py-2.5 px-4 text-right">Gross Profit</th>
                          <th className="py-2.5 px-4 text-right">Realized Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {visibleGroups.map((g) => (
                          <tr key={g.category} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-4 font-medium text-slate-900">
                              {g.category}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                              {g.items.length > 0
                                ? formatPercent(g.catalogUnitMarginPct)
                                : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                              {formatCurrency(g.salesRevenue, currency)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                              {formatCurrency(g.salesCogs, currency)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-teal-700">
                              {formatCurrency(g.realizedGrossProfit, currency)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-teal-700">
                              {g.salesRevenue > 0
                                ? formatPercent(g.realizedGrossMarginPct)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Per-Category Detailed Records */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Records by Product Category
                </h3>

                {visibleGroups.map((g) => {
                  const isCollapsed = Boolean(collapsedCategories[g.category]);
                  return (
                    <div
                      key={g.category}
                      className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(g.category)}
                        className="w-full px-5 py-3.5 bg-slate-50/80 hover:bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-slate-900">
                            {g.category}
                          </span>
                          <span className="text-xs text-slate-500 font-mono tabular-nums">
                            {g.items.length} {g.items.length === 1 ? 'SKU' : 'SKUs'} ·{' '}
                            {g.salesCount} {g.salesCount === 1 ? 'sale' : 'sales'}
                          </span>
                        </div>

                        <div className="text-xs font-mono tabular-nums text-slate-700">
                          {panel === 'stock_levels' &&
                            `${g.totalStockLevel.toLocaleString()} stocked · ${g.unitsSoldInventory.toLocaleString()} sold`}
                          {panel === 'stocks_remaining' &&
                            `${g.stockRemaining.toLocaleString()} remaining · ${formatCurrency(g.costValuation, currency)}`}
                          {panel === 'total_sales' &&
                            `${formatCurrency(g.salesRevenue, currency)} sales`}
                          {panel === 'profit_margins' &&
                            `Gross Profit: ${formatCurrency(g.realizedGrossProfit, currency)} (${formatPercent(
                              g.salesRevenue > 0
                                ? g.realizedGrossMarginPct
                                : g.catalogUnitMarginPct
                            )})`}
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="overflow-x-auto">
                          {(panel === 'stock_levels' ||
                            panel === 'stocks_remaining') && (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                                  <th className="py-2 px-5">SKU</th>
                                  <th className="py-2 px-4">Product Name</th>
                                  <th className="py-2 px-4 text-right">
                                    {panel === 'stock_levels'
                                      ? 'Total Stocked'
                                      : 'Remaining'}
                                  </th>
                                  <th className="py-2 px-4 text-right">
                                    {panel === 'stock_levels'
                                      ? 'Units Sold'
                                      : 'Reorder Level'}
                                  </th>
                                  <th className="py-2 px-4 text-right">
                                    {panel === 'stock_levels'
                                      ? 'Remaining'
                                      : 'Cost Valuation'}
                                  </th>
                                  <th className="py-2 px-5 text-right">
                                    {panel === 'stock_levels'
                                      ? 'Unit Cost / Sell'
                                      : 'Status'}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                                {g.items.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={6}
                                      className="py-5 px-5 text-center text-xs text-slate-500"
                                    >
                                      No inventory SKUs currently uploaded in this category.
                                    </td>
                                  </tr>
                                ) : (
                                  g.items.map((item) => {
                                    const sold = Math.max(
                                      0,
                                      item.totalStockLevel - item.stockRemaining
                                    );
                                    const isOut = item.stockRemaining <= 0;
                                    const isLow =
                                      !isOut &&
                                      item.stockRemaining <= item.reorderLevel;

                                    return (
                                      <tr key={item.id} className="hover:bg-slate-50/70">
                                        <td className="py-2.5 px-5 font-mono text-xs text-slate-600 whitespace-nowrap">
                                          {item.sku}
                                        </td>
                                        <td className="py-2.5 px-4 font-medium text-slate-900">
                                          {item.name}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                          {(panel === 'stock_levels'
                                            ? item.totalStockLevel
                                            : item.stockRemaining
                                          ).toLocaleString()}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                          {(panel === 'stock_levels'
                                            ? sold
                                            : item.reorderLevel
                                          ).toLocaleString()}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                          {panel === 'stock_levels'
                                            ? item.stockRemaining.toLocaleString()
                                            : formatCurrency(
                                                item.stockRemaining * item.unitCost,
                                                currency
                                              )}
                                        </td>
                                        <td className="py-2.5 px-5 text-right whitespace-nowrap">
                                          {panel === 'stock_levels' ? (
                                            <span className="font-mono tabular-nums text-xs text-slate-600">
                                              {formatCurrency(item.unitCost, currency)} /{' '}
                                              {formatCurrency(item.sellingPrice, currency)}
                                            </span>
                                          ) : isOut ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                                              <XCircle className="w-3.5 h-3.5" />
                                              Out of Stock
                                            </span>
                                          ) : isLow ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                              <AlertTriangle className="w-3.5 h-3.5" />
                                              Low Stock
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                              In Stock
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          )}

                          {panel === 'total_sales' && (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                                  <th className="py-2 px-5">Date</th>
                                  <th className="py-2 px-4">Reference</th>
                                  <th className="py-2 px-4">Description</th>
                                  <th className="py-2 px-4 text-right">Qty</th>
                                  <th className="py-2 px-4 text-right">COGS</th>
                                  <th className="py-2 px-5 text-right">Sale Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                                {g.salesTransactions.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={6}
                                      className="py-5 px-5 text-center text-xs text-slate-500"
                                    >
                                      No sales transactions recorded yet for {g.category}.
                                    </td>
                                  </tr>
                                ) : (
                                  g.salesTransactions.map((tx) => (
                                    <tr key={tx.id} className="hover:bg-slate-50/70">
                                      <td className="py-2.5 px-5 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                                        {tx.date}
                                      </td>
                                      <td className="py-2.5 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                                        {tx.reference}
                                      </td>
                                      <td className="py-2.5 px-4 font-medium text-slate-900">
                                        {tx.description}
                                      </td>
                                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                        {tx.quantity ? tx.quantity.toLocaleString() : '—'}
                                      </td>
                                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                        {tx.cogs !== undefined
                                          ? formatCurrency(tx.cogs, currency)
                                          : '—'}
                                      </td>
                                      <td className="py-2.5 px-5 text-right font-mono tabular-nums font-semibold text-teal-700 whitespace-nowrap">
                                        {formatCurrency(tx.amount, currency)}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          )}

                          {panel === 'profit_margins' && (
                            <div className="divide-y divide-slate-200">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-white text-xs font-medium text-slate-500">
                                    <th className="py-2 px-5">SKU</th>
                                    <th className="py-2 px-4">Product Name</th>
                                    <th className="py-2 px-4 text-right">Unit Cost</th>
                                    <th className="py-2 px-4 text-right">Sell Price</th>
                                    <th className="py-2 px-4 text-right">Unit Profit</th>
                                    <th className="py-2 px-5 text-right">Unit Margin</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                                  {g.items.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={6}
                                        className="py-4 px-5 text-center text-xs text-slate-500"
                                      >
                                        No catalog SKUs uploaded in this category.
                                      </td>
                                    </tr>
                                  ) : (
                                    g.items.map((item) => {
                                      const unitProfit =
                                        item.sellingPrice - item.unitCost;
                                      const unitMarginPct =
                                        item.sellingPrice > 0
                                          ? (unitProfit / item.sellingPrice) * 100
                                          : 0;
                                      return (
                                        <tr
                                          key={item.id}
                                          className="hover:bg-slate-50/70"
                                        >
                                          <td className="py-2.5 px-5 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {item.sku}
                                          </td>
                                          <td className="py-2.5 px-4 font-medium text-slate-900">
                                            {item.name}
                                          </td>
                                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                                            {formatCurrency(item.unitCost, currency)}
                                          </td>
                                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                            {formatCurrency(item.sellingPrice, currency)}
                                          </td>
                                          <td
                                            className={`py-2.5 px-4 text-right font-mono tabular-nums font-medium ${
                                              unitProfit >= 0
                                                ? 'text-teal-700'
                                                : 'text-red-600'
                                            }`}
                                          >
                                            {formatCurrency(unitProfit, currency)}
                                          </td>
                                          <td
                                            className={`py-2.5 px-5 text-right font-mono tabular-nums font-semibold ${
                                              unitMarginPct >= 0
                                                ? 'text-teal-700'
                                                : 'text-red-600'
                                            }`}
                                          >
                                            {formatPercent(unitMarginPct)}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>

                              {g.salesTransactions.length > 0 && (
                                <table className="w-full text-left border-collapse bg-slate-50/40">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                                      <th className="py-2 px-5">Sale Date</th>
                                      <th className="py-2 px-4">Ref</th>
                                      <th className="py-2 px-4">Order</th>
                                      <th className="py-2 px-4 text-right">Revenue</th>
                                      <th className="py-2 px-4 text-right">Gross Profit</th>
                                      <th className="py-2 px-5 text-right">Order Margin</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                                    {g.salesTransactions.map((tx) => {
                                      const txCogs = Number(tx.cogs) || 0;
                                      const txProfit = tx.amount - txCogs;
                                      const txMargin =
                                        tx.amount > 0
                                          ? (txProfit / tx.amount) * 100
                                          : 0;
                                      return (
                                        <tr
                                          key={tx.id}
                                          className="hover:bg-slate-50/80"
                                        >
                                          <td className="py-2 px-5 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                                            {tx.date}
                                          </td>
                                          <td className="py-2 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {tx.reference}
                                          </td>
                                          <td className="py-2 px-4 text-slate-800">
                                            {tx.description}
                                          </td>
                                          <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-900">
                                            {formatCurrency(tx.amount, currency)}
                                          </td>
                                          <td
                                            className={`py-2 px-4 text-right font-mono tabular-nums font-medium ${
                                              txProfit >= 0
                                                ? 'text-teal-700'
                                                : 'text-red-600'
                                            }`}
                                          >
                                            {formatCurrency(txProfit, currency)}
                                          </td>
                                          <td
                                            className={`py-2 px-5 text-right font-mono tabular-nums font-semibold ${
                                              txMargin >= 0
                                                ? 'text-teal-700'
                                                : 'text-red-600'
                                            }`}
                                          >
                                            {formatPercent(txMargin)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
