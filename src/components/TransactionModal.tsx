import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  BudgetRule,
  InventoryItem,
  PaymentMethod,
  TransactionType,
} from '../types/accounting';
import { formatCurrency } from '../utils/calculations';

interface TransactionModalProps {
  isOpen: boolean;
  initialType?: TransactionType;
  initialSkuId?: string;
  inventory: InventoryItem[];
  budgetRules: BudgetRule[];
  pettyCashBalance: number;
  currency: string;
  onClose: () => void;
  onSubmit: (payload: {
    type: TransactionType;
    date: string;
    description: string;
    category: string;
    amount: number;
    paymentMethod: PaymentMethod;
    reference: string;
    skuId?: string;
    quantity?: number;
    unitPrice?: number;
    budgetBucketId?: string;
    notes?: string;
  }) => Promise<void>;
}

const CATEGORY_OPTIONS: Record<TransactionType, string[]> = {
  sale: ['Product Sales', 'Wholesale Order', 'Custom Service', 'Other Revenue'],
  purchase: ['Inventory Restock', 'Raw Materials', 'Packaging Stock', 'Other Purchase'],
  petty_cash_expense: [
    'Courier & Postage',
    'Packaging & Labels',
    'Office Supplies',
    'Facility Maintenance',
    'Hospitality',
    'Local Transport',
    'Miscellaneous',
  ],
  operating_expense: [
    'Advertising',
    'Branding & Packaging',
    'Rent & Facilities',
    'Software & Tools',
    'Utilities',
    'Payroll & Contractors',
    'Equipment',
  ],
  petty_cash_replenish: ['Petty Cash Transfer'],
};

