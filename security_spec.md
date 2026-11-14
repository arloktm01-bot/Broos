# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. Every document in `/users/{userId}` and its subcollections (`private`, `inventory`, `transactions`, `budgetRules`, `recurringRules`, `pendingRecurring`) is strictly owned by `userId` (`data.ownerId == request.auth.uid && userId == request.auth.uid`).
2. All write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. Every subcollection create/update/delete validates parent workspace existence and ownership via `get(/databases/$(database)/documents/users/$(userId)).data.ownerId == request.auth.uid` (and `exists(...)`).
4. List queries never invoke `get()` or `exists()`; instead they strictly validate `userId == request.auth.uid && resource.data.ownerId == request.auth.uid`.
5. All `createdAt` and `updatedAt` timestamps must equal `request.time`; `ownerId` and `createdAt` are immutable on update.
6. Every document ID path variable passes `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, length 1..128).
7. Every string has bounded `.size()` checks matching `firebase-blueprint.json`; every numeric amount is strictly validated (`amount > 0`, `percentage >= 0 && percentage <= 100`, `stockRemaining >= 0`).
8. No shadow/ghost fields allowed on create (`keys().hasAll(...) && keys().hasOnly(...)`) or update (`affectedKeys().hasOnly(...)`).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `GET /users/user1/transactions/tx1` with `auth: null`.
2. **Unverified Email Write**: `CREATE /users/user1` with `auth: { uid: 'user1', token: { email_verified: false } }`.
3. **Cross-Tenant Read/List**: `LIST /users/user1/transactions` with `auth: { uid: 'attacker', token: { email_verified: true } }`.
4. **Identity Spoofing on Create**: `CREATE /users/user1/transactions/tx1` with `ownerId: 'user2'` while signed in as `user1`.
5. **Shadow / Ghost Field Injection**: `CREATE /users/user1/transactions/tx1` including extra field `isAdmin: true`.
6. **Privilege Escalation Update**: `UPDATE /users/user1` attempting to mutate `ownerId` to `'attacker'`.
7. **Timestamp Spoofing**: `CREATE /users/user1/transactions/tx1` with client-provided `createdAt` not equal to `request.time`.
8. **Immutable Field Mutation**: `UPDATE /users/user1/transactions/tx1` attempting to modify `createdAt`.
9. **Path ID Poisoning**: `CREATE /users/user1/inventory/bad$id` with invalid characters or 500-char ID.
10. **Negative Amount / Value Poisoning**: `CREATE /users/user1/transactions/tx1` with `amount: -500` or `type: 'invalid_type'`.
11. **PII Leak Attempt**: `GET /users/user1/private/profile` signed in as `user2` (`email_verified: true`).
12. **Orphaned Subcollection Write**: `CREATE /users/user1/pendingRecurring/pend1` referencing a `ruleId` or parent workspace that does not exist under `user1`.
