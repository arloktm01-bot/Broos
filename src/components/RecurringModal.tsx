import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  BudgetRule,
  PaymentMethod,
  RecurrenceFrequency,
  RecurringApprovalMode,
  RecurringRule,
  TransactionType,
} from '../types/accounting';

interface RecurringModalProps {
  isOpen: boolean;
  editingRule?: RecurringRule | null;
  budgetRules: BudgetRule[];
  currency: string;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    type: TransactionType;
    description: string;
    category: string;
    amount: number;
    paymentMethod: PaymentMethod;
    frequency: RecurrenceFrequency;
    startDate: string;
    nextRunDate?: string;
    endDate?: string;
    approvalMode: RecurringApprovalMode;
    budgetBucketId?: string;
  }) => Promise<void>;
}

const ENTRY_TYPES: { id: TransactionType; label: string }[] = [
  { id: 'sale', label: 'Recurring Income (Sale)' },
  { id: 'operating_expense', label: 'Operating Expense' },
  { id: 'petty_cash_expense', label: 'Petty Cash Expense' },
  { id: 'purchase', label: 'Inventory Purchase' },
  { id: 'petty_cash_replenish', label: 'Petty Cash Replenish' },
];

const FREQUENCY_OPTIONS: { id: RecurrenceFrequency; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

const CATEGORY_SUGGESTIONS: Record<TransactionType, string[]> = {
  sale: ['Wholesale Order', 'Subscription Revenue', 'Product Sales', 'Retainer Income'],
  operating_expense: [
    'Rent & Facilities',
    'Advertising',
    'Branding & Packaging',
    'Software & Tools',
    'Utilities',
    'Payroll & Contractors',
  ],
  petty_cash_expense: [
    'Courier & Postage',
    'Office Supplies',
    'Packaging & Labels',
    'Facility Maintenance',
    'Hospitality',
  ],
  purchase: ['Inventory Restock', 'Packaging Stock', 'Raw Materials'],
  petty_cash_replenish: ['Petty Cash Transfer'],
};

export const RecurringModal: React.FC<RecurringModalProps> = ({
  isOpen,
  editingRule,
  budgetRules,
  currency,
  onClose,
  onSave,
}) => {
  const [type, setType] = useState<TransactionType>('operating_expense');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Rent & Facilities');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState('');
  const [approvalMode, setApprovalMode] =
    useState<RecurringApprovalMode>('manual_review');
  const [budgetBucketId, setBudgetBucketId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (editingRule) {
        setType(editingRule.type);
        setDescription(editingRule.description);
        setCategory(editingRule.category);
        setAmount(editingRule.amount.toFixed(2));
        setPaymentMethod(editingRule.paymentMethod);
        setFrequency(editingRule.frequency);
        setStartDate(editingRule.nextRunDate);
        setEndDate(editingRule.endDate || '');
        setApprovalMode(editingRule.approvalMode);
        setBudgetBucketId(editingRule.budgetBucketId || '');
      } else {
        setType('operating_expense');
        setDescription('');
        setCategory('Rent & Facilities');
        setAmount('');
        setPaymentMethod('Bank Transfer');
        setFrequency('monthly');
        setStartDate(new Date().toISOString().slice(0, 10));
        setEndDate('');
        setApprovalMode('manual_review');
        setBudgetBucketId('');
      }
    }
  }, [isOpen, editingRule]);

  if (!isOpen) return null;

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCategory(CATEGORY_SUGGESTIONS[nextType][0]);
    setPaymentMethod(
      nextType === 'petty_cash_expense' ? 'Petty Cash' : 'Bank Transfer'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!description.trim()) {
      setError('Please enter a schedule description.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('End date cannot be earlier than the start / next run date.');
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        id: editingRule?.id,
        type,
        description: description.trim(),
        category,
        amount: parsedAmount,
        paymentMethod,
        frequency,
        startDate,
        nextRunDate: editingRule ? startDate : undefined,
        endDate: endDate || undefined,
        approvalMode,
        budgetBucketId:
          type === 'operating_expense' || type === 'petty_cash_expense'
            ? budgetBucketId || undefined
            : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rec-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="rec-modal-title" className="text-lg font-semibold text-slate-900">
              {editingRule
                ? 'Edit Recurring Schedule'
                : 'New Recurring Transaction Schedule'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Automate repeating income or expenses on a daily, weekly, monthly, or yearly cadence.
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
              Transaction Type
            </label>
            <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-lg">
              {ENTRY_TYPES.map((item) => (
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="rec-desc" className="block text-xs font-medium text-slate-600 mb-1">
                Schedule Description
              </label>
              <input
                id="rec-desc"
                type="text"
                required
                placeholder="e.g., Monthly Cloud Accounting Subscription or Wholesale Retainer"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="rec-amount" className="block text-xs font-medium text-slate-600 mb-1">
                Amount ({currency})
              </label>
              <input
                id="rec-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="rec-cat" className="block text-xs font-medium text-slate-600 mb-1">
                Category
              </label>
              <select
                id="rec-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {CATEGORY_SUGGESTIONS[type].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Recurrence Cadence
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFrequency(opt.id)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      frequency === opt.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="rec-method" className="block text-xs font-medium text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                id="rec-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Cash">Cash</option>
                <option value="Petty Cash">Petty Cash</option>
              </select>
            </div>

            <div>
              <label htmlFor="rec-start" className="block text-xs font-medium text-slate-600 mb-1">
                {editingRule ? 'Next Scheduled Date' : 'Start Date'}
              </label>
              <input
                id="rec-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="rec-end" className="block text-xs font-medium text-slate-600 mb-1">
                End Date (Optional)
              </label>
              <input
                id="rec-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {(type === 'operating_expense' || type === 'petty_cash_expense') && (
              <div className="sm:col-span-2">
                <label htmlFor="rec-bucket" className="block text-xs font-medium text-slate-600 mb-1">
                  Link to Net Income Budget Allocation (Optional)
                </label>
                <select
                  id="rec-bucket"
                  value={budgetBucketId}
                  onChange={(e) => setBudgetBucketId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
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
          </div>

          {/* Posting & Approval Mode */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <span className="block text-xs font-semibold text-slate-700">
              Posting & Review Workflow
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setApprovalMode('manual_review')}
                className={`p-3 text-left rounded-lg border transition-colors ${
                  approvalMode === 'manual_review'
                    ? 'bg-white border-teal-700 ring-1 ring-teal-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="block text-xs font-semibold text-slate-900">
                  Require Manual Approval
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Queues scheduled items for review and amount confirmation before posting.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setApprovalMode('auto_post')}
                className={`p-3 text-left rounded-lg border transition-colors ${
                  approvalMode === 'auto_post'
                    ? 'bg-white border-teal-700 ring-1 ring-teal-700'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="block text-xs font-semibold text-slate-900">
                  Auto-Post on Schedule
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Posts directly into the general ledger as soon as the scheduled date arrives.
                </span>
              </button>
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
              {submitting
                ? 'Saving...'
                : editingRule
                  ? 'Update Schedule'
                  : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
