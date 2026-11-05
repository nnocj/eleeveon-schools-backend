-- READ ONLY. Execute in Supabase SQL editor after selecting a DISPOSABLE TEST ACCOUNT.
-- Replace the placeholder UUID before running; no mutations occur.
-- Totals are informational; do not use this query as proof of provider settlement.
SELECT s."accountId", s.status, s."planId", s."currentPeriodEnd", s."trialEndsAt"
FROM public."AccountSubscription" s
WHERE s."accountId" = '00000000-0000-0000-0000-000000000000';

SELECT o.id, o."accountId", o.status, o."amountDue", o.currency,
       o."invoiceId", o."paymentId", o."quoteExpiresAt", o.calculation
FROM public."SubscriptionChangeOrder" o
WHERE o."accountId" = '00000000-0000-0000-0000-000000000000'
ORDER BY o."createdAt" DESC LIMIT 20;

SELECT p.id, p."accountId", p.status, p.provider, p."providerReference",
       p.amount, p.currency, p."invoiceId", p."authorizationUrl", p."paidAt"
FROM public."AppPayment" p
WHERE p."accountId" = '00000000-0000-0000-0000-000000000000'
ORDER BY p."createdAt" DESC LIMIT 20;
