import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Plus,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  AccountingState,
  AccountingSummary,
  InventoryItem,
  TransactionType,
} from '../types/accounting';
import { formatCurrency, formatPercent } from '../utils/calculations';

interface InventoryPageProps {
  state: AccountingState;
  summary: AccountingSummary;
  isAdmin: boolean;
  onOpenInventoryModal: (item?: InventoryItem | null) => void;
  onOpenTransactionModal: (type: TransactionType, skuId?: string) => void;
  onDeleteInventory: (id: string) => Promise<void>;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({
  state,
  summary,
  isAdmin,
  onOpenInventoryModal,
  onOpenTransactionModal,
  onDeleteInventory,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low' | 'out'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteInventory(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.inventory.filter((item) => {
      const isOut = item.stockRemaining <= 0;
      const isLow = !isOut && item.stockRemaining <= item.reorderLevel;

      if (statusFilter === 'in_stock' && (isOut || isLow)) return false;
      if (statusFilter === 'low' && !isLow) return false;
      if (statusFilter === 'out' && !isOut) return false;

      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [state.inventory, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Inventory Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Total Stock Levels
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {summary.totalStockLevels.toLocaleString()}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Cumulative units stocked across {state.inventory.length} SKUs
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Stocks Remaining
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {summary.totalStocksRemaining.toLocaleString()}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {formatPercent(summary.stockUtilizationPct)} on hand · {summary.totalUnitsSold.toLocaleString()} units sold
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Inventory Cost Valuation
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.inventoryAssetValue, state.currency)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Asset value at current unit cost basis
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Projected Retail Value
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-teal-700">
            {formatCurrency(summary.inventoryRetailValue, state.currency)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Potential gross revenue from remaining stock
          </p>
        </div>
      </div>

      {/* Inventory Table Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by SKU, product name, or category..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { id: 'all', label: 'All SKUs' },
                { id: 'in_stock', label: 'In Stock' },
                { id: 'low', label: `Low (${summary.lowStockCount})` },
                { id: 'out', label: `Out (${summary.outOfStockCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setStatusFilter(tab.id as 'all' | 'in_stock' | 'low' | 'out')
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onOpenInventoryModal(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Inventory SKU
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">SKU & Product</th>
                <th className="py-2.5 px-4 text-right">Unit Cost</th>
                <th className="py-2.5 px-4 text-right">Sell Price</th>
                <th className="py-2.5 px-4 text-right">Margin</th>
                <th className="py-2.5 px-4 text-right">Total Stocked</th>
                <th className="py-2.5 px-4 text-right">Remaining</th>
                <th className="py-2.5 px-4">Status</th>
                {isAdmin && (
                  <th className="py-2.5 px-6 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-12 px-6 text-center text-slate-500">
                    {state.inventory.length === 0
                      ? 'No inventory records yet. Add an inventory SKU to start tracking stock.'
                      : 'No inventory items match your filter.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const unitMarginPct =
                    item.sellingPrice > 0
                      ? ((item.sellingPrice - item.unitCost) /
                          item.sellingPrice) *
                        100
                      : 0;
                  const isOut = item.stockRemaining <= 0;
                  const isLow =
                    !isOut && item.stockRemaining <= item.reorderLevel;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono">{item.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>Reorder at {item.reorderLevel}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatCurrency(item.unitCost, state.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatCurrency(item.sellingPrice, state.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-teal-700 font-medium">
                        {formatPercent(unitMarginPct)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {item.totalStockLevel.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {item.stockRemaining.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium text-teal-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            In Stock
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          {confirmDeleteId === item.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === item.id}
                                onClick={() => handleConfirmDelete(item.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                              >
                                {deletingId === item.id ? 'Deleting...' : 'Confirm'}
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
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isOut}
                                onClick={() => onOpenTransactionModal('sale', item.id)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-md transition-colors"
                              >
                                Sell
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenTransactionModal('purchase', item.id)
                                }
                                className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
                              >
                                Restock
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenInventoryModal(item)}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
                                aria-label={`Edit ${item.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
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
      </div>
    </div>
  );
};
