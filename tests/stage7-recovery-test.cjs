/* Self-contained behavioral unit tests for the Stage 7 recovery services.
 * Run from backend root: node stage7-recovery-test.cjs
 * Requires project's TypeScript dependency, but NO database or Paystack access.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, dependencies) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports,process){${js}\n})`, {
    console, Date, Error, Math, Promise, String, Number, Object, Array, Set, Map, Boolean,
  }, { filename: file })((name) => {
    if (name === '@nestjs/common') return { Injectable: () => (target) => target, Logger: class { warn(){} error(){} log(){} }, NotFoundException: Error };
    if (dependencies[name]) return dependencies[name];
    throw new Error(`Unmocked import: ${name}`);
  }, m, m.exports, { env: {} });
  return m.exports;
}
(async () => {
  const { EntitlementRepairService } = load('src/billing/entitlement-repair.service.ts', {});
  const appliedAt = new Date('2026-11-01T12:00:00Z');
  const order = { id: 'order-1', accountId: 'school-A', toPlanId: 'plan-A', appliedAt,
    newPeriodStart: new Date('2026-11-01T00:00:00Z'), newPeriodEnd: new Date('2027-02-01T00:00:00Z') };
  const subscription = { id: 'sub-A', planId: 'plan-A', currentPeriodStart: order.newPeriodStart, currentPeriodEnd: order.newPeriodEnd };
  const entitlement = { subscriptionId: 'sub-A', planId: 'plan-A', rebuiltAt: new Date('2026-10-31T00:00:00Z') };
  let rebuilds = 0;
  const mock = {
    subscriptionChangeOrder: { findMany: async () => [order] },
    accountSubscription: { findUnique: async () => subscription },
    accountEntitlement: { findUnique: async () => entitlement },
  };
  const repair = new EntitlementRepairService(mock, { rebuild: async () => { rebuilds++; } });
  assert.equal((await repair.process('observe'))[0].status, 'stale');
  assert.equal(rebuilds, 0, 'observe mode must never write');
  assert.equal((await repair.process('enforce'))[0].status, 'repaired');
  assert.equal(rebuilds, 1);
  entitlement.rebuiltAt = new Date('2026-11-02T00:00:00Z');
  assert.equal((await repair.process('enforce'))[0].status, 'healthy');
  assert.equal(rebuilds, 1, 'fresh entitlements must not be rebuilt');
  subscription.planId = 'newer-plan';
  entitlement.rebuiltAt = new Date('2026-10-31T00:00:00Z');
  assert.equal((await repair.process('enforce'))[0].status, 'superseded');
  assert.equal(rebuilds, 1, 'older applied orders must not rewrite a newer plan');
  console.log('PASS: entitlement observe, repair, freshness and supersession (4 assertions groups)');

  const { SubscriptionRenewalService } = load('src/billing/subscription-renewal.service.ts', {
    './student-pricing': { parseStudentPricing: m => m?.pricing || { mode: 'fixed' } }
  });
  let created = 0;
  const renewalPrisma = {
    accountSubscription: {
      findUnique: async () => ({ accountId: 'school-A', planId: 'plan-A', billingCycle: 'termly', currentPeriodEnd: new Date('2026-11-05T00:00:00Z') }),
      findMany: async () => [{ accountId: 'school-A' }]
    },
    subscriptionChangeOrder: { findFirst: async () => null },
    subscriptionPlan: { findUnique: async () => ({ metadata: { pricing: { mode: 'tiered' } } }) }
  };
  const renew = new SubscriptionRenewalService(renewalPrisma, {
    createOrder: async (_account, dto) => { created++; assert.equal(dto.effectiveMode, 'immediate'); return { id: 'renewal-1' }; }
  });
  assert.equal((await renew.processDueRenewals(new Date(), 'observe'))[0].status, 'observed');
  assert.equal(created, 0, 'observe mode must not create invoices');
  assert.equal((await renew.processDueRenewals(new Date(), 'enforce'))[0].status, 'quoted');
  assert.equal(created, 1);
  renewalPrisma.subscriptionChangeOrder.findFirst = async () => ({ id: 'renewal-1', status: 'payment_pending' });
  assert.equal((await renew.quoteRenewal('school-A')).id, 'renewal-1');
  assert.equal(created, 1, 'pending payment must not start a second renewal');
  console.log('PASS: renewal observe, student-priced immediate mode, pending-order reuse');
  console.log('PASS: all 7 Stage 7 behavioral scenarios');
})().catch(e => { console.error(e); process.exitCode = 1; });
