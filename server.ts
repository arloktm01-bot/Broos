import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  AccountingState,
  BudgetRule,
  InventoryItem,
  RecurrenceFrequency,
  RecurringApprovalMode,
  RecurringRule,
  Transaction,
  TransactionType,
} from './src/types/accounting.ts';
import {
  createDefaultRecurringRules,
  createInitialAccountingState,
} from './src/data/seedData.ts';
import { computeAccountingSummary, formatCurrency, roundCurrency } from './src/utils/calculations.ts';
import {
  advanceDate,
  getTodayIsoDate,
  postRecurringOccurrenceToState,
  processDueRecurringRules,
} from './src/utils/recurrence.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'accounting-store.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

type UserRole = 'admin' | 'viewer';

interface AuthAccount {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
}

const ACCOUNTS: AuthAccount[] = [
  {
    username: 'admin',
    password: 'arlo1234',
    displayName: 'Admin',
    role: 'admin',
  },
  {
    username: 'niraj',
    password: 'niraj1234',
    displayName: 'Niraj',
    role: 'viewer',
  },
];

interface SessionUser {
  username: string;
  displayName: string;
  role: UserRole;
}

function signSessionToken(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...user,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    ) as SessionUser & { exp: number };
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    if (parsed.role !== 'admin' && parsed.role !== 'viewer') return null;
    return {
      username: parsed.username,
      displayName: parsed.displayName,
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

function ensureStore(): AccountingState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createInitialAccountingState();
    const processed = processDueRecurringRules(initial);
    fs.writeFileSync(DATA_FILE, JSON.stringify(processed.state, null, 2), 'utf-8');
    return processed.state;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AccountingState;
    if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.inventory)) {
      throw new Error('Corrupted store structure');
    }
    let migrated = false;
    if (!Array.isArray(parsed.recurringRules)) {
      parsed.recurringRules = createDefaultRecurringRules();
      migrated = true;
    }
    if (!Array.isArray(parsed.pendingRecurring)) {
      parsed.pendingRecurring = [];
      migrated = true;
    }
    const processed = processDueRecurringRules(parsed);
    if (migrated || processed.changed) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(processed.state, null, 2), 'utf-8');
    }
    return processed.state;
  } catch {
    const initial = createInitialAccountingState();
    const processed = processDueRecurringRules(initial);
    fs.writeFileSync(DATA_FILE, JSON.stringify(processed.state, null, 2), 'utf-8');
    return processed.state;
  }
}

