import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  AccountingState,
  PendingRecurringEntry,
  RecurrenceFrequency,
  RecurringRule,
  TransactionType,
} from '../types/accounting';
import { formatCurrency } from '../utils/calculations';
import { estimateMonthlyRecurringImpact } from '../utils/recurrence';

interface RecurringPageProps {
  state: AccountingState;
  isAdmin: boolean;
  onOpenRecurringModal: (rule?: RecurringRule | null) => void;
  onToggleRuleActive: (rule: RecurringRule) => Promise<void>;
  onTriggerRuleNow: (ruleId: string) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  onRunDueSchedules: (asOfDate?: string) => Promise<void>;
  onApprovePending: (
    pendingId: string,
    overrides?: { amount?: number; scheduledDate?: string; description?: string }
  ) => Promise<void>;
  onDismissPending: (pendingId: string) => Promise<void>;
  onApproveAllPending: () => Promise<void>;
}

const FREQ_LABEL: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const TYPE_LABEL: Record<TransactionType, string> = {
  sale: 'Income (Sale)',
  purchase: 'Inventory Purchase',
  petty_cash_expense: 'Petty Cash Expense',
  operating_expense: 'Operating Expense',
  petty_cash_replenish: 'Petty Cash Replenish',
};

export const RecurringPage: React.FC<RecurringPageProps> = ({
  state,
  isAdmin,
  onOpenRecurringModal,
  onToggleRuleActive,
  onTriggerRuleNow,
  onDeleteRule,
  onRunDueSchedules,
  onApprovePending,
  onDismissPending,
  onApproveAllPending,
}) => {
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkingDue, setCheckingDue] = useState(false);

  const rules = state.recurringRules || [];
  const pending = state.pendingRecurring || [];
  const activeCount = rules.filter((r) => r.active).length;
  const totalPosted = rules.reduce((sum, r) => sum + (r.totalPostedCount || 0), 0);
  const { monthlyIncome, monthlyExpense } = estimateMonthlyRecurringImpact(rules);

  const startEditPending = (entry: PendingRecurringEntry) => {
    setEditingPendingId(entry.id);
    setDraftAmount(entry.amount.toFixed(2));
    setDraftDate(entry.scheduledDate);
    setDraftDesc(entry.description);
    setActionError(null);
  };

  const handleApprove = async (entry: PendingRecurringEntry) => {
    setActionError(null);
    setBusyId(entry.id);
    try {
      if (editingPendingId === entry.id) {
        const amt = Number(draftAmount);
        if (!Number.isFinite(amt) || amt <= 0) {
          setActionError('Reviewed amount must be greater than zero.');
          return;
        }
        await onApprovePending(entry.id, {
          amount: amt,
          scheduledDate: draftDate,
          description: draftDesc,
        });
        setEditingPendingId(null);
      } else {
        await onApprovePending(entry.id);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to post pending entry.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await onDismissPending(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to dismiss.');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveAll = async () => {
    setActionError(null);
    setBusyId('approve-all');
    try {
      await onApproveAllPending();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Batch approval failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckDue = async () => {
    setActionError(null);
    setCheckingDue(true);
    try {
      await onRunDueSchedules();
    } finally {
      setCheckingDue(false);
    }
  };

  const handleTrigger = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await onTriggerRuleNow(id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to generate next occurrence.'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 4-Column Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Active Schedules
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {activeCount}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {rules.length} total configured · {rules.length - activeCount} paused
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Awaiting Manual Review
          </span>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              pending.length > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {pending.length}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {pending.length > 0
              ? 'Scheduled items ready for approval below'
              : 'All scheduled entries reviewed'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Est. Monthly Recurring Net
          </span>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              monthlyIncome - monthlyExpense >= 0
                ? 'text-teal-700'
                : 'text-slate-900'
            }`}
          >
            {formatCurrency(monthlyIncome - monthlyExpense, state.currency)}
          </div>
          <p className="text-xs text-slate-500 mt-2 font-mono tabular-nums">
            +{formatCurrency(monthlyIncome, state.currency)} / -
            {formatCurrency(monthlyExpense, state.currency)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Total Occurrences Posted
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {totalPosted}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Auto-posted and approved ledger entries
          </p>
        </div>
      </div>

      {actionError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
          {actionError}
        </div>
      )}

      {/* Pending Manual Review & Approval Queue */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pending Approval & Review Queue
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Generated automatically on scheduled dates for rules requiring confirmation before posting to the general ledger
            </p>
          </div>
          {isAdmin && pending.length > 0 && (
            <button
              type="button"
              disabled={busyId === 'approve-all'}
              onClick={handleApproveAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {busyId === 'approve-all'
                ? 'Posting All...'
                : `Approve & Post All (${pending.length})`}
            </button>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="py-10 px-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              No recurring transactions awaiting approval
            </p>
            <p className="text-xs text-slate-500 mt-1">
              When a schedule with manual review reaches its scheduled date, it will appear here for inspection before posting.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-6">Scheduled Date</th>
                  <th className="py-2.5 px-4">Description & Category</th>
                  <th className="py-2.5 px-4">Type & Cadence</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  {isAdmin && (
                    <th className="py-2.5 px-6 text-right">Review Decision</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pending.map((entry) => {
                  const isEditing = editingPendingId === entry.id;
                  const isSale = entry.type === 'sale';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-6 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            value={draftDate}
                            onChange={(e) => setDraftDate(e.target.value)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded font-mono"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            {entry.scheduledDate}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={draftDesc}
                            onChange={(e) => setDraftDesc(e.target.value)}
                            className="w-full px-2.5 py-1 text-sm border border-slate-300 rounded"
                          />
                        ) : (
                          <>
                            <div className="font-medium text-slate-900">
                              {entry.description}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {entry.category} · {entry.paymentMethod}
                              {entry.note && (
                                <span className="text-amber-700"> · {entry.note}</span>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        <span>{TYPE_LABEL[entry.type]}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{FREQ_LABEL[entry.frequency]}</span>
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          isSale ? 'text-teal-700' : 'text-slate-900'
                        }`}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={draftAmount}
                            onChange={(e) => setDraftAmount(e.target.value)}
                            className="w-28 px-2 py-1 text-right text-sm font-mono border border-slate-300 rounded"
                          />
                        ) : (
                          <>
                            {isSale ? '+' : '-'}
                            {formatCurrency(entry.amount, state.currency)}
                          </>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => setEditingPendingId(null)}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                              >
                                Cancel
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditPending(entry)}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                              >
                                Adjust
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === entry.id}
                              onClick={() => handleApprove(entry)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-md transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {isEditing ? 'Save & Post' : 'Approve & Post'}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === entry.id}
                              onClick={() => handleDismiss(entry.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                              aria-label={`Skip occurrence for ${entry.description}`}
                            >
                              <X className="w-3.5 h-3.5" />
                              Skip
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Configured Recurring Schedules */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Configured Recurring Schedules
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily, weekly, monthly, and yearly rules for automated income and expense posting
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={checkingDue}
                onClick={handleCheckDue}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${checkingDue ? 'animate-spin' : ''}`}
                />
                Check Due Schedules
              </button>
              <button
                type="button"
                onClick={() => onOpenRecurringModal(null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New Schedule
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Description & Category</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Cadence</th>
                <th className="py-2.5 px-4">Workflow</th>
                <th className="py-2.5 px-4">Next Run</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4">Status</th>
                {isAdmin && (
                  <th className="py-2.5 px-6 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-12 px-6 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No recurring schedules configured
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Create a daily, weekly, monthly, or yearly schedule for recurring sales or expenses.
                    </p>
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  const isSale = rule.type === 'sale';
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-6">
                        <div className="font-medium text-slate-900">
                          {rule.description}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {rule.category} · {rule.paymentMethod} · Posted{' '}
                          <span className="font-mono tabular-nums">
                            {rule.totalPostedCount}×
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {TYPE_LABEL[rule.type]}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {FREQ_LABEL[rule.frequency]}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {rule.approvalMode === 'auto_post'
                          ? 'Auto-Post'
                          : 'Manual Review'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {rule.active ? rule.nextRunDate : '—'}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          isSale ? 'text-teal-700' : 'text-slate-900'
                        }`}
                      >
                        {isSale ? '+' : '-'}
                        {formatCurrency(rule.amount, state.currency)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        {rule.active ? (
                          <span className="font-medium text-teal-700">Active</span>
                        ) : (
                          <span className="font-medium text-slate-400">Paused</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          {confirmDeleteId === rule.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeleteRule(rule.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={!rule.active || busyId === rule.id}
                                onClick={() => handleTrigger(rule.id)}
                                className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 disabled:opacity-40 rounded-md transition-colors"
                                title="Generate next scheduled occurrence now"
                              >
                                Run Next
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleRuleActive(rule)}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                                aria-label={rule.active ? 'Pause schedule' : 'Resume schedule'}
                                title={rule.active ? 'Pause schedule' : 'Resume schedule'}
                              >
                                {rule.active ? (
                                  <Pause className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenRecurringModal(rule)}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                                aria-label={`Edit ${rule.description}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(rule.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                aria-label={`Delete ${rule.description}`}
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
    </div>
  );
};
