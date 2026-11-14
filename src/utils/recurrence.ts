import {
  AccountingState,
  PendingRecurringEntry,
  RecurrenceFrequency,
  RecurringRule,
  Transaction,
  TransactionType,
} from '../types/accounting';
import { computeAccountingSummary, formatCurrency, roundCurrency } from './calculations';

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function advanceDate(
  dateStr: string,
  frequency: RecurrenceFrequency
): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return getTodayIsoDate();
  }
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'monthly': {
      const targetMonth = date.getUTCMonth() + 1;
      const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = targetMonth % 12;
      const daysInTargetMonth = new Date(
        Date.UTC(targetYear, normalizedMonth + 1, 0)
      ).getUTCDate();
      date.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, daysInTargetMonth));
      break;
    }
    case 'yearly': {
      const nextYear = year + 1;
      const daysInFeb = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
      date.setUTCFullYear(nextYear, month - 1, Math.min(day, daysInFeb));
      break;
    }
  }

  return date.toISOString().slice(0, 10);
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function postRecurringOccurrenceToState(
  state: AccountingState,
  entry: {
    ruleId: string;
    scheduledDate: string;
    type: TransactionType;
    description: string;
    category: string;
    amount: number;
    paymentMethod: RecurringRule['paymentMethod'];
    budgetBucketId?: string;
    skuId?: string;
    quantity?: number;
  }
): { state: AccountingState; posted?: Transaction; error?: string } {
  const now = new Date().toISOString();
  let amount = roundCurrency(entry.amount);
  let cogs: number | undefined;
  let unitPrice: number | undefined;
  const nextInventory = [...state.inventory];

  if (entry.type === 'petty_cash_expense') {
    const currentSummary = computeAccountingSummary(state);
    if (amount > currentSummary.pettyCashBalance) {
      return {
        state,
        error: `Insufficient petty cash balance (${formatCurrency(currentSummary.pettyCashBalance, state.currency)} available).`,
      };
    }
  }

  if (entry.skuId) {
    const idx = nextInventory.findIndex((i) => i.id === entry.skuId);
    if (idx !== -1) {
      const sku = nextInventory[idx];
      const qty = Math.max(1, Math.floor(entry.quantity || 1));
      if (entry.type === 'sale') {
        if (qty > sku.stockRemaining) {
          return {
            state,
            error: `Insufficient stock for ${sku.name} (${sku.stockRemaining} remaining).`,
          };
        }
        unitPrice = sku.sellingPrice;
        cogs = roundCurrency(qty * sku.unitCost);
        nextInventory[idx] = {
          ...sku,
          stockRemaining: sku.stockRemaining - qty,
          updatedAt: now,
        };
      } else if (entry.type === 'purchase') {
        unitPrice = sku.unitCost;
        nextInventory[idx] = {
          ...sku,
          totalStockLevel: sku.totalStockLevel + qty,
          stockRemaining: sku.stockRemaining + qty,
          updatedAt: now,
        };
      }
    }
  }

  const newTx: Transaction = {
    id: generateId('tx'),
    date: entry.scheduledDate,
    type: entry.type,
    description: entry.description,
    category: entry.category,
    amount,
    paymentMethod: entry.paymentMethod,
    reference: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
    skuId: entry.skuId,
    quantity: entry.quantity,
    unitPrice,
    cogs,
    budgetBucketId: entry.budgetBucketId,
    recurringRuleId: entry.ruleId,
    notes: 'Posted from recurring transaction schedule',
    createdAt: now,
  };

  return {
    state: {
      ...state,
      inventory: nextInventory,
      transactions: [newTx, ...state.transactions],
    },
    posted: newTx,
  };
}

