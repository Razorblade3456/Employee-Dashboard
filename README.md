# Gather — Employee Management Dashboard

A Next.js + React + TypeScript workspace with Tailwind CSS, Lucide icons, Supabase authentication/database integration, and a complete browser-local demo.

## Run it

Requires Node.js 20.9+ (Node 22 LTS recommended).

```powershell
cd "C:\Users\abrah\OneDrive\Desktop\Employee Dashboard"
npm install
npm run dev
```

Open http://localhost:5190. Choose Employee, Manager, or Accountant. No setup credentials are required in demo mode. Demo changes persist in this browser at this exact host and port and synchronize between tabs. The demo role switcher is a preview feature, not an authentication boundary. Use fictional data only. To reset the demo, remove the `gather-demo-v1` and `gather-demo-role` keys in your browser's site storage.

## What works

- **Employee:** own published monthly/weekly/daily schedule; confirmed days off, pending dates, next shift, weekly/monthly scheduled hours. No editing, management notes, or payroll.
- **Manager:** employee search/department/status filtering; add/edit/deactivate employees; month/week/day team or individual scheduling; drag shifts to another date/member; create/edit/copy/delete shifts; duplicate whole weeks; publish a date range; overlap warnings including overnight boundaries; minimum daily staffing warnings; private dated operational notes; actual time entry and approval.
- **Accountant:** effective-dated hourly rates; actual-time entry, review, and approvals; payroll period/employee/department filters; regular/overtime/double-time hours; gross estimates and pay-by-employee chart; Excel-compatible CSV with formula-injection protection.
- **All roles:** distinct overview, light/dark themes, responsive navigation, search/jump menu, activity/help dialogs, settings.
- **Live data:** separate tables, RLS policies, audit triggers, publication RPC, atomic week duplication, real-time subscriptions plus 20-second refresh fallback.

## Connect Supabase

