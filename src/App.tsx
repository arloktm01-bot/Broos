import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PieChart,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  AccountingState,
  BudgetRule,
  InventoryItem,
  PaymentMethod,
  RecurrenceFrequency,
  RecurringApprovalMode,
  RecurringRule,
  TransactionType,
} from './types/accounting';
import { computeAccountingSummary, formatCurrency } from './utils/calculations';
import { AuthGate, AuthenticatedUser } from './components/AuthGate';
import { AppSection, OverviewPage } from './components/OverviewPage';
import { TransactionsPage } from './components/TransactionsPage';
import { PettyCashPage } from './components/PettyCashPage';
import { BudgetAllocationPage } from './components/BudgetAllocationPage';
import { InventoryPage } from './components/InventoryPage';
import { RecurringPage } from './components/RecurringPage';
import { TransactionModal } from './components/TransactionModal';
import { InventoryModal } from './components/InventoryModal';
import { RecurringModal } from './components/RecurringModal';

const TOKEN_STORAGE_KEY = 'ledgercraft_session_token';

const NAV_ITEMS: {
  id: AppSection;
  label: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Financial & Inventory Summary',
    icon: LayoutDashboard,
  },
  {
    id: 'transactions',
    label: 'Transactions',
    title: 'General Ledger',
    icon: BookOpen,
  },
  {
    id: 'recurring',
    label: 'Recurring',
    title: 'Recurring Schedules & Approvals',
    icon: Repeat,
  },
  {
    id: 'petty_cash',
    label: 'Petty Cash',
    title: 'Petty Cash Imprest Register',
    icon: Wallet,
  },
  {
    id: 'budget',
    label: 'Budget Allocation',
    title: 'Net Income Budget Allocation',
    icon: PieChart,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    title: 'Inventory & Stock Control',
    icon: Package,
  },
];

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [section, setSection] = useState<AppSection>('overview');
  const [state, setState] = useState<AccountingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txModalType, setTxModalType] = useState<TransactionType>('sale');
  const [txModalSkuId, setTxModalSkuId] = useState<string>('');

  const [invModalOpen, setInvModalOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<InventoryItem | null>(null);

  const [recModalOpen, setRecModalOpen] = useState(false);
  const [editingRecRule, setEditingRecRule] = useState<RecurringRule | null>(null);

  const [confirmWorkspaceAction, setConfirmWorkspaceAction] = useState<
    'reset' | 'clear' | null
  >(null);

  const clearSession = useCallback(() => {
    try {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setToken(null);
    setUser(null);
    setState(null);
    setLoadError(null);
    setTxModalOpen(false);
    setInvModalOpen(false);
    setRecModalOpen(false);
    setConfirmWorkspaceAction(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setUser(null);
      setAuthReady(true);
      setLoading(false);
      return;
    }

    fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          clearSession();
          setAuthReady(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { user: AuthenticatedUser };
        setUser(data.user);
        setAuthReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setAuthReady(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, clearSession]);

  const fetchLedgerState = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const res = await fetch('/api/state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          clearSession();
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Unable to load accounting ledger.');
        }
        setState(data.state);
        setLoadError(null);
      } catch (err) {
        if (!silent) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Unable to load accounting ledger.'
          );
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [token, clearSession]
  );

  useEffect(() => {
    if (!authReady || !user || !token) return;

    void fetchLedgerState(false);

    const intervalId = window.setInterval(() => {
      void fetchLedgerState(true);
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authReady, user, token, fetchLedgerState]);

  const apiMutate = useCallback(
    async (url: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) => {
      if (!token) {
        throw new Error('Authentication required.');
      }
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) {
        clearSession();
        throw new Error('Session expired. Please sign in again.');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Operation failed.');
      }
      if (data.state) {
        setState(data.state as AccountingState);
      }
      return data;
    },
    [token, clearSession]
  );

  const summary = useMemo(
    () => (state ? computeAccountingSummary(state) : null),
    [state]
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500">
          Verifying account session...
        </div>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <AuthGate
        onLoginSuccess={(nextToken, nextUser) => {
          try {
            window.sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
          } catch {
            // ignore storage errors
          }
          setToken(nextToken);
          setUser(nextUser);
          setSection('overview');
        }}
      />
    );
  }

  const isAdmin = user.role === 'admin';

  const handleOpenTransactionModal = (
    type: TransactionType = 'sale',
    skuId = ''
  ) => {
    if (!isAdmin) return;
    setTxModalType(type);
    setTxModalSkuId(skuId);
    setTxModalOpen(true);
  };

  const handleOpenInventoryModal = (item: InventoryItem | null = null) => {
    if (!isAdmin) return;
    setEditingSku(item);
    setInvModalOpen(true);
  };

  const handleOpenRecurringModal = (rule: RecurringRule | null = null) => {
    if (!isAdmin) return;
    setEditingRecRule(rule);
    setRecModalOpen(true);
  };

  const handleCreateTransaction = async (payload: {
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
  }) => {
    if (!isAdmin) return;
    await apiMutate('/api/transactions', 'POST', payload);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!isAdmin) return;
    await apiMutate(`/api/transactions/${encodeURIComponent(id)}`, 'DELETE');
  };

  const handleSaveInventory = async (payload: {
    id?: string;
    sku: string;
    name: string;
    category: string;
    totalStockLevel: number;
    stockRemaining?: number;
    unitCost: number;
    sellingPrice: number;
    reorderLevel: number;
  }) => {
    if (!isAdmin) return;
    if (payload.id) {
      await apiMutate(
        `/api/inventory/${encodeURIComponent(payload.id)}`,
        'PATCH',
        payload
      );
    } else {
      await apiMutate('/api/inventory', 'POST', payload);
    }
  };

  const handleDeleteInventory = async (id: string) => {
    if (!isAdmin) return;
    await apiMutate(`/api/inventory/${encodeURIComponent(id)}`, 'DELETE');
  };

  const handleSaveBudgetRules = async (budgetRules: BudgetRule[]) => {
    if (!isAdmin) return;
    await apiMutate('/api/budget-rules', 'PUT', { budgetRules });
  };

  const handleSaveRecurringRule = async (payload: {
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
  }) => {
    if (!isAdmin) return;
    if (payload.id) {
      await apiMutate(
        `/api/recurring/${encodeURIComponent(payload.id)}`,
        'PATCH',
        payload
      );
    } else {
      await apiMutate('/api/recurring', 'POST', payload);
    }
  };

  const handleToggleRuleActive = async (rule: RecurringRule) => {
    if (!isAdmin) return;
    await apiMutate(`/api/recurring/${encodeURIComponent(rule.id)}`, 'PATCH', {
      active: !rule.active,
    });
  };

  const handleTriggerRuleNow = async (ruleId: string) => {
    if (!isAdmin) return;
    await apiMutate(
      `/api/recurring/${encodeURIComponent(ruleId)}/trigger`,
      'POST'
    );
  };

  const handleDeleteRecurringRule = async (ruleId: string) => {
    if (!isAdmin) return;
    await apiMutate(`/api/recurring/${encodeURIComponent(ruleId)}`, 'DELETE');
  };

  const handleRunDueSchedules = async (asOfDate?: string) => {
    if (!isAdmin) return;
    await apiMutate('/api/recurring/run-due', 'POST', { asOfDate });
  };

  const handleApprovePending = async (
    pendingId: string,
    overrides?: { amount?: number; scheduledDate?: string; description?: string }
  ) => {
    if (!isAdmin) return;
    await apiMutate(
      `/api/recurring/pending/${encodeURIComponent(pendingId)}/approve`,
      'POST',
      overrides || {}
    );
  };

  const handleDismissPending = async (pendingId: string) => {
    if (!isAdmin) return;
    await apiMutate(
      `/api/recurring/pending/${encodeURIComponent(pendingId)}/dismiss`,
      'POST'
    );
  };

  const handleApproveAllPending = async () => {
    if (!isAdmin) return;
    await apiMutate('/api/recurring/pending/approve-all', 'POST');
  };

  const handleResetDemo = async () => {
    if (!isAdmin) return;
    await apiMutate('/api/reset-demo', 'POST');
    setConfirmWorkspaceAction(null);
  };

  const handleClearLedger = async () => {
    if (!isAdmin) return;
    await apiMutate('/api/clear-ledger', 'POST');
    setConfirmWorkspaceAction(null);
  };

  const handleSignOut = () => {
    clearSession();
  };

  const currentNav =
    NAV_ITEMS.find((n) => n.id === section) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <button
            type="button"
            onClick={() => setSection('overview')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
          >
            LedgerCraft
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1" aria-label="Main workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            const pendingCount =
              item.id === 'recurring' ? state?.pendingRecurring?.length || 0 : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {pendingCount > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      active ? 'text-amber-300' : 'text-amber-700 font-semibold'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="px-2 py-1">
            <span className="text-xs font-semibold text-slate-900 truncate block">
              {user.displayName}
            </span>
            <span className="text-xs text-slate-500 truncate block">
              @{user.username} · {isAdmin ? 'Admin' : 'View Only'}
            </span>
            {state && summary && (
              <span className="text-xs font-mono tabular-nums text-slate-600 block mt-1.5">
                Petty Cash: {formatCurrency(summary.pettyCashBalance, state.currency)}
              </span>
            )}
          </div>

          {isAdmin && (
            confirmWorkspaceAction ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="text-xs font-medium text-slate-800">
                  {confirmWorkspaceAction === 'reset'
                    ? 'Restore sample transactions & inventory?'
                    : 'Clear all transactions & inventory to start fresh?'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={
                      confirmWorkspaceAction === 'reset'
                        ? handleResetDemo
                        : handleClearLedger
                    }
                    className="flex-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmWorkspaceAction(null)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmWorkspaceAction('reset')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Demo Data
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWorkspaceAction('clear')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Blank Slate
                </button>
              </div>
            )
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-64 bg-white h-full border-r border-slate-200 flex flex-col">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                LedgerCraft
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="px-1">
                <span className="text-xs font-semibold text-slate-900 block truncate">
                  {user.displayName}
                </span>
                <span className="text-xs text-slate-500 block truncate">
                  @{user.username} · {isAdmin ? 'Admin' : 'View Only'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">Workspace</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {currentNav.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isAdmin ? (
              <button
                type="button"
                disabled={!state}
                onClick={() => handleOpenTransactionModal('sale')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Record Transaction
              </button>
            ) : (
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                Read-Only Access
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {loading ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading accounting data">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
                <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          ) : loadError || !state || !summary ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-md mx-auto mt-12">
              <h2 className="text-base font-semibold text-slate-900">
                Unable to Load Accounting Ledger
              </h2>
              <p className="text-xs text-slate-500 mt-2 break-words">
                {loadError || 'Unexpected response from accounting server.'}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchLedgerState(false)}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <OverviewPage
                  state={state}
                  summary={summary}
                  isAdmin={isAdmin}
                  onNavigate={setSection}
                  onOpenTransactionModal={handleOpenTransactionModal}
                  onOpenInventoryModal={handleOpenInventoryModal}
                  onDeleteInventory={handleDeleteInventory}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              )}
              {section === 'transactions' && (
                <TransactionsPage
                  state={state}
                  summary={summary}
                  isAdmin={isAdmin}
                  onOpenTransactionModal={handleOpenTransactionModal}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              )}
              {section === 'recurring' && (
                <RecurringPage
                  state={state}
                  isAdmin={isAdmin}
                  onOpenRecurringModal={handleOpenRecurringModal}
                  onToggleRuleActive={handleToggleRuleActive}
                  onTriggerRuleNow={handleTriggerRuleNow}
                  onDeleteRule={handleDeleteRecurringRule}
                  onRunDueSchedules={handleRunDueSchedules}
                  onApprovePending={handleApprovePending}
                  onDismissPending={handleDismissPending}
                  onApproveAllPending={handleApproveAllPending}
                />
              )}
              {section === 'petty_cash' && (
                <PettyCashPage
                  state={state}
                  summary={summary}
                  isAdmin={isAdmin}
                  onOpenTransactionModal={handleOpenTransactionModal}
                  onDeleteTransaction={handleDeleteTransaction}
                />
              )}
              {section === 'budget' && (
                <BudgetAllocationPage
                  state={state}
                  summary={summary}
                  isAdmin={isAdmin}
                  onSaveBudgetRules={handleSaveBudgetRules}
                />
              )}
              {section === 'inventory' && (
                <InventoryPage
                  state={state}
                  summary={summary}
                  isAdmin={isAdmin}
                  onOpenInventoryModal={handleOpenInventoryModal}
                  onOpenTransactionModal={handleOpenTransactionModal}
                  onDeleteInventory={handleDeleteInventory}
                />
              )}
            </>
          )}
        </main>
      </div>

      {isAdmin && state && summary && (
        <>
          <TransactionModal
            isOpen={txModalOpen}
            initialType={txModalType}
            initialSkuId={txModalSkuId}
            inventory={state.inventory}
            budgetRules={state.budgetRules}
            pettyCashBalance={summary.pettyCashBalance}
            currency={state.currency}
            onClose={() => setTxModalOpen(false)}
            onSubmit={handleCreateTransaction}
          />
          <InventoryModal
            isOpen={invModalOpen}
            editingItem={editingSku}
            currency={state.currency}
            onClose={() => setInvModalOpen(false)}
            onSave={handleSaveInventory}
          />
          <RecurringModal
            isOpen={recModalOpen}
            editingRule={editingRecRule}
            budgetRules={state.budgetRules}
            currency={state.currency}
            onClose={() => setRecModalOpen(false)}
            onSave={handleSaveRecurringRule}
          />
        </>
      )}
    </div>
  );
}
