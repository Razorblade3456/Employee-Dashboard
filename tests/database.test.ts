import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
test("PostgreSQL migration, permissions, publishing, and audit", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;`,
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_workspace.sql", import.meta.url),
        "utf8",
      ),
    );
    const manager = "10000000-0000-4000-8000-000000000001",
      accountant = "10000000-0000-4000-8000-000000000002",
      employee = "10000000-0000-4000-8000-000000000003",
      other = "10000000-0000-4000-8000-000000000004";
    for (const [id, email] of [
      [manager, "manager@test.example"],
      [accountant, "accountant@test.example"],
      [employee, "employee@test.example"],
      [other, "other@test.example"],
    ])
      await db.query("insert into auth.users values($1,$2,now())", [id, email]);
    await db.query("select public.bootstrap_role($1,'manager','1234')", [
      manager,
    ]);
    await db.query("select public.bootstrap_role($1,'accountant','5678')", [
      accountant,
    ]);
    async function as(id: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    async function count(table: string) {
      return Number(
        (
          await db.query<{ count: string }>(
            "select count(*) from public." + table,
          )
        ).rows[0].count,
      );
    }
    await as(manager);
    await db.query(
      "insert into public.employees(id,name,email,department,title) values($1,'Alex Morgan','employee@test.example','Operations','Associate'),($2,'Other Person','other@test.example','Operations','Associate')",
      [employee, other],
    );
    await as(employee);
    await db.exec("select public.link_employee()");
    await as(other);
    await db.exec("select public.link_employee()");
    await as(manager);
    await db.query(
      "insert into public.shifts(employee_id,date,start,\"end\",break_minutes) values($1,'2026-10-23','09:00','17:00',30),($2,'2026-10-23','09:00','17:00',30)",
      [employee, other],
    );
    await db.query(
      "insert into public.notes(employee_id,kind,body) values($1,'General','Private management information')",
      [employee],
    );
    await t.test("draft shifts stay hidden from employees", async () => {
      await as(employee);
      assert.equal(await count("shifts"), 0);
      assert.equal(await count("employees"), 1);
      assert.equal(await count("notes"), 0);
      assert.equal(await count("pay_rates"), 0);
    });
    await t.test(
      "publishing reveals only the employee’s own shifts",
      async () => {
        await as(manager);
        await db.exec(
          "select public.publish_schedule('2026-10-23','2026-10-24')",
        );
        await as(employee);
        assert.equal(await count("shifts"), 1);
        assert.equal(await count("schedule_days"), 2);
      },
    );
    await t.test(
      "employees cannot edit schedules or self-assign roles",
      async () => {
        await as(employee);
        await assert.rejects(() =>
          db.query(
            "insert into public.shifts(employee_id,date,start,\"end\") values($1,'2026-10-24','09:00','17:00')",
            [employee],
          ),
        );
        await assert.rejects(() =>
          db.exec("update public.profiles set role='manager'"),
        );
        await assert.rejects(() =>
          db.exec("select public.publish_schedule('2026-10-23','2026-10-24')"),
        );
      },
    );
    await t.test(
      "accountants can store rates but cannot change schedules or see notes",
      async () => {
        await as(accountant);
        await db.query(
          "insert into public.pay_rates(employee_id,hourly_rate,effective_date) values($1,25,'2020-01-01')",
          [employee],
        );
        assert.equal(await count("pay_rates"), 1);
        assert.equal(await count("notes"), 0);
        await assert.rejects(() =>
          db.query(
            "insert into public.shifts(employee_id,date,start,\"end\") values($1,'2026-10-24','09:00','17:00')",
            [employee],
          ),
        );
      },
    );
    await t.test(
      "manager rates are private unless explicitly granted",
      async () => {
        await as(manager);
        assert.equal(await count("pay_rates"), 0);
        await db.exec("reset role");
        await db.query("insert into private.role_permissions values($1,true)", [
          manager,
        ]);
        await as(manager);
        assert.equal(await count("pay_rates"), 1);
        await assert.rejects(() =>
          db.query(
            "insert into public.pay_rates(employee_id,hourly_rate,effective_date) values($1,99,'2026-01-01')",
            [employee],
          ),
        );
      },
    );
    await t.test("editing a published shift unpublishes that day", async () => {
      await as(manager);
      await db.query(
        "update public.shifts set start='10:00',status='draft' where employee_id=$1",
        [employee],
      );
      await as(employee);
      assert.equal(await count("shifts"), 0);
    });
    await t.test(
      "time entries validate DST, overlaps, and write an audit record",
      async () => {
        await as(accountant);
        await db.query(
          "insert into public.time_entries(employee_id,date,start,\"end\",approved) values($1,'2026-10-19','09:00','17:00',true)",
          [employee],
        );
        await assert.rejects(() =>
          db.query(
            "insert into public.time_entries(employee_id,date,start,\"end\") values($1,'2026-10-19','10:00','18:00')",
            [employee],
          ),
        );
        await assert.rejects(() =>
          db.query(
            "insert into public.time_entries(employee_id,date,start,\"end\") values($1,'2026-03-08','02:30','04:00')",
            [employee],
          ),
        );
        assert.ok((await count("audit_log")) > 0);
      },
    );
    await t.test(
      "employees cannot call server bootstrap, read audit, or access private hashes",
      async () => {
        await as(employee);
        await assert.rejects(() =>
          db.query("select public.bootstrap_role($1,'manager','1234')", [
            employee,
          ]),
        );
        assert.equal(await count("audit_log"), 0);
        await assert.rejects(() =>
          db.exec("select * from private.setup_codes"),
        );
      },
    );
    await t.test(
      "managers can set draft/pending/published dates, while other roles cannot",
      async () => {
        await as(manager);
        await db.exec(
          "select public.set_schedule_status('2026-10-23','2026-10-24','pending')",
        );
        await as(employee);
        assert.equal(await count("shifts"), 0);
        await assert.rejects(() =>
          db.exec(
            "select public.set_schedule_status('2026-10-23','2026-10-24','published')",
          ),
        );
        await as(manager);
        await db.exec(
          "select public.set_schedule_status('2026-10-23','2026-10-24','draft')",
        );
        await db.exec(
          "select public.publish_schedule('2026-10-23','2026-10-24')",
        );
        await as(employee);
        assert.equal(await count("shifts"), 1);
      },
    );
    await t.test(
      "week duplication is atomic, creates drafts, and rejects overlapping target weeks",
      async () => {
        await as(manager);
        await db.exec(
          "select public.duplicate_week('2026-10-19','2026-10-26')",
        );
        assert.equal(await count("shifts"), 4);
        await assert.rejects(() =>
          db.exec("select public.duplicate_week('2026-10-19','2026-10-20')"),
        );
        await as(employee);
        assert.equal(await count("shifts"), 1);
      },
    );
    await t.test(
      "deactivated employees lose schedule access without deleting history",
      async () => {
        await as(manager);
        await db.exec(
          "select public.publish_schedule('2026-10-23','2026-10-24')",
        );
        await db.query("update public.employees set active=false where id=$1", [
          employee,
        ]);
        await as(employee);
        assert.equal(await count("shifts"), 0);
        await as(manager);
        assert.equal(await count("shifts"), 4);
        await db.exec(
          "select public.publish_schedule('2026-10-23','2026-10-24')",
        );
      },
    );
  } finally {
    await db.close();
  }
});
