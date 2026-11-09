#!/usr/bin/env python3
"""Non-mutating regression inventory for Eleeveon Schools Stage 7.
Run from repository root: python stage7/check_source.py
This does NOT prove runtime correctness or payment provider safety.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path.cwd()
def read(p):
 f=root/p
 return f.read_text(encoding='utf-8') if f.is_file() else ''
checks=[
 ('Quote is scoped to account','src/billing/subscription-change.service.ts','findFirst({'),
 ('Checkout mode defaults off','src/billing/billing.service.ts','STUDENT_PRICED_CHECKOUT_MODE || "off"'),
 ('Payment provider verification','src/billing/billing.service.ts','verifyStudentPaymentSettlement'),
 ('Subscription apply transaction','src/billing/subscription-change.service.ts','this.prisma.$transaction'),
 ('Subscription account lock','src/billing/subscription-change.service.ts','pg_advisory_xact_lock'),
 ('Subscription period deduplication','src/billing/subscription-change.service.ts','changeOrderId: order.id'),
 ('Payment recovery endpoint','src/billing/billing.controller.ts','subscription-quotes/:id/recover'),
 ('Expiry is opt-in','src/billing/subscription-jobs.service.ts','TRIAL_EXPIRATION_JOB_MODE'),
 ('Quota observe default','src/sync/sync.service.ts','STUDENT_QUOTA_ENFORCEMENT || "observe"'),
 ('Confirmation of sequence authority','src/admissions/admission-number.service.ts','nextSequence'),
]
failed=[]
for name,path,phrase in checks:
 ok=phrase in read(path)
 print(('PRESENT' if ok else 'MISSING')+' | '+name+' | '+path)
 if not ok: failed.append(name)
print(f'\nPresence checks: {len(checks)-len(failed)}/{len(checks)}')
if failed: sys.exit(1)
print('NOTE: Presence is not runtime integration evidence. Paystack, PostgreSQL and concurrent requests MUST be tested.')
