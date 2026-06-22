DROP-IN PACKAGE: eleeveon-school-backend/src and scripts

What this package adds:
- developer role support in backend logic
- owner/super_admin separated from developer
- JWT auth with memberships in session
- account CRUD
- account user CRUD
- membership CRUD
- permission rule CRUD
- subscription plan CRUD
- subscription CRUD
- invoice/payment CRUD
- sync status/push/pull/diagnostics
- seedPlans.ts
- seedDeveloper.ts

Important Prisma note:
Your current Prisma role fields are strings, so developer works without enum changes.
However, also update your frontend role types and roleRedirect.ts to include developer.

Recommended commands:
1. Copy src/ over eleeveon-school-backend/src
2. Copy scripts/ over eleeveon-school-backend/scripts
3. Run: npx prisma generate
4. Run: npx tsx scripts/seedPlans.ts
5. Run: DEVELOPER_EMAIL=your@email.com DEVELOPER_PASSWORD=strongpass npx tsx scripts/seedDeveloper.ts
6. Run backend normally

Suggested .env:
DATABASE_URL="postgresql://..."
JWT_SECRET="a-long-random-secret"
PORT=4000