export function processDueRecurringRules(
  inputState: AccountingState,
  asOfDate: string = getTodayIsoDate()
): {
  state: AccountingState;
  changed: boolean;
  autoPostedCount: number;
  queuedCount: number;
} {
  let state: AccountingState = {
    ...inputState,
    recurringRules: inputState.recurringRules ? [...inputState.recurringRules] : [],
    pendingRecurring: inputState.pendingRecurring ? [...inputState.pendingRecurring] : [],
    transactions: [...inputState.transactions],
    inventory: [...inputState.inventory],
  };

  let changed = false;
  let autoPostedCount = 0;
  let queuedCount = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < state.recurringRules.length; i++) {
    let rule = { ...state.recurringRules[i] };
    if (!rule.active) continue;

    let guard = 0;
    while (
      rule.active &&
      rule.nextRunDate <= asOfDate &&
      (!rule.endDate || rule.nextRunDate <= rule.endDate) &&
      guard < 36
    ) {
      guard += 1;
      const dueDate = rule.nextRunDate;

      if (rule.approvalMode === 'auto_post') {
        const result = postRecurringOccurrenceToState(state, {
          ruleId: rule.id,
          scheduledDate: dueDate,
          type: rule.type,
          description: rule.description,
          category: rule.category,
          amount: rule.amount,
          paymentMethod: rule.paymentMethod,
          budgetBucketId: rule.budgetBucketId,
          skuId: rule.skuId,
          quantity: rule.quantity,
        });

        if (result.posted) {
          state = result.state;
          rule.lastPostedDate = dueDate;
          rule.totalPostedCount = (rule.totalPostedCount || 0) + 1;
          autoPostedCount += 1;
        } else {
          const alreadyPending = state.pendingRecurring.some(
            (p) => p.ruleId === rule.id && p.scheduledDate === dueDate
          );
          if (!alreadyPending) {
            const fallbackPending: PendingRecurringEntry = {
              id: generateId('pend'),
              ruleId: rule.id,
              scheduledDate: dueDate,
              type: rule.type,
              description: rule.description,
              category: rule.category,
              amount: rule.amount,
              paymentMethod: rule.paymentMethod,
              frequency: rule.frequency,
              budgetBucketId: rule.budgetBucketId,
              skuId: rule.skuId,
              quantity: rule.quantity,
              note: result.error,
              createdAt: now,
            };
            state.pendingRecurring = [fallbackPending, ...state.pendingRecurring];
            queuedCount += 1;
          }
        }
      } else {
        const alreadyPending = state.pendingRecurring.some(
          (p) => p.ruleId === rule.id && p.scheduledDate === dueDate
        );
        if (!alreadyPending) {
          const pendingEntry: PendingRecurringEntry = {
            id: generateId('pend'),
            ruleId: rule.id,
            scheduledDate: dueDate,
            type: rule.type,
            description: rule.description,
            category: rule.category,
            amount: rule.amount,
            paymentMethod: rule.paymentMethod,
            frequency: rule.frequency,
            budgetBucketId: rule.budgetBucketId,
            skuId: rule.skuId,
            quantity: rule.quantity,
            createdAt: now,
          };
          state.pendingRecurring = [pendingEntry, ...state.pendingRecurring];
          queuedCount += 1;
        }
      }

      const nextDate = advanceDate(dueDate, rule.frequency);
      rule.nextRunDate = nextDate;
      if (rule.endDate && nextDate > rule.endDate) {
        rule.active = false;
      }
      changed = true;
    }

    state.recurringRules[i] = rule;
  }

  return { state, changed, autoPostedCount, queuedCount };
}

export function estimateMonthlyRecurringImpact(rules: RecurringRule[]): {
  monthlyIncome: number;
  monthlyExpense: number;
} {
  let monthlyIncome = 0;
  let monthlyExpense = 0;

  for (const rule of rules) {
    if (!rule.active) continue;
    let multiplier = 1;
    switch (rule.frequency) {
      case 'daily':
        multiplier = 30;
        break;
      case 'weekly':
        multiplier = 4.333;
        break;
      case 'monthly':
        multiplier = 1;
        break;
      case 'yearly':
        multiplier = 1 / 12;
        break;
    }
    const monthlyVal = rule.amount * multiplier;
    if (rule.type === 'sale') {
      monthlyIncome += monthlyVal;
    } else if (rule.type !== 'petty_cash_replenish') {
      monthlyExpense += monthlyVal;
    }
  }

  return {
    monthlyIncome: roundCurrency(monthlyIncome),
    monthlyExpense: roundCurrency(monthlyExpense),
  };
}