function saveStore(state: AccountingState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  let state = ensureStore();

  const runDueSchedules = (asOfDate?: string) => {
    const result = processDueRecurringRules(state, asOfDate);
    if (result.changed) {
      state = result.state;
      saveStore(state);
    }
    return result;
  };

  setInterval(() => {
    runDueSchedules();
  }, 60_000);

  const buildPayload = (extra: Record<string, unknown> = {}) => ({
    state,
    summary: computeAccountingSummary(state),
    ...extra,
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = (req.body || {}) as {
      username?: string;
      password?: string;
    };
    const normalizedUser = (username || '').trim().toLowerCase();
    const account = ACCOUNTS.find(
      (a) => a.username === normalizedUser && a.password === (password || '')
    );
    if (!account) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const sessionUser: SessionUser = {
      username: account.username,
      displayName: account.displayName,
      role: account.role,
    };
    const token = signSessionToken(sessionUser);
    return res.json({ token, user: sessionUser });
  });

  app.get('/api/auth/session', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const sessionUser = verifySessionToken(token);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    return res.json({ user: sessionUser });
  });

  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth/')) {
      return next();
    }
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const sessionUser = verifySessionToken(token);
    if (!sessionUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.method !== 'GET' && sessionUser.role !== 'admin') {
      return res.status(403).json({
        error: 'Read-only account: only admin can edit or add transactions and records.',
      });
    }
    return next();
  });

  app.get('/api/state', (_req, res) => {
    const run = runDueSchedules();
    res.json(
      buildPayload({
        autoPostedCount: run.autoPostedCount,
        queuedCount: run.queuedCount,
      })
    );
  });

  app.post('/api/transactions', (req, res) => {
    const body = req.body as Partial<Transaction> & {
      type?: TransactionType;
    };

    if (!body.type || !body.description || typeof body.amount !== 'number' || body.amount <= 0) {
      return res.status(400).json({
        error: 'Transaction type, description, and a positive amount are required.',
      });
    }

    const now = new Date().toISOString();
    const txDate = body.date || now.slice(0, 10);
    const quantity = body.quantity && body.quantity > 0 ? Math.floor(body.quantity) : undefined;
    let amount = roundCurrency(body.amount);
    let cogs = typeof body.cogs === 'number' ? roundCurrency(body.cogs) : undefined;
    let unitPrice = typeof body.unitPrice === 'number' ? roundCurrency(body.unitPrice) : undefined;

    if (body.type === 'petty_cash_expense') {
      const currentSummary = computeAccountingSummary(state);
      if (amount > currentSummary.pettyCashBalance) {
        return res.status(400).json({
          error: `Insufficient petty cash balance (${formatCurrency(currentSummary.pettyCashBalance, state.currency)} available). Replenish petty cash first.`,
        });
      }
    }

    if (body.skuId) {
      const skuIndex = state.inventory.findIndex((i) => i.id === body.skuId);
      if (skuIndex === -1) {
        return res.status(404).json({ error: 'Selected inventory SKU not found.' });
      }
      const sku = state.inventory[skuIndex];

      if (body.type === 'sale') {
        const qty = quantity || 1;
        if (qty > sku.stockRemaining) {
          return res.status(400).json({
            error: `Only ${sku.stockRemaining} units of ${sku.name} remaining in stock.`,
          });
        }
        const effectivePrice = unitPrice ?? sku.sellingPrice;
        unitPrice = effectivePrice;
        amount = roundCurrency(qty * effectivePrice);
        cogs = roundCurrency(qty * sku.unitCost);
        state.inventory[skuIndex] = {
          ...sku,
          stockRemaining: sku.stockRemaining - qty,
          updatedAt: now,
        };
      } else if (body.type === 'purchase') {
        const qty = quantity || 1;
        const effectiveCost = unitPrice ?? sku.unitCost;
        unitPrice = effectiveCost;
        amount = roundCurrency(qty * effectiveCost);
        state.inventory[skuIndex] = {
          ...sku,
          totalStockLevel: sku.totalStockLevel + qty,
          stockRemaining: sku.stockRemaining + qty,
          unitCost: effectiveCost,
          updatedAt: now,
        };
      }
    }

    const prefixMap: Record<TransactionType, string> = {
      sale: 'INV',
      purchase: 'PO',
      petty_cash_expense: 'PCV',
      operating_expense: 'EXP',
      petty_cash_replenish: 'PCR',
    };

    const newTx: Transaction = {
      id: generateId('tx'),
      date: txDate,
      type: body.type,
      description: body.description.trim(),
      category: (body.category || 'General').trim(),
      amount,
      paymentMethod:
        body.paymentMethod ||
        (body.type === 'petty_cash_expense' ? 'Petty Cash' : 'Bank Transfer'),
      reference:
        body.reference?.trim() ||
        `${prefixMap[body.type]}-${Math.floor(1000 + Math.random() * 9000)}`,
      skuId: body.skuId,
      quantity,
      unitPrice,
      cogs,
      budgetBucketId: body.budgetBucketId || undefined,
      notes: body.notes?.trim() || undefined,
      createdAt: now,
    };

    state.transactions = [newTx, ...state.transactions];
    saveStore(state);
    return res.status(201).json(buildPayload({ transaction: newTx }));
  });

  app.delete('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    const txIndex = state.transactions.findIndex((t) => t.id === id);
    if (txIndex === -1) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const tx = state.transactions[txIndex];
    const now = new Date().toISOString();

    if (tx.skuId && tx.quantity) {
      const skuIndex = state.inventory.findIndex((i) => i.id === tx.skuId);
      if (skuIndex !== -1) {
        const sku = state.inventory[skuIndex];
        if (tx.type === 'sale') {
          state.inventory[skuIndex] = {
            ...sku,
            stockRemaining: Math.min(sku.totalStockLevel, sku.stockRemaining + tx.quantity),
            updatedAt: now,
          };
        } else if (tx.type === 'purchase') {
          state.inventory[skuIndex] = {
            ...sku,
            totalStockLevel: Math.max(0, sku.totalStockLevel - tx.quantity),
            stockRemaining: Math.max(0, sku.stockRemaining - tx.quantity),
            updatedAt: now,
          };
        }
      }
    }

    state.transactions.splice(txIndex, 1);
    saveStore(state);
    return res.json(buildPayload());
  });

  app.post('/api/inventory', (req, res) => {
    const body = req.body as Partial<InventoryItem>;
    if (!body.name || !body.sku) {
      return res.status(400).json({ error: 'SKU code and product name are required.' });
    }

    const now = new Date().toISOString();
    const initialQty = Math.max(0, Math.floor(Number(body.totalStockLevel) || 0));
    const newItem: InventoryItem = {
      id: generateId('inv'),
      sku: body.sku.trim().toUpperCase(),
      name: body.name.trim(),
      category: (body.category || 'General Merchandise').trim(),
      totalStockLevel: initialQty,
      stockRemaining: initialQty,
      unitCost: roundCurrency(Math.max(0, Number(body.unitCost) || 0)),
      sellingPrice: roundCurrency(Math.max(0, Number(body.sellingPrice) || 0)),
      reorderLevel: Math.max(0, Math.floor(Number(body.reorderLevel) || 10)),
      updatedAt: now,
    };

    state.inventory = [...state.inventory, newItem];

    if (initialQty > 0 && newItem.unitCost > 0) {
      const purchaseTx: Transaction = {
        id: generateId('tx'),
        date: now.slice(0, 10),
        type: 'purchase',
        description: `Opening Stock Purchase — ${newItem.name} (${initialQty} units)`,
        category: 'Inventory Restock',
        amount: roundCurrency(initialQty * newItem.unitCost),
        paymentMethod: 'Bank Transfer',
        reference: `PO-${Math.floor(1000 + Math.random() * 9000)}`,
        skuId: newItem.id,
        quantity: initialQty,
        unitPrice: newItem.unitCost,
        createdAt: now,
      };
      state.transactions = [purchaseTx, ...state.transactions];
    }

    saveStore(state);
    return res.status(201).json(buildPayload({ item: newItem }));
  });

  app.patch('/api/inventory/:id', (req, res) => {
    const { id } = req.params;
    const idx = state.inventory.findIndex((i) => i.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const existing = state.inventory[idx];
    const body = req.body as Partial<InventoryItem>;
    const updated: InventoryItem = {
      ...existing,
      name: body.name ? body.name.trim() : existing.name,
      sku: body.sku ? body.sku.trim().toUpperCase() : existing.sku,
      category: body.category ? body.category.trim() : existing.category,
      unitCost:
        typeof body.unitCost === 'number' && body.unitCost >= 0
          ? roundCurrency(body.unitCost)
          : existing.unitCost,
      sellingPrice:
        typeof body.sellingPrice === 'number' && body.sellingPrice >= 0
          ? roundCurrency(body.sellingPrice)
          : existing.sellingPrice,
      reorderLevel:
        typeof body.reorderLevel === 'number' && body.reorderLevel >= 0
          ? Math.floor(body.reorderLevel)
          : existing.reorderLevel,
      stockRemaining:
        typeof body.stockRemaining === 'number' && body.stockRemaining >= 0
          ? Math.floor(body.stockRemaining)
          : existing.stockRemaining,
      totalStockLevel:
        typeof body.totalStockLevel === 'number' && body.totalStockLevel >= 0
          ? Math.floor(body.totalStockLevel)
          : existing.totalStockLevel,
      updatedAt: new Date().toISOString(),
    };

    if (updated.stockRemaining > updated.totalStockLevel) {
      updated.totalStockLevel = updated.stockRemaining;
    }

    state.inventory[idx] = updated;
    saveStore(state);
    return res.json(buildPayload({ item: updated }));
  });

  app.delete('/api/inventory/:id', (req, res) => {
    const { id } = req.params;
    const exists = state.inventory.some((i) => i.id === id);
    if (!exists) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }
    state.inventory = state.inventory.filter((i) => i.id !== id);
    saveStore(state);
    return res.json(buildPayload());
  });

  app.put('/api/budget-rules', (req, res) => {
    const { budgetRules } = req.body as { budgetRules?: BudgetRule[] };
    if (!Array.isArray(budgetRules) || budgetRules.length === 0) {
      return res.status(400).json({ error: 'At least one budget allocation rule is required.' });
    }

    const totalPct = budgetRules.reduce((sum, r) => sum + Number(r.percentage || 0), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      return res.status(400).json({
        error: `Budget allocations must total exactly 100%. Current total: ${totalPct.toFixed(1)}%.`,
      });
    }

    state.budgetRules = budgetRules.map((r) => ({
      id: r.id || generateId('bucket'),
      name: r.name.trim(),
      description: r.description?.trim() || '',
      percentage: Number(r.percentage),
      color: r.color || '#0F766E',
    }));

    saveStore(state);
    return res.json(buildPayload());
  });

  app.patch('/api/settings', (req, res) => {
    const { businessName, pettyCashLimit } = req.body as {
      businessName?: string;
      pettyCashLimit?: number;
    };
    if (businessName && businessName.trim()) {
      state.businessName = businessName.trim();
    }
    if (typeof pettyCashLimit === 'number' && pettyCashLimit > 0) {
      state.pettyCashLimit = roundCurrency(pettyCashLimit);
    }
    saveStore(state);
    return res.json(buildPayload());
  });

  app.post('/api/recurring', (req, res) => {
    const body = req.body as Partial<RecurringRule>;
    if (
      !body.type ||
      !body.description?.trim() ||
      typeof body.amount !== 'number' ||
      body.amount <= 0 ||
      !body.frequency
    ) {
      return res.status(400).json({
        error: 'Type, description, frequency, and a positive amount are required.',
      });
    }

    const validFrequencies: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validFrequencies.includes(body.frequency)) {
      return res.status(400).json({ error: 'Invalid recurrence frequency.' });
    }

    const validModes: RecurringApprovalMode[] = ['auto_post', 'manual_review'];
    const approvalMode: RecurringApprovalMode =
      body.approvalMode && validModes.includes(body.approvalMode)
        ? body.approvalMode
        : 'manual_review';

    const startDate = body.startDate || getTodayIsoDate();
    const newRule: RecurringRule = {
      id: generateId('rec'),
      type: body.type,
      description: body.description.trim(),
      category: (body.category || 'General').trim(),
      amount: roundCurrency(body.amount),
      paymentMethod:
        body.paymentMethod ||
        (body.type === 'petty_cash_expense' ? 'Petty Cash' : 'Bank Transfer'),
      frequency: body.frequency,
      startDate,
      nextRunDate: startDate,
      endDate: body.endDate || undefined,
      approvalMode,
      active: body.active !== undefined ? Boolean(body.active) : true,
      budgetBucketId: body.budgetBucketId || undefined,
      skuId: body.skuId || undefined,
      quantity: body.quantity && body.quantity > 0 ? Math.floor(body.quantity) : undefined,
      totalPostedCount: 0,
      createdAt: new Date().toISOString(),
    };

    state.recurringRules = [newRule, ...(state.recurringRules || [])];
    const run = runDueSchedules();
    saveStore(state);
    return res.status(201).json(
      buildPayload({
        rule: newRule,
        autoPostedCount: run.autoPostedCount,
        queuedCount: run.queuedCount,
      })
    );
  });

  app.patch('/api/recurring/:id', (req, res) => {
    const { id } = req.params;
    const idx = (state.recurringRules || []).findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Recurring schedule not found.' });
    }

    const existing = state.recurringRules[idx];
    const body = req.body as Partial<RecurringRule>;

    const updated: RecurringRule = {
      ...existing,
      type: body.type ?? existing.type,
      description: body.description ? body.description.trim() : existing.description,
      category: body.category ? body.category.trim() : existing.category,
      amount:
        typeof body.amount === 'number' && body.amount > 0
          ? roundCurrency(body.amount)
          : existing.amount,
      paymentMethod: body.paymentMethod ?? existing.paymentMethod,
      frequency: body.frequency ?? existing.frequency,
      nextRunDate: body.nextRunDate ?? existing.nextRunDate,
      endDate: body.endDate === '' ? undefined : (body.endDate ?? existing.endDate),
      approvalMode: body.approvalMode ?? existing.approvalMode,
      active: typeof body.active === 'boolean' ? body.active : existing.active,
      budgetBucketId:
        body.budgetBucketId === '' ? undefined : (body.budgetBucketId ?? existing.budgetBucketId),
    };

    state.recurringRules[idx] = updated;
    const run = runDueSchedules();
    saveStore(state);
    return res.json(
      buildPayload({
        rule: updated,
        autoPostedCount: run.autoPostedCount,
        queuedCount: run.queuedCount,
      })
    );
  });

  app.delete('/api/recurring/:id', (req, res) => {
    const { id } = req.params;
    const exists = (state.recurringRules || []).some((r) => r.id === id);
    if (!exists) {
      return res.status(404).json({ error: 'Recurring schedule not found.' });
    }
    state.recurringRules = state.recurringRules.filter((r) => r.id !== id);
    state.pendingRecurring = (state.pendingRecurring || []).filter(
      (p) => p.ruleId !== id
    );
    saveStore(state);
    return res.json(buildPayload());
  });

  app.post('/api/recurring/run-due', (req, res) => {
    const { asOfDate } = (req.body || {}) as { asOfDate?: string };
    const run = runDueSchedules(asOfDate || getTodayIsoDate());
    return res.json(
      buildPayload({
        autoPostedCount: run.autoPostedCount,
        queuedCount: run.queuedCount,
      })
    );
  });

  app.post('/api/recurring/:id/trigger', (req, res) => {
    const { id } = req.params;
    const idx = (state.recurringRules || []).findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Recurring schedule not found.' });
    }
    const rule = state.recurringRules[idx];
    const scheduledDate = rule.nextRunDate;

    if (rule.approvalMode === 'auto_post') {
      const posted = postRecurringOccurrenceToState(state, {
        ruleId: rule.id,
        scheduledDate,
        type: rule.type,
        description: rule.description,
        category: rule.category,
        amount: rule.amount,
        paymentMethod: rule.paymentMethod,
        budgetBucketId: rule.budgetBucketId,
        skuId: rule.skuId,
        quantity: rule.quantity,
      });
      if (posted.error || !posted.posted) {
        return res.status(400).json({ error: posted.error || 'Could not post occurrence.' });
      }
      state = posted.state;
      state.recurringRules[idx] = {
        ...rule,
        lastPostedDate: scheduledDate,
        totalPostedCount: (rule.totalPostedCount || 0) + 1,
        nextRunDate: advanceDate(scheduledDate, rule.frequency),
      };
    } else {
      const pendingEntry = {
        id: generateId('pend'),
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
        createdAt: new Date().toISOString(),
      };
      state.pendingRecurring = [pendingEntry, ...(state.pendingRecurring || [])];
      state.recurringRules[idx] = {
        ...rule,
        nextRunDate: advanceDate(scheduledDate, rule.frequency),
      };
    }

    saveStore(state);
    return res.json(buildPayload());
  });

  app.post('/api/recurring/pending/:pendingId/approve', (req, res) => {
    const { pendingId } = req.params;
    const pendingIdx = (state.pendingRecurring || []).findIndex(
      (p) => p.id === pendingId
    );
    if (pendingIdx === -1) {
      return res.status(404).json({ error: 'Pending recurring entry not found.' });
    }

    const pending = state.pendingRecurring[pendingIdx];
    const body = (req.body || {}) as {
      amount?: number;
      scheduledDate?: string;
      description?: string;
    };

    const effectiveAmount =
      typeof body.amount === 'number' && body.amount > 0
        ? roundCurrency(body.amount)
        : pending.amount;
    const effectiveDate = body.scheduledDate || pending.scheduledDate;
    const effectiveDesc = body.description?.trim() || pending.description;

    const result = postRecurringOccurrenceToState(state, {
      ruleId: pending.ruleId,
      scheduledDate: effectiveDate,
      type: pending.type,
      description: effectiveDesc,
      category: pending.category,
      amount: effectiveAmount,
      paymentMethod: pending.paymentMethod,
      budgetBucketId: pending.budgetBucketId,
      skuId: pending.skuId,
      quantity: pending.quantity,
    });

    if (result.error || !result.posted) {
      return res.status(400).json({ error: result.error || 'Approval failed.' });
    }

    state = result.state;
    state.pendingRecurring = state.pendingRecurring.filter((p) => p.id !== pendingId);

    const ruleIdx = state.recurringRules.findIndex((r) => r.id === pending.ruleId);
    if (ruleIdx !== -1) {
      const r = state.recurringRules[ruleIdx];
      state.recurringRules[ruleIdx] = {
        ...r,
        lastPostedDate: effectiveDate,
        totalPostedCount: (r.totalPostedCount || 0) + 1,
      };
    }

    saveStore(state);
    return res.json(buildPayload({ transaction: result.posted }));
  });

  app.post('/api/recurring/pending/:pendingId/dismiss', (req, res) => {
    const { pendingId } = req.params;
    const exists = (state.pendingRecurring || []).some((p) => p.id === pendingId);
    if (!exists) {
      return res.status(404).json({ error: 'Pending recurring entry not found.' });
    }
    state.pendingRecurring = state.pendingRecurring.filter((p) => p.id !== pendingId);
    saveStore(state);
    return res.json(buildPayload());
  });

  app.post('/api/recurring/pending/approve-all', (_req, res) => {
    const queue = [...(state.pendingRecurring || [])];
    const failedIds: string[] = [];

    for (const pending of queue) {
      const result = postRecurringOccurrenceToState(state, {
        ruleId: pending.ruleId,
        scheduledDate: pending.scheduledDate,
        type: pending.type,
        description: pending.description,
        category: pending.category,
        amount: pending.amount,
        paymentMethod: pending.paymentMethod,
        budgetBucketId: pending.budgetBucketId,
        skuId: pending.skuId,
        quantity: pending.quantity,
      });

      if (result.posted) {
        state = result.state;
        const ruleIdx = state.recurringRules.findIndex((r) => r.id === pending.ruleId);
        if (ruleIdx !== -1) {
          const r = state.recurringRules[ruleIdx];
          state.recurringRules[ruleIdx] = {
            ...r,
            lastPostedDate: pending.scheduledDate,
            totalPostedCount: (r.totalPostedCount || 0) + 1,
          };
        }
      } else {
        failedIds.push(pending.id);
      }
    }

    state.pendingRecurring = state.pendingRecurring.filter((p) =>
      failedIds.includes(p.id)
    );
    saveStore(state);
    return res.json(buildPayload({ remainingCount: failedIds.length }));
  });

  app.post('/api/reset-demo', (_req, res) => {
    const initial = createInitialAccountingState();
    const processed = processDueRecurringRules(initial);
    state = processed.state;
    saveStore(state);
    return res.json(buildPayload());
  });

  app.post('/api/clear-ledger', (_req, res) => {
    state = {
      ...state,
      transactions: [],
      inventory: [],
      recurringRules: [],
      pendingRecurring: [],
    };
    saveStore(state);
    return res.json(buildPayload());
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
class ErrorOverlay extends HTMLElement {}
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`);
    });
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LedgerCraft server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
