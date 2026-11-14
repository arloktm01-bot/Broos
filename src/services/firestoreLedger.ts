import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountingState,
  BudgetRule,
  InventoryItem,
  PaymentMethod,
  PendingRecurringEntry,
  RecurrenceFrequency,
  RecurringApprovalMode,
  RecurringRule,
  Transaction,
  TransactionType,
} from '../types/accounting';
import {
  createInitialAccountingState,
  DEFAULT_BUDGET_RULES,
} from '../data/seedData';
import { computeAccountingSummary, roundCurrency } from '../utils/calculations';
import {
  advanceDate,
  getTodayIsoDate,
  processDueRecurringRules,
} from '../utils/recurrence';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return new Date().toISOString();
}

export async function ensureUserWorkspace(user: User): Promise<void> {
  const uid = user.uid;
  const userDocPath = `users/${uid}`;
  const userDocRef = doc(db, 'users', uid);

  let snap;
  try {
    snap = await getDoc(userDocRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userDocPath);
  }

  if (snap.exists()) {
    return;
  }

  try {
    await setDoc(userDocRef, {
      ownerId: uid,
      businessName: 'Northwind Roastery & Goods',
      currency: 'NPR',
      pettyCashLimit: 15000,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, userDocPath);
  }

  const profilePath = `users/${uid}/private/profile`;
  try {
    await setDoc(doc(db, 'users', uid, 'private', 'profile'), {
      ownerId: uid,
      email: user.email || 'user@example.com',
      displayName: user.displayName || user.email || 'Account Owner',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, profilePath);
  }

  const seed = createInitialAccountingState();
  const processed = processDueRecurringRules(seed);
  const seededState = processed.state;

  const batch1 = writeBatch(db);
  seededState.budgetRules.forEach((rule, idx) => {
    batch1.set(doc(db, 'users', uid, 'budgetRules', rule.id), {
      ownerId: uid,
      name: rule.name,
      description: rule.description,
      percentage: rule.percentage,
      color: rule.color,
      sortOrder: idx,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  seededState.inventory.forEach((item) => {
    batch1.set(doc(db, 'users', uid, 'inventory', item.id), {
      ownerId: uid,
      sku: item.sku,
      name: item.name,
      category: item.category,
      totalStockLevel: item.totalStockLevel,
      stockRemaining: item.stockRemaining,
      unitCost: item.unitCost,
      sellingPrice: item.sellingPrice,
      reorderLevel: item.reorderLevel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  seededState.transactions.forEach((tx) => {
    batch1.set(
      doc(db, 'users', uid, 'transactions', tx.id),
      stripUndefined({
        ownerId: uid,
        date: tx.date,
        type: tx.type,
        description: tx.description,
        category: tx.category,
        amount: tx.amount,
        paymentMethod: tx.paymentMethod,
        reference: tx.reference,
        skuId: tx.skuId,
        quantity: tx.quantity,
        unitPrice: tx.unitPrice,
        cogs: tx.cogs,
        budgetBucketId: tx.budgetBucketId,
        recurringRuleId: tx.recurringRuleId,
        notes: tx.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  seededState.recurringRules.forEach((rule) => {
    batch1.set(
      doc(db, 'users', uid, 'recurringRules', rule.id),
      stripUndefined({
        ownerId: uid,
        type: rule.type,
        description: rule.description,
        category: rule.category,
        amount: rule.amount,
        paymentMethod: rule.paymentMethod,
        frequency: rule.frequency,
        startDate: rule.startDate,
        nextRunDate: rule.nextRunDate,
        endDate: rule.endDate,
        approvalMode: rule.approvalMode,
        active: rule.active,
        budgetBucketId: rule.budgetBucketId,
        skuId: rule.skuId,
        quantity: rule.quantity,
        lastPostedDate: rule.lastPostedDate,
        totalPostedCount: rule.totalPostedCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  try {
    await batch1.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }

  if (seededState.pendingRecurring.length > 0) {
    const batch2 = writeBatch(db);
    seededState.pendingRecurring.forEach((p) => {
      batch2.set(
        doc(db, 'users', uid, 'pendingRecurring', p.id),
        stripUndefined({
          ownerId: uid,
          ruleId: p.ruleId,
          scheduledDate: p.scheduledDate,
          type: p.type,
          description: p.description,
          category: p.category,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          frequency: p.frequency,
          budgetBucketId: p.budgetBucketId,
          skuId: p.skuId,
          quantity: p.quantity,
          note: p.note,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });
    try {
      await batch2.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `users/${uid}/pendingRecurring`
      );
    }
  }
}

export function subscribeToUserLedger(
  uid: string,
  onState: (state: AccountingState) => void,
  onError: (err: Error) => void
): () => void {
  let workspaceMeta: {
    businessName: string;
    currency: string;
    pettyCashLimit: number;
  } | null = null;
  let inventory: InventoryItem[] | null = null;
  let transactions: Transaction[] | null = null;
  let budgetRules: BudgetRule[] | null = null;
  let recurringRules: RecurringRule[] | null = null;
  let pendingRecurring: PendingRecurringEntry[] | null = null;

  const emitIfReady = () => {
    if (
      workspaceMeta &&
      inventory !== null &&
      transactions !== null &&
      budgetRules !== null &&
      recurringRules !== null &&
      pendingRecurring !== null
    ) {
      onState({
        businessName: workspaceMeta.businessName,
        currency: workspaceMeta.currency,
        pettyCashLimit: workspaceMeta.pettyCashLimit,
        inventory,
        transactions,
        budgetRules,
        recurringRules,
        pendingRecurring,
      });
    }
  };

  const handleErr = (err: unknown, path: string) => {
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch (wrapped) {
      onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const unsubs: (() => void)[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const d = snap.data();
        if (d) {
          workspaceMeta = {
            businessName: String(d.businessName || 'My Business Ledger'),
            currency: String(d.currency || 'NPR'),
            pettyCashLimit: Number(d.pettyCashLimit || 15000),
          };
          emitIfReady();
        }
      },
      (err) => handleErr(err, `users/${uid}`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'inventory'), where('ownerId', '==', uid)),
      (snap) => {
        inventory = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              sku: String(data.sku),
              name: String(data.name),
              category: String(data.category),
              totalStockLevel: Number(data.totalStockLevel),
              stockRemaining: Number(data.stockRemaining),
              unitCost: Number(data.unitCost),
              sellingPrice: Number(data.sellingPrice),
              reorderLevel: Number(data.reorderLevel),
              updatedAt: timestampToIso(data.updatedAt),
            };
          })
          .sort((a, b) => a.sku.localeCompare(b.sku));
        emitIfReady();
      },
      (err) => handleErr(err, `users/${uid}/inventory`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'transactions'), where('ownerId', '==', uid)),
      (snap) => {
        transactions = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            date: String(data.date),
            type: data.type as TransactionType,
            description: String(data.description),
            category: String(data.category),
            amount: Number(data.amount),
            paymentMethod: data.paymentMethod as PaymentMethod,
            reference: String(data.reference),
            skuId: data.skuId ? String(data.skuId) : undefined,
            quantity: data.quantity !== undefined ? Number(data.quantity) : undefined,
            unitPrice: data.unitPrice !== undefined ? Number(data.unitPrice) : undefined,
            cogs: data.cogs !== undefined ? Number(data.cogs) : undefined,
            budgetBucketId: data.budgetBucketId ? String(data.budgetBucketId) : undefined,
            recurringRuleId: data.recurringRuleId ? String(data.recurringRuleId) : undefined,
            notes: data.notes ? String(data.notes) : undefined,
            createdAt: timestampToIso(data.createdAt),
          };
        });
        emitIfReady();
      },
      (err) => handleErr(err, `users/${uid}/transactions`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'budgetRules'), where('ownerId', '==', uid)),
      (snap) => {
        const items = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: String(data.name),
              description: String(data.description || ''),
              percentage: Number(data.percentage),
              color: String(data.color || '#0F766E'),
              sortOrder: Number(data.sortOrder ?? 0),
            };
          })
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({ sortOrder: _s, ...rule }) => rule);
        budgetRules = items.length > 0 ? items : DEFAULT_BUDGET_RULES.map((r) => ({ ...r }));
        emitIfReady();
      },
      (err) => handleErr(err, `users/${uid}/budgetRules`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'recurringRules'), where('ownerId', '==', uid)),
      (snap) => {
        recurringRules = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type as TransactionType,
            description: String(data.description),
            category: String(data.category),
            amount: Number(data.amount),
            paymentMethod: data.paymentMethod as PaymentMethod,
            frequency: data.frequency as RecurrenceFrequency,
            startDate: String(data.startDate),
            nextRunDate: String(data.nextRunDate),
            endDate: data.endDate ? String(data.endDate) : undefined,
            approvalMode: data.approvalMode as RecurringApprovalMode,
            active: Boolean(data.active),
            budgetBucketId: data.budgetBucketId ? String(data.budgetBucketId) : undefined,
            skuId: data.skuId ? String(data.skuId) : undefined,
            quantity: data.quantity !== undefined ? Number(data.quantity) : undefined,
            lastPostedDate: data.lastPostedDate ? String(data.lastPostedDate) : undefined,
            totalPostedCount: Number(data.totalPostedCount || 0),
            createdAt: timestampToIso(data.createdAt),
          };
        });
        emitIfReady();
      },
      (err) => handleErr(err, `users/${uid}/recurringRules`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'pendingRecurring'), where('ownerId', '==', uid)),
      (snap) => {
        pendingRecurring = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ruleId: String(data.ruleId),
            scheduledDate: String(data.scheduledDate),
            type: data.type as TransactionType,
            description: String(data.description),
            category: String(data.category),
            amount: Number(data.amount),
            paymentMethod: data.paymentMethod as PaymentMethod,
            frequency: data.frequency as RecurrenceFrequency,
            budgetBucketId: data.budgetBucketId ? String(data.budgetBucketId) : undefined,
            skuId: data.skuId ? String(data.skuId) : undefined,
            quantity: data.quantity !== undefined ? Number(data.quantity) : undefined,
            note: data.note ? String(data.note) : undefined,
            createdAt: timestampToIso(data.createdAt),
          };
        });
        emitIfReady();
      },
      (err) => handleErr(err, `users/${uid}/pendingRecurring`)
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
  };
}

export async function createTransactionInFirestore(
  uid: string,
  state: AccountingState,
  payload: {
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
    recurringRuleId?: string;
    notes?: string;
  }
): Promise<void> {
  let amount = roundCurrency(payload.amount);
  let cogs: number | undefined;
  let unitPrice =
    typeof payload.unitPrice === 'number'
      ? roundCurrency(payload.unitPrice)
      : undefined;
  const quantity =
    payload.quantity && payload.quantity > 0
      ? Math.floor(payload.quantity)
      : undefined;

  if (payload.type === 'petty_cash_expense') {
    const summary = computeAccountingSummary(state);
    if (amount > summary.pettyCashBalance) {
      throw new Error(
        `Insufficient petty cash balance (${state.currency} ${summary.pettyCashBalance.toFixed(2)} available). Replenish petty cash first.`
      );
    }
  }

  const batch = writeBatch(db);

  if (payload.skuId) {
    const sku = state.inventory.find((i) => i.id === payload.skuId);
    if (!sku) {
      throw new Error('Selected inventory SKU not found.');
    }
    const qty = quantity || 1;
    const invRef = doc(db, 'users', uid, 'inventory', sku.id);

    if (payload.type === 'sale') {
      if (qty > sku.stockRemaining) {
        throw new Error(
          `Only ${sku.stockRemaining} units of ${sku.name} remaining in stock.`
        );
      }
      const effectivePrice = unitPrice ?? sku.sellingPrice;
      unitPrice = effectivePrice;
      amount = roundCurrency(qty * effectivePrice);
      cogs = roundCurrency(qty * sku.unitCost);
      batch.update(invRef, {
        stockRemaining: sku.stockRemaining - qty,
        updatedAt: serverTimestamp(),
      });
    } else if (payload.type === 'purchase') {
      const effectiveCost = unitPrice ?? sku.unitCost;
      unitPrice = effectiveCost;
      amount = roundCurrency(qty * effectiveCost);
      batch.update(invRef, {
        totalStockLevel: sku.totalStockLevel + qty,
        stockRemaining: sku.stockRemaining + qty,
        unitCost: effectiveCost,
        updatedAt: serverTimestamp(),
      });
    }
  }

  const prefixMap: Record<TransactionType, string> = {
    sale: 'INV',
    purchase: 'PO',
    petty_cash_expense: 'PCV',
    operating_expense: 'EXP',
    petty_cash_replenish: 'PCR',
  };

  const txId = generateId('tx');
  const txRef = doc(db, 'users', uid, 'transactions', txId);

  batch.set(
    txRef,
    stripUndefined({
      ownerId: uid,
      date: payload.date,
      type: payload.type,
      description: payload.description.trim(),
      category: payload.category.trim() || 'General',
      amount,
      paymentMethod: payload.paymentMethod,
      reference:
        payload.reference?.trim() ||
        `${prefixMap[payload.type]}-${Math.floor(1000 + Math.random() * 9000)}`,
      skuId: payload.skuId || undefined,
      quantity,
      unitPrice,
      cogs,
      budgetBucketId: payload.budgetBucketId || undefined,
      recurringRuleId: payload.recurringRuleId || undefined,
      notes: payload.notes?.trim() || undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/transactions/${txId}`);
  }
}

export async function deleteTransactionInFirestore(
  uid: string,
  state: AccountingState,
  txId: string
): Promise<void> {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;

  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'transactions', txId));

  if (tx.skuId && tx.quantity) {
    const sku = state.inventory.find((i) => i.id === tx.skuId);
    if (sku) {
      const invRef = doc(db, 'users', uid, 'inventory', sku.id);
      if (tx.type === 'sale') {
        batch.update(invRef, {
          stockRemaining: Math.min(sku.totalStockLevel, sku.stockRemaining + tx.quantity),
          updatedAt: serverTimestamp(),
        });
      } else if (tx.type === 'purchase') {
        batch.update(invRef, {
          totalStockLevel: Math.max(0, sku.totalStockLevel - tx.quantity),
          stockRemaining: Math.max(0, sku.stockRemaining - tx.quantity),
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}/transactions/${txId}`);
  }
}

export async function saveInventoryItemInFirestore(
  uid: string,
  payload: {
    id?: string;
    sku: string;
    name: string;
    category: string;
    totalStockLevel: number;
    stockRemaining?: number;
    unitCost: number;
    sellingPrice: number;
    reorderLevel: number;
  }
): Promise<void> {
  if (payload.id) {
    const path = `users/${uid}/inventory/${payload.id}`;
    const total = Math.max(0, Math.floor(payload.totalStockLevel));
    const rem = Math.min(total, Math.max(0, Math.floor(payload.stockRemaining ?? total)));
    try {
      await updateDoc(doc(db, 'users', uid, 'inventory', payload.id), {
        sku: payload.sku.trim().toUpperCase(),
        name: payload.name.trim(),
        category: payload.category.trim() || 'General Merchandise',
        totalStockLevel: total,
        stockRemaining: rem,
        unitCost: roundCurrency(Math.max(0, payload.unitCost)),
        sellingPrice: roundCurrency(Math.max(0, payload.sellingPrice)),
        reorderLevel: Math.max(0, Math.floor(payload.reorderLevel)),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  const invId = generateId('inv');
  const qty = Math.max(0, Math.floor(payload.totalStockLevel));
  const unitCost = roundCurrency(Math.max(0, payload.unitCost));
  const batch = writeBatch(db);

  batch.set(doc(db, 'users', uid, 'inventory', invId), {
    ownerId: uid,
    sku: payload.sku.trim().toUpperCase(),
    name: payload.name.trim(),
    category: payload.category.trim() || 'General Merchandise',
    totalStockLevel: qty,
    stockRemaining: qty,
    unitCost,
    sellingPrice: roundCurrency(Math.max(0, payload.sellingPrice)),
    reorderLevel: Math.max(0, Math.floor(payload.reorderLevel)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (qty > 0 && unitCost > 0) {
    const txId = generateId('tx');
    batch.set(doc(db, 'users', uid, 'transactions', txId), {
      ownerId: uid,
      date: getTodayIsoDate(),
      type: 'purchase',
      description: `Opening Stock Purchase — ${payload.name.trim()} (${qty} units)`,
      category: 'Inventory Restock',
      amount: roundCurrency(qty * unitCost),
      paymentMethod: 'Bank Transfer',
      reference: `PO-${Math.floor(1000 + Math.random() * 9000)}`,
      skuId: invId,
      quantity: qty,
      unitPrice: unitCost,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/inventory/${invId}`);
  }
}

export async function saveBudgetRulesInFirestore(
  uid: string,
  currentRules: BudgetRule[],
  newRules: BudgetRule[]
): Promise<void> {
  const totalPct = newRules.reduce((sum, r) => sum + Number(r.percentage || 0), 0);
  if (Math.abs(totalPct - 100) > 0.05) {
    throw new Error(
      `Budget allocations must total exactly 100%. Current total: ${totalPct.toFixed(1)}%.`
    );
  }

  const batch = writeBatch(db);
  const nextIds = new Set(newRules.map((r) => r.id));

  for (const oldRule of currentRules) {
    if (!nextIds.has(oldRule.id)) {
      batch.delete(doc(db, 'users', uid, 'budgetRules', oldRule.id));
    }
  }

  newRules.forEach((rule, idx) => {
    const ref = doc(db, 'users', uid, 'budgetRules', rule.id);
    const exists = currentRules.some((r) => r.id === rule.id);
    if (exists) {
      batch.update(ref, {
        name: rule.name.trim(),
        description: rule.description.trim(),
        percentage: Number(rule.percentage),
        color: rule.color,
        sortOrder: idx,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(ref, {
        ownerId: uid,
        name: rule.name.trim(),
        description: rule.description.trim(),
        percentage: Number(rule.percentage),
        color: rule.color,
        sortOrder: idx,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/budgetRules`);
  }
}

export async function runDueRecurringInFirestore(
  uid: string,
  state: AccountingState,
  asOfDate: string = getTodayIsoDate()
): Promise<void> {
  const result = processDueRecurringRules(state, asOfDate);
  if (!result.changed) return;

  const nextState = result.state;
  const oldTxIds = new Set(state.transactions.map((t) => t.id));
  const oldPendingIds = new Set(state.pendingRecurring.map((p) => p.id));

  const batch = writeBatch(db);

  for (const tx of nextState.transactions) {
    if (!oldTxIds.has(tx.id)) {
      batch.set(
        doc(db, 'users', uid, 'transactions', tx.id),
        stripUndefined({
          ownerId: uid,
          date: tx.date,
          type: tx.type,
          description: tx.description,
          category: tx.category,
          amount: tx.amount,
          paymentMethod: tx.paymentMethod,
          reference: tx.reference,
          skuId: tx.skuId,
          quantity: tx.quantity,
          unitPrice: tx.unitPrice,
          cogs: tx.cogs,
          budgetBucketId: tx.budgetBucketId,
          recurringRuleId: tx.recurringRuleId,
          notes: tx.notes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  for (const p of nextState.pendingRecurring) {
    if (!oldPendingIds.has(p.id)) {
      batch.set(
        doc(db, 'users', uid, 'pendingRecurring', p.id),
        stripUndefined({
          ownerId: uid,
          ruleId: p.ruleId,
          scheduledDate: p.scheduledDate,
          type: p.type,
          description: p.description,
          category: p.category,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          frequency: p.frequency,
          budgetBucketId: p.budgetBucketId,
          skuId: p.skuId,
          quantity: p.quantity,
          note: p.note,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  for (const nextRule of nextState.recurringRules) {
    const prevRule = state.recurringRules.find((r) => r.id === nextRule.id);
    if (
      prevRule &&
      (prevRule.nextRunDate !== nextRule.nextRunDate ||
        prevRule.lastPostedDate !== nextRule.lastPostedDate ||
        prevRule.totalPostedCount !== nextRule.totalPostedCount ||
        prevRule.active !== nextRule.active)
    ) {
      batch.update(
        doc(db, 'users', uid, 'recurringRules', nextRule.id),
        stripUndefined({
          nextRunDate: nextRule.nextRunDate,
          lastPostedDate: nextRule.lastPostedDate,
          totalPostedCount: nextRule.totalPostedCount,
          active: nextRule.active,
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/recurringRules`);
  }
}

export async function saveRecurringRuleInFirestore(
  uid: string,
  state: AccountingState,
  payload: {
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
  }
): Promise<void> {
  if (payload.id) {
    const path = `users/${uid}/recurringRules/${payload.id}`;
    try {
      await updateDoc(doc(db, 'users', uid, 'recurringRules', payload.id), {
        type: payload.type,
        description: payload.description.trim(),
        category: payload.category.trim(),
        amount: roundCurrency(payload.amount),
        paymentMethod: payload.paymentMethod,
        frequency: payload.frequency,
        nextRunDate: payload.nextRunDate || payload.startDate,
        endDate: payload.endDate ? payload.endDate : deleteField(),
        approvalMode: payload.approvalMode,
        budgetBucketId: payload.budgetBucketId ? payload.budgetBucketId : deleteField(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  const ruleId = generateId('rec');
  const newRule: RecurringRule = {
    id: ruleId,
    type: payload.type,
    description: payload.description.trim(),
    category: payload.category.trim(),
    amount: roundCurrency(payload.amount),
    paymentMethod: payload.paymentMethod,
    frequency: payload.frequency,
    startDate: payload.startDate,
    nextRunDate: payload.startDate,
    endDate: payload.endDate || undefined,
    approvalMode: payload.approvalMode,
    active: true,
    budgetBucketId: payload.budgetBucketId || undefined,
    totalPostedCount: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(
      doc(db, 'users', uid, 'recurringRules', ruleId),
      stripUndefined({
        ownerId: uid,
        type: newRule.type,
        description: newRule.description,
        category: newRule.category,
        amount: newRule.amount,
        paymentMethod: newRule.paymentMethod,
        frequency: newRule.frequency,
        startDate: newRule.startDate,
        nextRunDate: newRule.nextRunDate,
        endDate: newRule.endDate,
        approvalMode: newRule.approvalMode,
        active: true,
        budgetBucketId: newRule.budgetBucketId,
        totalPostedCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `users/${uid}/recurringRules/${ruleId}`
    );
  }

  await runDueRecurringInFirestore(uid, {
    ...state,
    recurringRules: [newRule, ...state.recurringRules],
  });
}

export async function toggleRecurringActiveInFirestore(
  uid: string,
  rule: RecurringRule
): Promise<void> {
  const path = `users/${uid}/recurringRules/${rule.id}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'recurringRules', rule.id), {
      active: !rule.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRecurringRuleInFirestore(
  uid: string,
  state: AccountingState,
  ruleId: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'recurringRules', ruleId));
  for (const p of state.pendingRecurring) {
    if (p.ruleId === ruleId) {
      batch.delete(doc(db, 'users', uid, 'pendingRecurring', p.id));
    }
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users/${uid}/recurringRules/${ruleId}`
    );
  }
}

export async function triggerRecurringRuleNowInFirestore(
  uid: string,
  state: AccountingState,
  ruleId: string
): Promise<void> {
  const rule = state.recurringRules.find((r) => r.id === ruleId);
  if (!rule) throw new Error('Recurring schedule not found.');

  const scheduledDate = rule.nextRunDate;
  const nextDate = advanceDate(scheduledDate, rule.frequency);

  if (rule.approvalMode === 'auto_post') {
    await createTransactionInFirestore(uid, state, {
      type: rule.type,
      date: scheduledDate,
      description: rule.description,
      category: rule.category,
      amount: rule.amount,
      paymentMethod: rule.paymentMethod,
      reference: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
      skuId: rule.skuId,
      quantity: rule.quantity,
      budgetBucketId: rule.budgetBucketId,
      recurringRuleId: rule.id,
      notes: 'Posted from recurring transaction schedule',
    });

    await updateDoc(doc(db, 'users', uid, 'recurringRules', rule.id), {
      lastPostedDate: scheduledDate,
      totalPostedCount: (rule.totalPostedCount || 0) + 1,
      nextRunDate: nextDate,
      updatedAt: serverTimestamp(),
    });
  } else {
    const pendId = generateId('pend');
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'users', uid, 'pendingRecurring', pendId),
      stripUndefined({
        ownerId: uid,
        ruleId: rule.id,
        scheduledDate,
        type: rule.type,
        description: rule.description,
        category: rule.category,
        amount: rule.amount,
        paymentMethod: rule.paymentMethod,
        frequency: rule.frequency,
        budgetBucketId: rule.budgetBucketId,
        skuId: rule.skuId,
        quantity: rule.quantity,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    batch.update(doc(db, 'users', uid, 'recurringRules', rule.id), {
      nextRunDate: nextDate,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `users/${uid}/pendingRecurring/${pendId}`
      );
    }
  }
}

export async function approvePendingInFirestore(
  uid: string,
  state: AccountingState,
  pendingId: string,
  overrides?: { amount?: number; scheduledDate?: string; description?: string }
): Promise<void> {
  const pending = state.pendingRecurring.find((p) => p.id === pendingId);
  if (!pending) throw new Error('Pending entry not found.');

  const effectiveAmount =
    overrides?.amount && overrides.amount > 0
      ? roundCurrency(overrides.amount)
      : pending.amount;
  const effectiveDate = overrides?.scheduledDate || pending.scheduledDate;
  const effectiveDesc = overrides?.description?.trim() || pending.description;

  await createTransactionInFirestore(uid, state, {
    type: pending.type,
    date: effectiveDate,
    description: effectiveDesc,
    category: pending.category,
    amount: effectiveAmount,
    paymentMethod: pending.paymentMethod,
    reference: `REC-${Math.floor(1000 + Math.random() * 9000)}`,
    skuId: pending.skuId,
    quantity: pending.quantity,
    budgetBucketId: pending.budgetBucketId,
    recurringRuleId: pending.ruleId,
    notes: 'Approved from recurring schedule review queue',
  });

  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'pendingRecurring', pendingId));

  const rule = state.recurringRules.find((r) => r.id === pending.ruleId);
  if (rule) {
    batch.update(doc(db, 'users', uid, 'recurringRules', rule.id), {
      lastPostedDate: effectiveDate,
      totalPostedCount: (rule.totalPostedCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `users/${uid}/pendingRecurring/${pendingId}`
    );
  }
}

export async function dismissPendingInFirestore(
  uid: string,
  pendingId: string
): Promise<void> {
  const path = `users/${uid}/pendingRecurring/${pendingId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'pendingRecurring', pendingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function approveAllPendingInFirestore(
  uid: string,
  state: AccountingState
): Promise<void> {
  for (const pending of state.pendingRecurring) {
    await approvePendingInFirestore(uid, state, pending.id);
  }
}

async function clearUserSubcollections(uid: string): Promise<void> {
  const subNames = [
    'pendingRecurring',
    'recurringRules',
    'transactions',
    'inventory',
    'budgetRules',
  ];
  for (const sub of subNames) {
    const snap = await getDocs(
      query(collection(db, 'users', uid, sub), where('ownerId', '==', uid))
    );
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

export async function resetDemoInFirestore(user: User): Promise<void> {
  const uid = user.uid;
  await clearUserSubcollections(uid);

  const seed = createInitialAccountingState();
  const processed = processDueRecurringRules(seed);
  const seededState = processed.state;

  const batch1 = writeBatch(db);
  seededState.budgetRules.forEach((rule, idx) => {
    batch1.set(doc(db, 'users', uid, 'budgetRules', rule.id), {
      ownerId: uid,
      name: rule.name,
      description: rule.description,
      percentage: rule.percentage,
      color: rule.color,
      sortOrder: idx,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  seededState.inventory.forEach((item) => {
    batch1.set(doc(db, 'users', uid, 'inventory', item.id), {
      ownerId: uid,
      sku: item.sku,
      name: item.name,
      category: item.category,
      totalStockLevel: item.totalStockLevel,
      stockRemaining: item.stockRemaining,
      unitCost: item.unitCost,
      sellingPrice: item.sellingPrice,
      reorderLevel: item.reorderLevel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  seededState.transactions.forEach((tx) => {
    batch1.set(
      doc(db, 'users', uid, 'transactions', tx.id),
      stripUndefined({
        ownerId: uid,
        date: tx.date,
        type: tx.type,
        description: tx.description,
        category: tx.category,
        amount: tx.amount,
        paymentMethod: tx.paymentMethod,
        reference: tx.reference,
        skuId: tx.skuId,
        quantity: tx.quantity,
        unitPrice: tx.unitPrice,
        cogs: tx.cogs,
        budgetBucketId: tx.budgetBucketId,
        recurringRuleId: tx.recurringRuleId,
        notes: tx.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  seededState.recurringRules.forEach((rule) => {
    batch1.set(
      doc(db, 'users', uid, 'recurringRules', rule.id),
      stripUndefined({
        ownerId: uid,
        type: rule.type,
        description: rule.description,
        category: rule.category,
        amount: rule.amount,
        paymentMethod: rule.paymentMethod,
        frequency: rule.frequency,
        startDate: rule.startDate,
        nextRunDate: rule.nextRunDate,
        endDate: rule.endDate,
        approvalMode: rule.approvalMode,
        active: rule.active,
        budgetBucketId: rule.budgetBucketId,
        skuId: rule.skuId,
        quantity: rule.quantity,
        lastPostedDate: rule.lastPostedDate,
        totalPostedCount: rule.totalPostedCount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  await batch1.commit();

  if (seededState.pendingRecurring.length > 0) {
    const batch2 = writeBatch(db);
    seededState.pendingRecurring.forEach((p) => {
      batch2.set(
        doc(db, 'users', uid, 'pendingRecurring', p.id),
        stripUndefined({
          ownerId: uid,
          ruleId: p.ruleId,
          scheduledDate: p.scheduledDate,
          type: p.type,
          description: p.description,
          category: p.category,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          frequency: p.frequency,
          budgetBucketId: p.budgetBucketId,
          skuId: p.skuId,
          quantity: p.quantity,
          note: p.note,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    });
    await batch2.commit();
  }
}

export async function clearLedgerInFirestore(uid: string): Promise<void> {
  await clearUserSubcollections(uid);

  const batch = writeBatch(db);
  DEFAULT_BUDGET_RULES.forEach((rule, idx) => {
    batch.set(doc(db, 'users', uid, 'budgetRules', rule.id), {
      ownerId: uid,
      name: rule.name,
      description: rule.description,
      percentage: rule.percentage,
      color: rule.color,
      sortOrder: idx,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
