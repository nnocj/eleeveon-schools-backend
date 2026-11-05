const assert = require('node:assert/strict');
const {test} = require('node:test');
const p = require('../.test-build/deployment-policy.js');
test('Maps legacy and independent deployment values', () => {
  assert.equal(p.deploymentModeOf('eleeveon_cloud'), 'connected');
  assert.equal(p.deploymentModeOf('offline_local'), 'offline');
  assert.equal(p.deploymentModeOf('independent_multi_device'), 'offline');
});
test('Complimentary pilot and trial classification', () => {
  assert.equal(p.acquisitionOf('complimentary', 'active'), 'complimentary');
  assert.equal(p.acquisitionOf('subscription', 'trial'), 'trial');
});
test('Trial expires at configured timestamp, grace only with explicit extension', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  assert.equal(p.statusAt({status:'trial',validUntil: '2026-11-18T12:20:40Z'}, now),'expired');
  assert.equal(p.statusAt({status:'trial',validUntil: '2026-11-18T12:20:40Z',graceEndsAt:'2026-11-20T00:00:00Z'}, now),'grace');
});
test('Active licence supersedes pending subscription, expired licence is excluded before resolver',()=>{
  assert.equal(p.chooseCommercialBase({hasActivePerpetual:true,subscriptionStatus:'pending'}),'perpetual');
  assert.equal(p.chooseCommercialBase({hasActivePerpetual:false,subscriptionStatus:'trial'}),'subscription');
});