const TYPE_LABELS: { id: TransactionType; label: string }[] = [
  { id: 'sale', label: 'Sale' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'petty_cash_expense', label: 'Petty Cash Expense' },
  { id: 'operating_expense', label: 'Operating Expense' },
  { id: 'petty_cash_replenish', label: 'Replenish Petty Cash' },
];

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  initialType = 'sale',
  initialSkuId = '',
  inventory,
  budgetRules,
  pettyCashBalance,
  currency,
  onClose,
  onSubmit,
}) => {
  const [type, setType] = useState<TransactionType>(initialType);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [skuId, setSkuId] = useState(initialSkuId);
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[initialType][0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [reference, setReference] = useState('');
  const [budgetBucketId, setBudgetBucketId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      setSkuId(initialSkuId);
      setDate(new Date().toISOString().slice(0, 10));
      setQuantity('1');
      setReference('');
      setNotes('');
      setError(null);
      setCategory(CATEGORY_OPTIONS[initialType][0]);
      setPaymentMethod(
        initialType === 'petty_cash_expense' ? 'Petty Cash' : 'Bank Transfer'
      );
      setBudgetBucketId('');

      if (initialSkuId) {
        const sku = inventory.find((i) => i.id === initialSkuId);
        if (sku) {
          const price =
            initialType === 'purchase' ? sku.unitCost : sku.sellingPrice;
          setUnitPrice(price.toFixed(2));
          setAmount(price.toFixed(2));
          setDescription(
            initialType === 'purchase'
              ? `Stock Purchase — ${sku.name}`
              : `Order — ${sku.name}`
          );
        }
      } else {
        setUnitPrice('');
        setAmount('');
        setDescription('');
      }
    }
  }, [isOpen, initialType, initialSkuId, inventory]);

  if (!isOpen) return null;

  const selectedSku = inventory.find((i) => i.id === skuId);
  const parsedQty = Math.max(1, Math.floor(Number(quantity) || 1));
  const parsedUnit = Number(unitPrice) || 0;
  const computedTotal =
    (type === 'sale' || type === 'purchase') && selectedSku
      ? parsedQty * parsedUnit
      : Number(amount) || 0;

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setError(null);
    setCategory(CATEGORY_OPTIONS[nextType][0]);
    setPaymentMethod(
      nextType === 'petty_cash_expense' ? 'Petty Cash' : 'Bank Transfer'
    );
    if (nextType !== 'sale' && nextType !== 'purchase') {
      setSkuId('');
    }
    if (nextType === 'petty_cash_replenish') {
      setDescription('Petty Cash Imprest Replenishment');
    } else {
      setDescription('');
    }
  };

  const handleSkuChange = (nextSkuId: string) => {
    setSkuId(nextSkuId);
    const sku = inventory.find((i) => i.id === nextSkuId);
    if (sku) {
      const price = type === 'purchase' ? sku.unitCost : sku.sellingPrice;
      setUnitPrice(price.toFixed(2));
      setAmount((price * parsedQty).toFixed(2));
      setDescription(
        type === 'purchase'
          ? `Restock Purchase — ${sku.name} (${parsedQty} units)`
          : `Sale — ${sku.name} (${parsedQty} units)`
      );
    }
  };

  const handleQtyOrUnitChange = (nextQtyStr: string, nextUnitStr: string) => {
    setQuantity(nextQtyStr);
    setUnitPrice(nextUnitStr);
    if (selectedSku) {
      const q = Math.max(1, Math.floor(Number(nextQtyStr) || 1));
      const u = Number(nextUnitStr) || 0;
      setAmount((q * u).toFixed(2));
      setDescription(
        type === 'purchase'
          ? `Restock Purchase — ${selectedSku.name} (${q} units)`
          : `Sale — ${selectedSku.name} (${q} units)`
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError('Please provide a clear transaction description.');
      return;
    }

    if (computedTotal <= 0) {
      setError('Transaction amount must be greater than zero.');
      return;
    }

    if (type === 'sale' && selectedSku && parsedQty > selectedSku.stockRemaining) {
      setError(
        `Insufficient stock: only ${selectedSku.stockRemaining} units of ${selectedSku.name} remaining.`
      );
      return;
    }

    if (type === 'petty_cash_expense' && computedTotal > pettyCashBalance) {
      setError(
        `Insufficient petty cash balance (${formatCurrency(pettyCashBalance, currency)} available). Replenish petty cash first.`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        type,
        date,
        description: description.trim(),
        category,
        amount: computedTotal,
        paymentMethod,
        reference: reference.trim(),
        skuId: selectedSku ? selectedSku.id : undefined,
        quantity: selectedSku ? parsedQty : undefined,
        unitPrice: selectedSku ? parsedUnit : undefined,
        budgetBucketId:
          type === 'operating_expense' || type === 'petty_cash_expense'
            ? budgetBucketId || undefined
            : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="tx-modal-title" className="text-lg font-semibold text-slate-900">
              Record Accounting Entry
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Entries update the general ledger, petty cash fund, and inventory balances.
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Entry Type
            </label>
            <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-lg">
              {TYPE_LABELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTypeChange(item.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    type === item.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {type === 'petty_cash_expense' && (
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="text-slate-600">Available Petty Cash Fund</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCurrency(pettyCashBalance, currency)}
              </span>
            </div>
          )}

          {(type === 'sale' || type === 'purchase') && (
            <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <label htmlFor="tx-sku" className="text-xs font-medium text-slate-700">
                  Link Inventory SKU (Optional)
                </label>
                {selectedSku && (
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    On hand: {selectedSku.stockRemaining} units
                  </span>
                )}
              </div>
              <select
                id="tx-sku"
                value={skuId}
                onChange={(e) => handleSkuChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">Manual / Non-Inventory Entry</option>
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name} ({item.stockRemaining} left)
                  </option>
                ))}
              </select>

              {selectedSku && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label htmlFor="tx-qty" className="block text-xs font-medium text-slate-600 mb-1">
                      Quantity (Units)
                    </label>
                    <input
                      id="tx-qty"
                      type="number"
                      min={1}
                      max={type === 'sale' ? selectedSku.stockRemaining : undefined}
                      value={quantity}
                      onChange={(e) => handleQtyOrUnitChange(e.target.value, unitPrice)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="tx-unit-price" className="block text-xs font-medium text-slate-600 mb-1">
                      {type === 'purchase' ? 'Unit Cost' : 'Unit Selling Price'}
                    </label>
                    <input
                      id="tx-unit-price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={unitPrice}
                      onChange={(e) => handleQtyOrUnitChange(quantity, e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  {type === 'sale' && (
                    <div className="col-span-2 flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-200">
                      <span>
                        Est. COGS:{' '}
                        <strong className="font-mono tabular-nums text-slate-800">
                          {formatCurrency(parsedQty * selectedSku.unitCost, currency)}
                        </strong>
                      </span>
                      <span>
                        Est. Gross Profit:{' '}
                        <strong className="font-mono tabular-nums text-teal-700">
                          {formatCurrency(
                            computedTotal - parsedQty * selectedSku.unitCost,
                            currency
                          )}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="tx-desc" className="block text-xs font-medium text-slate-600 mb-1">
                Description
              </label>
              <input
                id="tx-desc"
                type="text"
                required
                placeholder="e.g., Retail storefront order or courier dispatch"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-600 mb-1">
                Total Amount ({currency})
              </label>
              <input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                readOnly={Boolean(selectedSku)}
                value={selectedSku ? computedTotal.toFixed(2) : amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 ${
                  selectedSku ? 'bg-slate-50 text-slate-700' : 'bg-white'
                }`}
              />
            </div>

            <div>
              <label htmlFor="tx-date" className="block text-xs font-medium text-slate-600 mb-1">
                Transaction Date
              </label>
              <input
                id="tx-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="tx-cat" className="block text-xs font-medium text-slate-600 mb-1">
                Category
              </label>
              <select
                id="tx-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {CATEGORY_OPTIONS[type].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tx-method" className="block text-xs font-medium text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                id="tx-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
                <option value="Petty Cash">Petty Cash</option>
              </select>
            </div>

            {(type === 'operating_expense' || type === 'petty_cash_expense') && (
              <div>
                <label htmlFor="tx-bucket" className="block text-xs font-medium text-slate-600 mb-1">
                  Track Against Net Income Budget
                </label>
                <select
                  id="tx-bucket"
                  value={budgetBucketId}
                  onChange={(e) => setBudgetBucketId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">General Overhead (Unassigned)</option>
                  {budgetRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.name} ({rule.percentage}%)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="tx-ref" className="block text-xs font-medium text-slate-600 mb-1">
                Reference / Voucher #
              </label>
              <input
                id="tx-ref"
                type="text"
                placeholder="Auto-generated if blank"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
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
              {submitting ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
