import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { InventoryItem } from '../types/accounting';

interface InventoryModalProps {
  isOpen: boolean;
  editingItem?: InventoryItem | null;
  currency: string;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    sku: string;
    name: string;
    category: string;
    totalStockLevel: number;
    stockRemaining?: number;
    unitCost: number;
    sellingPrice: number;
    reorderLevel: number;
  }) => Promise<void>;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  editingItem,
  currency,
  onClose,
  onSave,
}) => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Brewing Hardware');
  const [totalStockLevel, setTotalStockLevel] = useState('50');
  const [stockRemaining, setStockRemaining] = useState('50');
  const [unitCost, setUnitCost] = useState('15.00');
  const [sellingPrice, setSellingPrice] = useState('39.00');
  const [reorderLevel, setReorderLevel] = useState('15');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (editingItem) {
        setSku(editingItem.sku);
        setName(editingItem.name);
        setCategory(editingItem.category);
        setTotalStockLevel(String(editingItem.totalStockLevel));
        setStockRemaining(String(editingItem.stockRemaining));
        setUnitCost(editingItem.unitCost.toFixed(2));
        setSellingPrice(editingItem.sellingPrice.toFixed(2));
        setReorderLevel(String(editingItem.reorderLevel));
      } else {
        setSku(`SKU-${Math.floor(200 + Math.random() * 799)}`);
        setName('');
        setCategory('General Merchandise');
        setTotalStockLevel('50');
        setStockRemaining('50');
        setUnitCost('15.00');
        setSellingPrice('39.00');
        setReorderLevel('15');
      }
    }
  }, [isOpen, editingItem]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sku.trim() || !name.trim()) {
      setError('SKU code and product name are required.');
      return;
    }

    const total = Math.max(0, Math.floor(Number(totalStockLevel) || 0));
    const remaining = editingItem
      ? Math.max(0, Math.floor(Number(stockRemaining) || 0))
      : total;
    const cost = Math.max(0, Number(unitCost) || 0);
    const price = Math.max(0, Number(sellingPrice) || 0);
    const reorder = Math.max(0, Math.floor(Number(reorderLevel) || 0));

    if (editingItem && remaining > total) {
      setError('Stocks remaining cannot exceed total stock level.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        id: editingItem?.id,
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        category: category.trim() || 'General Merchandise',
        totalStockLevel: total,
        stockRemaining: editingItem ? remaining : undefined,
        unitCost: cost,
        sellingPrice: price,
        reorderLevel: reorder,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save inventory item.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inv-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="inv-modal-title" className="text-lg font-semibold text-slate-900">
              {editingItem ? 'Edit Inventory SKU' : 'Add Inventory SKU'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {editingItem
                ? 'Update unit pricing, reorder thresholds, or audited stock count.'
                : 'Adding opening stock with a unit cost records a purchase entry automatically.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="inv-sku" className="block text-xs font-medium text-slate-600 mb-1">
                SKU Code
              </label>
              <input
                id="inv-sku"
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="inv-cat" className="block text-xs font-medium text-slate-600 mb-1">
                Category
              </label>
              <input
                id="inv-cat"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="inv-name" className="block text-xs font-medium text-slate-600 mb-1">
                Product Name
              </label>
              <input
                id="inv-name"
                type="text"
                required
                placeholder="e.g., Insulated Stainless Tumbler"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="inv-cost" className="block text-xs font-medium text-slate-600 mb-1">
                Unit Cost ({currency})
              </label>
              <input
                id="inv-cost"
                type="number"
                step="0.01"
                min="0"
                required
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="inv-price" className="block text-xs font-medium text-slate-600 mb-1">
                Selling Price ({currency})
              </label>
              <input
                id="inv-price"
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="inv-total" className="block text-xs font-medium text-slate-600 mb-1">
                {editingItem ? 'Total Stock Level' : 'Opening Stock Quantity'}
              </label>
              <input
                id="inv-total"
                type="number"
                min="0"
                required
                value={totalStockLevel}
                onChange={(e) => setTotalStockLevel(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {editingItem ? (
              <div>
                <label htmlFor="inv-rem" className="block text-xs font-medium text-slate-600 mb-1">
                  Stocks Remaining
                </label>
                <input
                  id="inv-rem"
                  type="number"
                  min="0"
                  required
                  value={stockRemaining}
                  onChange={(e) => setStockRemaining(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="inv-reorder" className="block text-xs font-medium text-slate-600 mb-1">
                  Low-Stock Reorder Level
                </label>
                <input
                  id="inv-reorder"
                  type="number"
                  min="0"
                  required
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            )}

            {editingItem && (
              <div className="sm:col-span-2">
                <label htmlFor="inv-reorder-edit" className="block text-xs font-medium text-slate-600 mb-1">
                  Low-Stock Reorder Level
                </label>
                <input
                  id="inv-reorder-edit"
                  type="number"
                  min="0"
                  required
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? 'Saving...' : editingItem ? 'Update SKU' : 'Add SKU'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
