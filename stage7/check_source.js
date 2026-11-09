#!/usr/bin/env node
/**
 * Non-mutating regression inventory for Eleeveon Schools Stage 7.
 * Run from backend repository root: node stage7/check_source.js .
 * This checks source-code presence only; it does NOT prove runtime correctness.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || process.cwd());
function read(relativePath) {
  const file = path.join(root, relativePath);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    console.error(`Unable to read ${relativePath}: ${error.message}`);
    process.exitCode = 1;
    return '';
  }
}

const checks = [
  ['Quote is scoped to account', 'src/billing/subscription-change.service.ts', 'findFirst({'],
  ['Checkout mode defaults off', 'src/billing/billing.service.ts', 'STUDENT_PRICED_CHECKOUT_MODE || "off"'],
  ['Payment provider verification', 'src/billing/billing.service.ts', 'verifyStudentPaymentSettlement'],
  ['Subscription apply transaction', 'src/billing/subscription-change.service.ts', 'this.prisma.$transaction'],
  ['Subscription account lock', 'src/billing/subscription-change.service.ts', 'pg_advisory_xact_lock'],
  ['Subscription period deduplication', 'src/billing/subscription-change.service.ts', 'changeOrderId: order.id'],
  ['Payment recovery endpoint', 'src/billing/billing.controller.ts', 'subscription-quotes/:id/recover'],
  ['Expiry is opt-in', 'src/billing/subscription-jobs.service.ts', 'TRIAL_EXPIRATION_JOB_MODE'],
  ['Quota observe default', 'src/sync/sync.service.ts', 'STUDENT_QUOTA_ENFORCEMENT || "observe"'],
  ['Confirmation of sequence authority', 'src/admissions/admission-number.service.ts', 'nextSequence'],
];

let found = 0;
for (const [label, relativePath, phrase] of checks) {
  const ok = read(relativePath).includes(phrase);
  if (ok) found++;
  console.log(`${ok ? 'PRESENT' : 'MISSING'} | ${label} | ${relativePath}`);
}
console.log(`\nPresence checks: ${found}/${checks.length}`);
if (found !== checks.length) process.exitCode = 1;
else console.log('NOTE: Presence is not runtime integration evidence. Paystack, PostgreSQL and concurrent requests MUST be tested.');
