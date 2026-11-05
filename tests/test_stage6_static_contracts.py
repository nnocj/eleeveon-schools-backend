"""Static contract checks for the supplied Stage 6 replacements.
These tests do NOT simulate Paystack, Prisma transactions, network errors, or authorization.
"""
import pathlib, re, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
SERVICE=(ROOT/'src/billing/billing.service.ts').read_text()
LATEST=pathlib.Path(__file__).resolve().parents[1]
class Stage6Contract(unittest.TestCase):
  def between(self,begin,end):
    return SERVICE.split(begin,1)[1].split(end,1)[0]
  def test_checkout_default_off(self):
    self.assertIn('process.env.STUDENT_PRICED_CHECKOUT_MODE || "off"',SERVICE)
  def test_student_quotes_recalculate(self):
    s=self.between('async paySubscriptionQuote(', 'async verifyPayment(')
    self.assertIn('subscriptionChanges.quote(order.accountId',s)
    self.assertIn('saved.studentCount',s)
    self.assertIn('status: "checkout_initializing"',s)
  def test_reference_persisted_before_provider_initialize(self):
    s=self.between('async paySubscriptionQuote(', 'async verifyPayment(')
    self.assertLess(s.index('providerReference: payment.id'),s.index('paymentProviderService.initializePayment'))
  def test_recovery_does_not_initialize_new_payment(self):
    s=self.between('async recoverSubscriptionQuote(', 'async paySubscriptionQuote(')
    self.assertNotIn('initializePayment(',s)
    self.assertIn('getForAccount(actor.accountId, id)',s)
  def test_success_verifies_real_provider(self):
    s=self.between('private async verifyStudentPaymentSettlement(', 'async createSubscriptionQuote(')
    for x in ['verifyPayment("paystack"','details?.reference','details?.currency','details?.amount','metadata.accountId','metadata.changeOrderId']:
      self.assertIn(x,s)
  def test_late_fail_event_cannot_regress_paid(self):
    s=self.between('private async markPaymentFailed(', 'async dashboard(')
    self.assertIn('if (existing.status === "paid")',s)
    s=self.between('async handlePaystackWebhook(', 'async initiatePayment(')
    self.assertIn('if (payment.status === "paid")',s)
  def test_dispute_records_review_not_failed(self):
    s=self.between('async handlePaystackWebhook(', 'async initiatePayment(')
    self.assertIn('payment_dispute_review_required',s)
    self.assertIn('status: "review_required"',s)
if __name__=='__main__':unittest.main(verbosity=2)
