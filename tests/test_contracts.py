import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
B=(ROOT/'src/billing/billing.service.ts').read_text()
S=(ROOT/'src/billing/subscription-change.service.ts').read_text()
class ContractTests(unittest.TestCase):
 def test_checkout_is_single_transaction(self):
  self.assertIn('const { invoice, payment } = studentPriced',B)
  self.assertIn('await this.prisma.$transaction(async (tx)',B)
  self.assertIn('status: "checkout_initializing"',B)
  self.assertIn('providerReference: createdPayment.id',B)
  self.assertIn('status: "payment_pending"',B)
 def test_payment_paid_status_claim(self):
  self.assertIn('where: { id: paymentId, status: { not: "paid" } }',B)
  self.assertIn('verifyStudentPaymentSettlement(existing.id)',B)
 def test_late_failure_guard(self):
  self.assertIn('where: { id: paymentId, status: { not: "paid" } }',B)
 def test_activation_is_transactional_and_account_serialized(self):
  self.assertIn('pg_advisory_xact_lock',S)
  self.assertIn('const claimed = await tx.subscriptionChangeOrder.updateMany',S)
  self.assertIn('await tx.accountSubscription.upsert',S)
  self.assertIn('await tx.subscriptionPeriod.upsert',S)
  self.assertIn('await this.entitlements.rebuild(result.order.accountId)',S)
 def test_idempotency(self):
  self.assertIn('if (order.status === "applied") return { order, newlyApplied: false }',S)
  self.assertIn('where: { changeOrderId: order.id }',S)
 def test_plan_proof(self):
  self.assertIn('proof?.provider !== "paystack"',S)
  self.assertIn('proof.amount !== payment.amount',S)
 def test_fail_closed_settings(self):
  self.assertIn('STUDENT_PRICED_CHECKOUT_MODE',S)
  self.assertIn('STUDENT_PRICED_CHECKOUT_MODE',B)
 def test_fixed_price_compatibility(self):
  self.assertIn('pricing.mode === "fixed" ? "quoted" : "checkout_initializing"',S)
 def test_recovery_path_kept(self):
  self.assertIn('async recoverSubscriptionQuote(',B)
  self.assertIn('canStartNewPayment: false',B)
 def test_webhook_settlement(self):
  self.assertIn('verifyPaystackSignature(signature, body)',B)
  self.assertIn('await this.markPaymentPaid(payment.id',B)
 def test_one_order_account_boundary(self):
  self.assertIn('accountId: actor.accountId,',B)
  self.assertIn('getForAccount(actor.accountId, id)',B)
if __name__=='__main__': unittest.main()
