import {
  AccountingState,
  AccountingSummary,
  BudgetAllocationComputed,
} from '../types/accounting';

const CATEGORY_COLORS = [
  '#0F766E',
  '#1D4ED8',
  '#D97706',
  '#475569',
  '#0369A1',
  '#7C3AED',
];

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number, currency = 'NPR'): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  const locale = currency === 'NPR' ? 'en-NP' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeVal);
}

export function formatPercent(value: number): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  return `${safeVal.toFixed(1)}%`;
}

export function computeAccountingSummary(state: AccountingState): AccountingSummary {
  let totalSales = 0;
  let salesCount = 0;
  let totalCogs = 0;
  let totalPurchases = 0;
  let totalPettyCashExpenses = 0;
  let totalPettyCashReplenished = 0;
  let totalOperatingExpenses = 0;

  const spentByBucket: Record<string, number> = {};
  const pettyCashCatMap: Record<string, number> = {};

  for (const tx of state.transactions) {
    const amt = Number(tx.amount) || 0;
    switch (tx.type) {
      case 'sale':
        totalSales += amt;
        salesCount += 1;
        totalCogs += Number(tx.cogs) || 0;
        break;
      case 'purchase':
        totalPurchases += amt;
        break;
      case 'petty_cash_expense':
        totalPettyCashExpenses += amt;
        pettyCashCatMap[tx.category] = (pettyCashCatMap[tx.category] || 0) + amt;
        if (tx.budgetBucketId) {
          spentByBucket[tx.budgetBucketId] =
            (spentByBucket[tx.budgetBucketId] || 0) + amt;
        }
        break;
      case 'operating_expense':
        totalOperatingExpenses += amt;
        if (tx.budgetBucketId) {
          spentByBucket[tx.budgetBucketId] =
            (spentByBucket[tx.budgetBucketId] || 0) + amt;
        }
        break;
      case 'petty_cash_replenish':
        totalPettyCashReplenished += amt;
        break;
    }
  }

  totalSales = roundCurrency(totalSales);
  totalCogs = roundCurrency(totalCogs);
  totalPurchases = roundCurrency(totalPurchases);
  totalPettyCashExpenses = roundCurrency(totalPettyCashExpenses);
  totalPettyCashReplenished = roundCurrency(totalPettyCashReplenished);
  totalOperatingExpenses = roundCurrency(totalOperatingExpenses);

  const grossProfit = roundCurrency(totalSales - totalCogs);
  const grossMarginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  const totalExpenses = roundCurrency(totalPettyCashExpenses + totalOperatingExpenses);
  const netProfit = roundCurrency(grossProfit - totalExpenses);
  const netMarginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
  const pettyCashBalance = roundCurrency(
    totalPettyCashReplenished - totalPettyCashExpenses
  );

  let totalStockLevels = 0;
  let totalStocksRemaining = 0;
  let inventoryAssetValue = 0;
  let inventoryRetailValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of state.inventory) {
    totalStockLevels += item.totalStockLevel;
    totalStocksRemaining += item.stockRemaining;
    inventoryAssetValue += item.stockRemaining * item.unitCost;
    inventoryRetailValue += item.stockRemaining * item.sellingPrice;
    if (item.stockRemaining <= 0) {
      outOfStockCount += 1;
    } else if (item.stockRemaining <= item.reorderLevel) {
      lowStockCount += 1;
    }
  }

  const totalUnitsSold = Math.max(0, totalStockLevels - totalStocksRemaining);
  const stockUtilizationPct =
    totalStockLevels > 0 ? (totalStocksRemaining / totalStockLevels) * 100 : 0;

  const allocatableIncome = Math.max(0, netProfit);
  const budgetAllocations: BudgetAllocationComputed[] = state.budgetRules.map(
    (rule) => {
      const allocatedAmount = roundCurrency(
        (allocatableIncome * rule.percentage) / 100
      );
      const actualSpent = roundCurrency(spentByBucket[rule.id] || 0);
      return {
        ...rule,
        allocatedAmount,
        actualSpent,
        variance: roundCurrency(allocatedAmount - actualSpent),
      };
    }
  );

  const totalBudgetPct = state.budgetRules.reduce(
    (sum, r) => sum + r.percentage,
    0
  );

  const costComposition = [
    {
      id: 'cogs',
      name: 'Cost of Goods Sold',
      value: totalCogs,
      color: '#1E293B',
    },
    {
      id: 'operating',
      name: 'Operating Expenses',
      value: totalOperatingExpenses,
      color: '#0369A1',
    },
    {
      id: 'petty_cash',
      name: 'Petty Cash Expenses',
      value: totalPettyCashExpenses,
      color: '#D97706',
    },
    {
      id: 'net_profit',
      name: 'Net Profit Retained',
      value: Math.max(0, netProfit),
      color: '#0F766E',
    },
  ].filter((entry) => entry.value > 0);

  const pettyCashByCategory = Object.entries(pettyCashCatMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], idx) => ({
      id: `pc-${idx}`,
      name,
      value: roundCurrency(value),
      color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
    }));

  return {
    totalSales,
    salesCount,
    totalCogs,
    totalPurchases,
    grossProfit,
    grossMarginPct,
    totalPettyCashExpenses,
    totalPettyCashReplenished,
    pettyCashBalance,
    totalOperatingExpenses,
    totalExpenses,
    netProfit,
    netMarginPct,
    totalStockLevels,
    totalStocksRemaining,
    totalUnitsSold,
    stockUtilizationPct,
    inventoryAssetValue: roundCurrency(inventoryAssetValue),
    inventoryRetailValue: roundCurrency(inventoryRetailValue),
    lowStockCount,
    outOfStockCount,
    budgetAllocations,
    totalBudgetPct,
    costComposition,
    pettyCashByCategory,
  };
}
