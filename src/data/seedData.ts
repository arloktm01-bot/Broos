import { AccountingState } from '../types/accounting';

export const DEFAULT_BUDGET_RULES = [
  {
    id: 'advertising',
    name: 'Advertising',
    description: 'Paid search, social campaigns, and customer acquisition',
    percentage: 10,
    color: '#0F766E',
  },
  {
    id: 'branding',
    name: 'Branding (Packaging & Labels)',
    description: 'Custom boxes, woven tags, adhesive labels, and inserts',
    percentage: 5,
    color: '#D97706',
  },
  {
    id: 'reinvestment',
    name: 'Reinvestment',
    description: 'Inventory restocking, tooling, and operational growth',
    percentage: 50,
    color: '#1D4ED8',
  },
  {
    id: 'savings',
    name: 'Savings Reserve',
    description: 'Business emergency fund and retained cash reserve',
    percentage: 35,
    color: '#334155',
  },
];

export function createDefaultRecurringRules() {
  return [
    {
      id: 'rec-lease',
      type: 'operating_expense' as const,
      description: 'Warehouse & Fulfillment Studio Monthly Lease',
      category: 'Rent & Facilities',
      amount: 1200.0,
      paymentMethod: 'Bank Transfer' as const,
      frequency: 'monthly' as const,
      startDate: '2026-11-05',
      nextRunDate: '2026-12-05',
      approvalMode: 'auto_post' as const,
      active: true,
      lastPostedDate: '2026-11-05',
      totalPostedCount: 1,
      createdAt: '2026-11-01T08:00:00.000Z',
    },
    {
      id: 'rec-cafe-retainer',
      type: 'sale' as const,
      description: 'Monthly Cafe Partner Subscription — Roast Beans',
      category: 'Wholesale Order',
      amount: 696.0,
      paymentMethod: 'Bank Transfer' as const,
      frequency: 'monthly' as const,
      startDate: '2026-11-14',
      nextRunDate: '2026-11-14',
      approvalMode: 'manual_review' as const,
      active: true,
      totalPostedCount: 0,
      createdAt: '2026-11-01T08:15:00.000Z',
    },
    {
      id: 'rec-weekly-ads',
      type: 'operating_expense' as const,
      description: 'Weekly Search & Social Ad Spend Retainer',
      category: 'Advertising',
      amount: 155.0,
      paymentMethod: 'Card' as const,
      frequency: 'weekly' as const,
      startDate: '2026-11-06',
      nextRunDate: '2026-11-13',
      approvalMode: 'manual_review' as const,
      active: true,
      budgetBucketId: 'advertising',
      lastPostedDate: '2026-11-06',
      totalPostedCount: 1,
      createdAt: '2026-11-06T14:20:00.000Z',
    },
  ];
}

export function createInitialAccountingState(): AccountingState {
  return {
    businessName: 'Northwind Roastery & Goods',
    currency: 'NPR',
    pettyCashLimit: 15000,
    budgetRules: DEFAULT_BUDGET_RULES.map((r) => ({ ...r })),
    recurringRules: [],
    pendingRecurring: [],
    inventory: [],
    transactions: [],
  };
}