1. Create a new Supabase project. The migration targets **one company per project**, not multiple tenants.
2. Run `supabase/migrations/001_workspace.sql` in the project's SQL Editor as the database administrator. This creates tables, input constraints, hashed initial setup codes, RLS, audit functions, and real-time publication entries. Run once on a fresh database; use new versioned migrations for later changes.
3. Copy `.env.example` to `.env.local`.
4. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`: project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable/anon client key. This identifier is intentionally public; RLS protects the data.
   - `SUPABASE_SERVICE_ROLE_KEY`: **server only**, required only for initial privileged-role enrollment.
   - `BOOTSTRAP_SECRET`: **server only**, a private random 32+ character secret. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never commit or share it publicly.
5. Enable email/password Auth, require email confirmation, and configure the Auth Site URL / allowed redirect URLs for localhost and the deployed domain. Configure a minimum password length of 12 in Supabase. For production, configure your own email delivery provider and appropriate Auth rate limits.
6. Restart the app. The public connection variables switch the application from demo to live mode. No mock data is loaded into the database automatically.

### Initial manager/accountant setup

- Choose the appropriate role on the landing page.
- Use **Create an employee account** to register an ordinary account first; confirm its email.
- Return to the role, select **First-time setup**, and enter the verified account's email/password, the private server setup secret, and the initial role code.
- Initial manager code: **1234**. Initial accountant code: **5678**.
- Each role may be claimed once. These codes alone cannot authenticate or assign a role. The server validates the existing account and the high-entropy secret; the service-role-only database function atomically consumes the enrollment.
- After enrollment, sign in normally with email/password. The database role, rather than the selected landing-page tile, determines access.
- Change the code in Settings (new code minimum 8 characters), and remove `BOOTSTRAP_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` from the deployment after both roles are enrolled. Normal application use does not need either.
- To add further privileged users, an administrator can update their verified user's `profiles.role` using the Supabase SQL Editor. Public clients cannot modify profiles. Additional managers/accountants use their own authenticated accounts; setup-code rotation belongs to the original setup owner.

### Employee enrollment

Managers add a team member with the employee's real email. The employee creates and verifies their own Auth account with exactly that email. On sign-in, `link_employee()` checks the **verified email in auth.users**, then links the account. User-supplied role metadata is ignored. Deactivation revokes schedule access while preserving history. Reactivating restores access to that record.

### Explicit manager payroll visibility

Managers cannot read hourly rates by default. An administrator may grant **read-only** access with:

```sql
insert into private.role_permissions(user_id,can_view_payroll)
values ('MANAGER_AUTH_USER_UUID',true)
on conflict(user_id) do update set can_view_payroll=true;
```

The manager People table will show the permitted current hourly rates. Accountants alone can add/edit rates. Revoke by setting the permission to false. The full payroll dashboard remains an accountant experience.

## Scheduling semantics

Unpublished dates are PENDING for employees. A published date without their shift is a day off. Editing, moving, or deleting a shift marks the affected dates draft until explicitly republished. The live database applies this atomically with triggers; employees never retrieve those draft-day shifts.

Overlapping scheduled shifts are allowed and clearly flagged for a manager to resolve. Actual time entries cannot overlap, including across midnight; database checks serialize writes per employee. Deactivation is preferred over deletion to retain employee history.

Minimum staffing counts unique scheduled employees per date; it does not guarantee coverage for every hour. Week copying preserves existing shifts and creates copies as draft. Review highlighted overlaps before publishing. Destructive shift deletion has an explicit confirmation step.

## Payroll policy and limits

Payroll is an **estimated gross-pay calculation**, not tax withholding, legal compliance certification, or complete payroll processing.

- Only approved actual clock entries are paid. Unapproved hours are separately visible.
- Pay rates are effective-dated; missing rates are flagged, and missing-rate pay is excluded.
- Workweeks begin on the configured weekday. Report calculations include earlier entries in the same workweek, even when the date filter starts midweek.
- Daily overtime and double time are allocated before weekly overtime. Remaining regular-eligible hours are tested against the weekly threshold, without paying the same hour twice.
- Defaults: 40 weekly hours; daily overtime/double time disabled; overtime multiplier 1.5; double multiplier 2.
- Configure the applicable location and company policy in Accountant Settings. Rules apply to the whole workspace. Historical reports recalculate with the current policy; rates retain history, policies do not have effective dates. The company timezone is locked once actual time entries exist; changing it requires a reviewed database migration.
- Overnight hours split at company-local midnight. Breaks/approved adjustments are allocated proportionally because break timestamps are not recorded.
- Actual elapsed time across DST is counted. Ambiguous/nonexistent clock endpoints are rejected in both browser and database rather than guessed. Supporting repeated-hour clock entries requires explicit offset-aware timestamps in a future time-clock integration.
- Specialized requirements such as seventh-day premiums, holiday pay, location-specific employee exemptions, multiple concurrent jurisdictions, meal penalties, salaried staff, tax/deductions, approval segregation, and final payroll processing are outside this initial scope.
- Amounts are calculated at full precision and displayed/exported to cents. A production payroll provider may apply different rounding rules.

## Verify

```powershell
npm test
npm run typecheck
npm run build
npm start
```

Tests include payroll allocation, pay-rate history, midweek filters, overnight work, DST, CSV safety, input validation, and the **actual SQL migration** run against embedded PostgreSQL (PGlite + pgcrypto). Database tests create Supabase-style roles and an auth.uid shim, then exercise RLS, publishing, confidentiality, audit records, and deactivation. They do not replace testing your configured hosted Supabase project, Auth email delivery, or Realtime infrastructure.

## Deploy to Vercel

1. Push this folder to a private GitHub repository; omit node_modules, .next, and .env.local.
2. Import the repository into Vercel as a Next.js project.
3. Add the environment variables listed above for the production environment, then deploy. Vercel uses `npm run build` and its own port/runtime.
4. Set the deployed URL in Supabase Auth and test with three separate real accounts.
5. Verify employee isolation, private notes/rates, actual-time approval, CSV reports, sign-out, password changes, and automatic schedule refresh before entering real staff data.
6. Configure backups and recovery for the Supabase database. Free-tier availability and limits may vary by provider; no paid resources or live deployment have been created here.

## Structure

- `src/components/`: reusable role interfaces, scheduling, dialogs, settings.
- `src/lib/`: shared types, validation, time/calendar logic, payroll engine, data adapter.
- `src/app/api/setup/`: server-only one-time role enrollment.
- `supabase/migrations/`: persistent schema and backend authorization.
- `tests/`: calculation and real PostgreSQL permission tests.

Primary references: [Next.js](https://nextjs.org/docs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth](https://supabase.com/docs/guides/auth), [PGlite extensions](https://pglite.dev/extensions/).
