import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  AccountingState,
  AccountingSummary,
  BudgetRule,
} from '../types/accounting';
import { DEFAULT_BUDGET_RULES } from '../data/seedData';
import { formatCurrency, formatPercent } from '../utils/calculations';
import { InteractivePieChart } from './InteractivePieChart';

interface BudgetAllocationPageProps {
  state: AccountingState;
  summary: AccountingSummary;
  isAdmin: boolean;
  onSaveBudgetRules: (rules: BudgetRule[]) => Promise<void>;
}

const EXTRA_COLORS = ['#0369A1', '#7C3AED', '#BE123C', '#0D9488', '#B45309'];

export const BudgetAllocationPage: React.FC<BudgetAllocationPageProps> = ({
  state,
  summary,
  isAdmin,
  onSaveBudgetRules,
}) => {
  const [draftRules, setDraftRules] = useState<BudgetRule[]>(state.budgetRules);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraftRules(state.budgetRules);
  }, [state.budgetRules]);

  const draftTotalPct = draftRules.reduce(
    (sum, r) => sum + Number(r.percentage || 0),
    0
  );
  const isValidTotal = Math.abs(draftTotalPct - 100) < 0.05;
  const allocatableNetIncome = Math.max(0, summary.netProfit);

  const liveSlices = draftRules.map((rule) => ({
    id: rule.id,
    name: rule.name || 'Untitled Fund',
    value: (allocatableNetIncome * Number(rule.percentage || 0)) / 100,
    percentage: Number(rule.percentage || 0),
    color: rule.color,
    subtitle: rule.description,
  }));

  const handlePctChange = (id: string, val: string) => {
    setSavedNotice(false);
    setError(null);
    const num = Math.max(0, Math.min(100, Number(val) || 0));
    setDraftRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, percentage: num } : r))
    );
  };

  const handleFieldChange = (
    id: string,
    field: 'name' | 'description' | 'color',
    val: string
  ) => {
    setSavedNotice(false);
    setDraftRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleAddBucket = () => {
    setSavedNotice(false);
    const nextColor = EXTRA_COLORS[draftRules.length % EXTRA_COLORS.length];
    setDraftRules((prev) => [
      ...prev,
      {
        id: `bucket-${Date.now().toString(36)}`,
        name: 'New Allocation Fund',
        description: 'Custom purpose reserve from net income',
        percentage: 0,
        color: nextColor,
      },
    ]);
  };

  const handleRemoveBucket = (id: string) => {
    if (draftRules.length <= 1) return;
    setSavedNotice(false);
    setDraftRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleResetDefaults = () => {
    setSavedNotice(false);
    setError(null);
    setDraftRules(DEFAULT_BUDGET_RULES.map((r) => ({ ...r })));
  };

  const handleSave = async () => {
    setError(null);
    setSavedNotice(false);
    if (!isValidTotal) {
      setError(
        `Allocations must total exactly 100.0%. Current sum is ${draftTotalPct.toFixed(1)}%.`
      );
      return;
    }
    setSaving(true);
    try {
      await onSaveBudgetRules(draftRules);
      setSavedNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save allocation rules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Allocatable Net Income (Net Profit)
          </span>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              summary.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'
            }`}
          >
            {formatCurrency(summary.netProfit, state.currency)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Calculated as Gross Profit ({formatCurrency(summary.grossProfit, state.currency)}) minus Expenses ({formatCurrency(summary.totalExpenses, state.currency)})
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Active Allocation Total
          </span>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              isValidTotal ? 'text-slate-900' : 'text-amber-700'
            }`}
          >
            {formatPercent(draftTotalPct)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {isValidTotal
              ? 'Balanced at 100% of net income.'
              : `${(100 - draftTotalPct).toFixed(1)}% remaining to balance to 100%.`}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Net Margin Efficiency
          </span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatPercent(summary.netMarginPct)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Share of total sales ({formatCurrency(summary.totalSales, state.currency)}) retained for allocation
          </p>
        </div>
      </div>

      {/* Interactive Pie Chart + Allocation Editor */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">
              Net Income Distribution Chart
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live interactive preview as you adjust percentages (Advertising, Branding, Reinvestment, Savings)
            </p>
          </div>
          <InteractivePieChart
            slices={liveSlices}
            variant="pie"
            size={260}
            currency={state.currency}
            emptyMessage={`Record net profit above ${formatCurrency(0, state.currency)} to visualize budget allocations.`}
          />
        </div>

        <div className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {isAdmin
                    ? 'Configure Allocation Percentages'
                    : 'Allocation Policy Rules'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAdmin
                    ? 'Customize how net income is distributed across business purposes'
                    : 'Read-only view of configured net income distribution rules'}
                </p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    10/5/50/35 Default
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBucket}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Fund
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {draftRules.map((rule) => {
                const dollarPreview =
                  (allocatableNetIncome * Number(rule.percentage || 0)) / 100;
                return (
                  <div
                    key={rule.id}
                    className="p-4 border border-slate-200 rounded-lg space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        {isAdmin ? (
                          <input
                            type="color"
                            value={rule.color}
                            onChange={(e) =>
                              handleFieldChange(rule.id, 'color', e.target.value)
                            }
                            aria-label={`Color for ${rule.name}`}
                            className="w-6 h-6 rounded border border-slate-200 cursor-pointer shrink-0 p-0"
                          />
                        ) : (
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: rule.color }}
                            aria-hidden="true"
                          />
                        )}
                        {isAdmin ? (
                          <input
                            type="text"
                            value={rule.name}
                            onChange={(e) =>
                              handleFieldChange(rule.id, 'name', e.target.value)
                            }
                            aria-label="Fund name"
                            className="text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none w-full"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {rule.name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-slate-500">
                          {formatCurrency(dollarPreview, state.currency)}
                        </span>
                        {isAdmin ? (
                          <div className="relative w-20">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.5"
                              value={rule.percentage}
                              onChange={(e) =>
                                handlePctChange(rule.id, e.target.value)
                              }
                              aria-label={`${rule.name} percentage`}
                              className="w-full pr-6 pl-2.5 py-1 text-right text-sm font-mono tabular-nums border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                              %
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm font-mono tabular-nums font-semibold text-slate-900 w-14 text-right">
                            {formatPercent(rule.percentage)}
                          </span>
                        )}
                        {isAdmin && draftRules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBucket(rule.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                            aria-label={`Remove ${rule.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isAdmin && (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={rule.percentage}
                        onChange={(e) =>
                          handlePctChange(rule.id, e.target.value)
                        }
                        aria-label={`${rule.name} slider`}
                        className="w-full accent-teal-700 cursor-pointer"
                      />
                    )}

                    {isAdmin ? (
                      <input
                        type="text"
                        value={rule.description}
                        placeholder="Purpose note (e.g. Packaging, labels, ad spend)"
                        onChange={(e) =>
                          handleFieldChange(rule.id, 'description', e.target.value)
                        }
                        className="w-full text-xs text-slate-500 bg-transparent border-b border-transparent focus:border-slate-200 focus:outline-none"
                      />
                    ) : (
                      <p className="text-xs text-slate-500">{rule.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <div className="mt-5 pt-4 border-t border-slate-200 space-y-3">
              {error && (
                <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}
              {savedNotice && (
                <div className="px-3.5 py-2.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800 font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Budget allocation rules saved and synced across the dashboard.
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <div className="text-xs">
                  <span className="text-slate-500">Total Split: </span>
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      isValidTotal ? 'text-teal-700' : 'text-amber-700'
                    }`}
                  >
                    {draftTotalPct.toFixed(1)}% / 100.0%
                  </span>
                </div>
                <button
                  type="button"
                  disabled={saving || !isValidTotal}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Allocation Rules'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Allocated Budget vs Actual Spend Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Allocated Net Income vs. Recorded Spend
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tracks actual tagged expenses (advertising, packaging & labels) against your net income allocation targets
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Allocation Purpose</th>
                <th className="py-2.5 px-4 text-right">Share</th>
                <th className="py-2.5 px-4 text-right">Allocated Budget</th>
                <th className="py-2.5 px-4 text-right">Recorded Spend</th>
                <th className="py-2.5 px-4 text-right">Remaining / Retained</th>
                <th className="py-2.5 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {summary.budgetAllocations.map((bucket) => {
                const isOver = bucket.variance < 0;
                return (
                  <tr key={bucket.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: bucket.color }}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="font-medium text-slate-900">
                            {bucket.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {bucket.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatPercent(bucket.percentage)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(bucket.allocatedAmount, state.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatCurrency(bucket.actualSpent, state.currency)}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        isOver ? 'text-red-600' : 'text-teal-700'
                      }`}
                    >
                      {formatCurrency(bucket.variance, state.currency)}
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap text-xs">
                      {isOver ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Over Budget
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-teal-700">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Within Target
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
