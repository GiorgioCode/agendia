import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { startDatabase } from "../scripts/database-harness.mjs";

let db, seed;
const sur = "e1000000-0000-4000-8000-000000000001";
const adminSur = "e1000000-0000-4000-8000-000000000002";
const belgrano = "e2000000-0000-4000-8000-000000000001";
const adminBelgrano = "e2000000-0000-4000-8000-000000000002";
before(
  async () => {
    db = await startDatabase();
    await db.client.query(
      await readFile("tests/demo-auth-bootstrap.sql", "utf8"),
    );
    seed = await readFile("supabase/seed_demo_clinics.sql", "utf8");
  },
  { timeout: 60000 },
);
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.client.query(
    "truncate public.tenants cascade; truncate auth.users cascade;",
  );
});
async function asUser(user, sql) {
  const client = new pg.Client(db.connection);
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return await client.query(sql);
  } finally {
    await client.query("rollback");
    await client.end();
  }
}

test("seed creates two clinics, eight professionals, 80 schedules and active plans", async () => {
  await db.client.query(seed);
  const result = await db.client.query(`
        select t.id, count(distinct p.id)::int professionals,
               count(distinct s.id)::int schedules, sub.status
        from public.tenants t
        join public.professionals p on p.tenant_id=t.id
        join public.professional_schedules s on s.professional_id=p.id
        join public.subscriptions sub on sub.tenant_id=t.id
        group by t.id,sub.status order by t.id
    `);
  assert.deepEqual(result.rows, [
    { id: sur, professionals: 4, schedules: 40, status: "ACTIVE" },
    { id: belgrano, professionals: 4, schedules: 40, status: "ACTIVE" },
  ]);
  const available = await db.client.query(`
      select * from public.get_available_slots(
        'clinica-del-sur-demo','e1000000-0000-4000-8000-000000000101',
        (date_trunc('week',now())+interval '14 days')::date)
    `);
  assert.equal(available.rowCount, 16);
});

test("documented passwords match bcrypt hashes and email identities are confirmed", async () => {
  await db.client.query(seed);
  for (const [id, email, password] of [
    [adminSur, "admin.sur@example.com", "Sur!fuKqqxuCRCzsaeAj9a"],
    [adminBelgrano, "admin.belgrano@example.com", "Bel!cCTUe-AVcvHqs9eB4Z"],
  ]) {
    const row = (
      await db.client.query(
        `
            select u.*, i.provider_id, i.identity_data,
                   crypt($2,u.encrypted_password)=u.encrypted_password as password_matches
            from auth.users u join auth.identities i on i.user_id=u.id and i.provider='email'
            where u.id=$1
        `,
        [id, password],
      )
    ).rows[0];
    assert.equal(row.email, email);
    assert.equal(row.password_matches, true);
    assert.ok(row.email_confirmed_at);
    assert.equal(row.provider_id, id);
    assert.equal(row.identity_data.email_verified, true);
    assert.equal(row.role, "authenticated");
    assert.equal(row.is_super_admin, false);
    for (const field of [
      "confirmation_token",
      "recovery_token",
      "email_change_token_new",
      "email_change",
      "email_change_token_current",
      "phone_change",
      "phone_change_token",
      "reauthentication_token",
    ]) {
      assert.equal(row[field], "", `${field} must not be null`);
    }
  }
});

test("each administrator sees only their own clinic and has no platform privileges", async () => {
  await db.client.query(seed);
  for (const [user, tenant] of [
    [adminSur, sur],
    [adminBelgrano, belgrano],
  ]) {
    const clinics = await asUser(user, "select id from public.tenants");
    assert.deepEqual(clinics.rows, [{ id: tenant }]);
    const professionals = await asUser(
      user,
      "select tenant_id from public.professionals",
    );
    assert.equal(professionals.rowCount, 4);
    assert.ok(professionals.rows.every((p) => p.tenant_id === tenant));
    assert.equal(
      (await asUser(user, "select public.is_platform_admin() value")).rows[0]
        .value,
      false,
    );
  }
});

test("re-running keeps counts, changed passwords and edited clinic data", async () => {
  await db.client.query(seed);
  await db.client.query(
    "update auth.users set encrypted_password=crypt('ChangedPassword!123',gen_salt('bf',10)) where id=$1",
    [adminSur],
  );
  await db.client.query(
    "update public.tenants set name='Nombre editado' where id=$1",
    [sur],
  );
  await db.client.query(seed);
  for (const [table, expected] of [
    ["auth.users", 2],
    ["auth.identities", 2],
    ["public.tenants", 2],
    ["public.tenant_members", 2],
    ["public.subscriptions", 2],
    ["public.professionals", 8],
    ["public.professional_schedules", 80],
  ]) {
    assert.equal(
      (await db.client.query(`select count(*)::int n from ${table}`)).rows[0].n,
      expected,
    );
  }
  assert.equal(
    (
      await db.client.query("select name from public.tenants where id=$1", [
        sur,
      ])
    ).rows[0].name,
    "Nombre editado",
  );
  assert.equal(
    (
      await db.client.query(
        "select crypt('ChangedPassword!123',encrypted_password)=encrypted_password ok from auth.users where id=$1",
        [adminSur],
      )
    ).rows[0].ok,
    true,
  );
});

test("an existing unrelated email aborts the seed without taking over the account", async () => {
  await db.client.query(
    "insert into auth.users(id,email) values(gen_random_uuid(),'admin.sur@example.com')",
  );
  await assert.rejects(db.client.query(seed), /Cuenta demo en conflicto/);
  await db.client.query("rollback");
  assert.equal(
    (await db.client.query("select count(*)::int n from public.tenants"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await db.client.query("select count(*)::int n from auth.users")).rows[0].n,
    1,
  );
});

test("migration 004 repairs the reported legacy trigger error and is repeatable", async () => {
  const fix = await readFile(
    "supabase/migrations/20260914000400_fix_guard_tenant_write.sql",
    "utf8",
  );
  // Reproduce the function version still installed in affected remote projects.
  await db.client.query(`
    create or replace function private.guard_tenant_write() returns trigger
    language plpgsql security definer set search_path='' as $$
    declare v_id uuid;
    begin
      v_id := case when tg_table_name='tenants' then new.id
                   else coalesce(new.tenant_id,old.tenant_id) end;
      perform private.lock_tenant(v_id);
      return new;
    end; $$;
  `);
  await assert.rejects(
    db.client.query(seed),
    /record "new" has no field "tenant_id"/,
  );
  await db.client.query("rollback");
  assert.equal(
    (await db.client.query("select count(*)::int n from auth.users")).rows[0].n,
    0,
  );
  await db.client.query(fix);
  await db.client.query(seed);
  const usersBefore = (
    await db.client.query(
      "select id,encrypted_password from auth.users order by id",
    )
  ).rows;
  await db.client.query(fix);
  await db.client.query(seed);
  assert.deepEqual(
    (
      await db.client.query(
        "select id,encrypted_password from auth.users order by id",
      )
    ).rows,
    usersBefore,
  );
  assert.equal(
    (await db.client.query("select count(*)::int n from public.professionals"))
      .rows[0].n,
    8,
  );
  // Exceptions lack active; DELETE has only OLD; both use the same trigger.
  await db.client
    .query(`insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type)
    values('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000101',current_date+7,'CLOSED')`);
  await db.client.query(
    "delete from public.schedule_exceptions where type='CLOSED'",
  );
});
