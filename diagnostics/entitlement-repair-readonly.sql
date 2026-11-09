-- Stage 7: read-only candidates for interrupted entitlement rebuilds.
-- A pending subscription without a paid applied order is NOT a repair candidate.
SELECT o.id AS order_id, o."accountId", o."appliedAt",
       s.id AS subscription_id, s.status AS subscription_status,
       s."planId" AS current_plan,
       e.id AS entitlement_id, e."subscriptionId" AS entitlement_subscription_id,
       e."planId" AS entitlement_plan_id, e."rebuiltAt",
       CASE
         WHEN s.id IS NULL THEN 'no-current-subscription'
         WHEN s."planId" IS DISTINCT FROM o."toPlanId"
           OR s."currentPeriodStart" IS DISTINCT FROM o."newPeriodStart"
           OR s."currentPeriodEnd" IS DISTINCT FROM o."newPeriodEnd"
         THEN 'superseded-order'
         WHEN e.id IS NULL THEN 'missing-entitlement'
         WHEN e."rebuiltAt" < o."appliedAt" THEN 'rebuild-after-apply-missing'
         WHEN e."perpetualLicenseId" IS NULL AND
             (e."subscriptionId" IS DISTINCT FROM s.id OR e."planId" IS DISTINCT FROM s."planId")
         THEN 'subscription-entitlement-mismatch'
         ELSE 'healthy'
       END AS diagnosis
FROM "SubscriptionChangeOrder" o
LEFT JOIN "AccountSubscription" s ON s."accountId" = o."accountId"
LEFT JOIN "AccountEntitlement" e ON e."accountId" = o."accountId"
WHERE o.status = 'applied' AND o."appliedAt" IS NOT NULL
ORDER BY o."appliedAt" DESC
LIMIT 500;
