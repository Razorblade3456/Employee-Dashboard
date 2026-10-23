# Authorization model

The schema implements a single-company deployment. All public tables have RLS enabled; unauthenticated requests cannot read records. Privileged roles are stored in profiles, not trusted client metadata.

| Resource | Employee | Manager | Accountant |
| --- | --- | --- | --- |
| Employee records | Own active record | Read/add/edit/deactivate | Read |
| Shifts | Own, on published dates | Manage | None |
| Publication dates | Published only | Manage | None |
| Management notes | None | Manage | None |
| Actual time entries | None | Manage/review | Manage/review |
| Pay rates | None | Only explicitly granted read | Manage |
| Payroll policy | None | Only explicitly granted read | Read/update |
| Company settings | Read | Read/update | Read |
| Audit trail | None | Scheduling, notes, actual time; rates only by grant | Actual time, rates, payroll policy |

Frontend permission checks are for user experience; RLS, constraints, and security-definer RPCs enforce database authorization. Employee linking uses the verified auth.users email. Profiles cannot be updated by public clients. The service-role key appears only in the server setup route and environment configuration.

Initial enrollment requires three independent inputs: an authenticated verified account, a high-entropy server secret, and a role code. The one-time role claim is locked atomically. Codes are bcrypt-hashed with pgcrypto. After enrollment, disable the server route by removing its two server-only environment secrets. More privileged accounts are provisioned by a database administrator. Normal clients never receive the service-role key or code hashes.

Schedule mutation and publication are transactionally consistent. An edited/deleted shift unpublishes affected dates. Actual time rows are serialized per employee and cannot overlap. DST endpoint ambiguity is rejected. Timezone changes are locked after actual entries exist.

Audit records are immutable through public clients and retain old/new values. Administrators retain database-owner powers; protect those accounts. The demo intentionally does not emulate secure authentication: sample data and role switching live entirely in browser storage.

Run npm test for PostgreSQL policy regression tests. Configure a hosted test project and validate Auth, email delivery, Realtime, and deployment secrets before using real employee information.
