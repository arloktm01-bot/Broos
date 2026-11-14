export type TransactionType =
  | 'sale'
  | 'purchase'
  | 'petty_cash_expense'
  | 'operating_expense'
  | 'petty_cash_replenish';

export type PaymentMethod = 'Bank Transfer' | 'Card' | 'Cash' | 'Petty Cash';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurringApprovalMode = 'auto_post' | 'manual_review';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference: string;
  skuId?: string;
  quantity?: number;
  unitPrice?: number;
  cogs?: number;
  budgetBucketId?: string;
  recurringRuleId?: string;
  notes?: string;
  createdAt: string;
}

export interface RecurringRule {
  id: string;
  type: TransactionType;
  description: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  frequency: RecurrenceFrequency;
  startDate: string;
  nextRunDate: string;
  endDate?: string;
  approvalMode: RecurringApprovalMode;
  active: boolean;
  budgetBucketId?: string;
  skuId?: string;
  quantity?: number;
  lastPostedDate?: string;
  totalPostedCount: number;
  createdAt: string;
}

export interface PendingRecurringEntry {
  id: string;
  ruleId: string;
  scheduledDate: string;
  type: TransactionType;
  description: string;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  frequency: RecurrenceFrequency;
  budgetBucketId?: string;
  skuId?: string;
  quantity?: number;
  note?: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  totalStockLevel: number;
  stockRemaining: number;
  unitCost: number;
  sellingPrice: number;
  reorderLevel: number;
  updatedAt: string;
}

export interface BudgetRule {
  id: string;
  name: string;
  description: string;
  percentage: number;
  color: string;
}

export interface AccountingState {
  businessName: string;
  currency: string;
  pettyCashLimit: number;
  transactions: Transaction[];
  inventory: InventoryItem[];
  budgetRules: BudgetRule[];
  recurringRules: RecurringRule[];
  pendingRecurring: PendingRecurringEntry[];
}

export interface BudgetAllocationComputed extends BudgetRule {
  allocatedAmount: number;
  actualSpent: number;
  variance: number;
}

export interface AccountingSummary {
  totalSales: number;
  salesCount: number;
  totalCogs: number;
  totalPurchases: number;
  grossProfit: number;
  grossMarginPct: number;
  totalPettyCashExpenses: number;
  totalPettyCashReplenished: number;
  pettyCashBalance: number;
  totalOperatingExpenses: number;
  totalExpenses: number;
  netProfit: number;
  netMarginPct: number;
  totalStockLevels: number;
  totalStocksRemaining: number;
  totalUnitsSold: number;
  stockUtilizationPct: number;
  inventoryAssetValue: number;
  inventoryRetailValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  budgetAllocations: BudgetAllocationComputed[];
  totalBudgetPct: number;
  costComposition: {
    id: string;
    name: string;
    value: number;
    color: string;
  }[];
  pettyCashByCategory: {
    id: string;
    name: string;
    value: number;
    color: string;
  }[];
}
