import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { startDatabase } from "../scripts/database-harness.mjs";
pg.types.setTypeParser(1082, (v) => v);
let db, f;
const uid = {
  adminA: randomUUID(),
  adminB: randomUUID(),
  patientA: randomUUID(),
  patientB: randomUUID(),
  operator: randomUUID(),
  platform: randomUUID(),
};
before(
  async () => {
    db = await startDatabase();
    for (const [name, id] of Object.entries(uid))
      await db.client.query("insert into auth.users(id,email) values($1,$2)", [
        id,
        `${name}@example.test`,
      ]);
  },
  { timeout: 60_000 },
);
after(async () => {
  await db?.stop();
});
beforeEach(async () => {
  await db.client.query(
    "truncate public.tenants cascade; truncate public.platform_admins; truncate private.request_limits; update public.plans set max_professionals=5,max_admins=2;",
  );
  const plan = (
    await db.client.query("select id from public.plans where code='BASIC'")
  ).rows[0].id;
  const tA = randomUUID(),
    tB = randomUUID(),
    proA = randomUUID(),
    proB = randomUUID(),
    pa = randomUUID(),
    pb = randomUUID(),
    pa2 = randomUUID();
  await db.client.query(
    "insert into public.tenants(id,name,slug,responsible_name) values($1,'A','tenant-a','Admin A'),($2,'B','tenant-b','Admin B')",
    [tA, tB],
  );
  await db.client.query(
    "insert into public.subscriptions(tenant_id,plan_id,status) values($1,$3,'ACTIVE'),($2,$3,'ACTIVE')",
    [tA, tB, plan],
  );
  await db.client.query(
    "insert into public.tenant_members(tenant_id,user_id,role) values($1,$3,'TENANT_ADMIN'),($2,$4,'TENANT_ADMIN'),($1,$5,'OPERATOR')",
    [tA, tB, uid.adminA, uid.adminB, uid.operator],
  );
  await db.client.query(
    "insert into public.platform_admins(user_id) values($1)",
    [uid.platform],
  );
  await db.client.query(
    "insert into public.professionals(id,tenant_id,first_name,last_name,specialty) values($1,$3,'Pro','A','General'),($2,$4,'Pro','B','General')",
    [proA, proB, tA, tB],
  );
  await db.client.query(
    "insert into public.patients(id,tenant_id,user_id,first_name,last_name,dni,phone,email,notes) values($1,$4,$6,'Patient','A','123','555','a@example.test','SECRET A'),($2,$5,$7,'Patient','B','123','555','b@example.test','SECRET B'),($3,$4,$7,'Patient','Second','456','555','b@example.test','SECRET SECOND')",
    [pa, pb, pa2, tA, tB, uid.patientA, uid.patientB],
  );
  await db.client.query(
    "insert into public.professional_schedules(tenant_id,professional_id,day_of_week,start_time,end_time,appointment_duration) values($1,$3,1,'08:00','12:00',30),($2,$4,1,'08:00','12:00',30)",
    [tA, tB, proA, proB],
  );
  const date = (
    await db.client.query(
      "select (date_trunc('week',now())+interval '14 days')::date as d",
    )
  ).rows[0].d;
  f = { tA, tB, proA, proB, pa, pb, pa2, date, plan };
});
async function actor(user, sql, params = []) {
  const c = new pg.Client(db.connection);
  await c.connect();
  try {
    await c.query("begin");
    await c.query(
      user ? "set local role authenticated" : "set local role anon",
    );
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user || "",
    ]);
    const result = await c.query(sql, params);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
const slots = (pro = f.proA, date = f.date) =>
  actor(null, "select * from public.get_available_slots($1,$2,$3)", [
    "tenant-a",
    pro,
    date,
  ]);
const book = (user = uid.patientA, time = "09:00", pro = f.proA) =>
  actor(user, "select public.book_appointment($1,$2,$3,$4) as id", [
    "tenant-a",
    pro,
    f.date,
    time,
  ]).then((r) => r.rows[0].id);
const reschedule = (id, time) =>
  actor(uid.adminA, "select public.admin_reschedule_appointment($1,$2,$3,$4)", [
    id,
    f.proA,
    f.date,
    time,
  ]);
test("public slots: eight half-hour slots and safe projection", async () => {
  const r = await slots();
  assert.equal(r.rowCount, 8);
  assert.deepEqual(Object.keys(r.rows[0]), ["start_time", "end_time"]);
  assert.equal(r.rows[0].start_time, "08:00:00");
});
test("day without schedule returns no slots", async () => {
  const date = (await db.client.query("select ($1::date+1) as d", [f.date]))
    .rows[0].d;
  assert.equal((await slots(f.proA, date)).rowCount, 0);
});
test("occupied slot disappears; second booking is rejected", async () => {
  await book();
  assert.equal((await slots()).rowCount, 7);
  await assert.rejects(book(), /SLOT_UNAVAILABLE/);
});
test("own cancellation releases slot and never deletes history", async () => {
  const id = await book();
  await actor(uid.patientA, "select public.cancel_own_appointment($1)", [id]);
  assert.equal((await slots()).rowCount, 8);
  assert.equal(
    (
      await db.client.query(
        "select status from public.appointments where id=$1",
        [id],
      )
    ).rows[0].status,
    "CANCELLED",
  );
  await assert.rejects(
    actor(uid.patientA, "select public.cancel_own_appointment($1)", [id]),
    /APPOINTMENT_NOT_CANCELLABLE/,
  );
});
test("blocked interval excludes overlapping slots", async () => {
  await db.client.query(
    "insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type,start_time,end_time) values($1,$2,$3,'BLOCKED','08:15','09:15')",
    [f.tA, f.proA, f.date],
  );
  assert.equal((await slots()).rowCount, 5);
});
test("closed day overrides special hours; special hours replace weekly hours", async () => {
  await db.client.query(
    "insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type,start_time,end_time,appointment_duration) values($1,$2,$3,'CUSTOM_HOURS','15:00','16:00',20)",
    [f.tA, f.proA, f.date],
  );
  assert.deepEqual(
    (await slots()).rows.map((r) => r.start_time),
    ["15:00:00", "15:20:00", "15:40:00"],
  );
  await db.client.query(
    "insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type) values($1,$2,$3,'CLOSED')",
    [f.tA, f.proA, f.date],
  );
  assert.equal((await slots()).rowCount, 0);
});
test("outside hours, wrong grid and inactive professionals are rejected", async () => {
  await assert.rejects(book(uid.patientA, "07:00"), /SLOT_UNAVAILABLE/);
  await assert.rejects(book(uid.patientA, "08:15"), /SLOT_UNAVAILABLE/);
  await db.client.query(
    "update public.professionals set active=false where id=$1",
    [f.proA],
  );
  await assert.rejects(book(), /PROFESSIONAL_INACTIVE/);
});
test("two independent concurrent bookings yield one success and one SLOT_UNAVAILABLE", async () => {
  const results = await Promise.allSettled([book(), book(uid.patientB)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /SLOT_UNAVAILABLE/,
  );
  assert.equal(
    (await db.client.query("select count(*)::int n from public.appointments"))
      .rows[0].n,
    1,
  );
});
test("patient has no direct patient/appointment visibility; RPC returns own safe data only", async () => {
  await book();
  await book(uid.patientB, "10:00");
  assert.equal(
    (await actor(uid.patientA, "select * from public.patients")).rowCount,
    0,
  );
  assert.equal(
    (await actor(uid.patientA, "select * from public.appointments")).rowCount,
    0,
  );
  const profiles = (
    await actor(uid.patientA, "select * from public.get_my_profiles()")
  ).rows;
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, f.pa);
  assert.ok(!("notes" in profiles[0]));
  const appointments = (
    await actor(uid.patientA, "select * from public.get_my_appointments()")
  ).rows;
  assert.equal(appointments.length, 1);
  assert.ok(!("notes" in appointments[0]));
  assert.ok(!("patient_id" in appointments[0]));
});
test("tenant A cannot read tenant B or modify its patients or professionals", async () => {
  assert.deepEqual(
    (await actor(uid.adminA, "select id from public.tenants")).rows.map(
      (r) => r.id,
    ),
    [f.tA],
  );
  assert.deepEqual(
    (await actor(uid.adminA, "select id from public.professionals")).rows.map(
      (r) => r.id,
    ),
    [f.proA],
  );
  assert.equal(
    (
      await actor(
        uid.adminA,
        "update public.patients set first_name='HACK' where id=$1 returning id",
        [f.pb],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await actor(
        uid.adminA,
        "update public.professionals set first_name='HACK' where id=$1 returning id",
        [f.proB],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (await actor(uid.adminB, "select id from public.professionals")).rows[0].id,
    f.proB,
  );
});
test("anon cannot read private appointments, patients or subscriptions or book", async () => {
  for (const table of ["appointments", "patients", "subscriptions"])
    await assert.rejects(
      actor(null, `select * from public.${table}`),
      /permission denied/,
    );
  await assert.rejects(book(null), /permission denied/);
});
test("public professional and tenant projections omit internal contact and account metadata", async () => {
  const p = (
    await actor(
      null,
      "select * from public.get_public_professionals('tenant-a')",
    )
  ).rows;
  assert.equal(p.length, 1);
  assert.ok(!("email" in p[0]));
  assert.ok(!("user_id" in p[0]));
  const t = (
    await actor(
      null,
      "select * from public.get_public_tenant_by_slug('tenant-a')",
    )
  ).rows[0];
  assert.equal(t.id, f.tA);
  assert.ok(!("responsible_name" in t));
});
test("composite FK and immutable tenant prevent cross-tenant relationships", async () => {
  await assert.rejects(
    actor(
      uid.adminA,
      "insert into public.professional_schedules(tenant_id,professional_id,day_of_week,start_time,end_time,appointment_duration) values($1,$2,2,'08:00','09:00',30)",
      [f.tA, f.proB],
    ),
    /foreign key/,
  );
  await assert.rejects(
    actor(
      uid.adminA,
      "update public.professionals set tenant_id=$1 where id=$2",
      [f.tB, f.proA],
    ),
    /TENANT_ID_IMMUTABLE|row-level security/,
  );
  await assert.rejects(
    book(uid.patientA, "09:00", f.proB),
    /PROFESSIONAL_NOT_FOUND/,
  );
});
test("operator manages patients and appointments but cannot edit branding, schedules, professionals or members", async () => {
  const a = await actor(
    uid.operator,
    "select public.admin_create_appointment($1,$2,$3,$4,'08:00') as id",
    [f.tA, f.proA, f.pa, f.date],
  );
  assert.ok(a.rows[0].id);
  assert.equal(
    (
      await actor(
        uid.operator,
        "update public.patients set phone='999' where id=$1 returning id",
        [f.pa],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await actor(
        uid.operator,
        "update public.tenants set name='HACK' where id=$1 returning id",
        [f.tA],
      )
    ).rowCount,
    0,
  );
  await assert.rejects(
    actor(
      uid.operator,
      "insert into public.professionals(tenant_id,first_name,last_name,specialty) values($1,'X','Y','Z')",
      [f.tA],
    ),
    /row-level security/,
  );
  await assert.rejects(
    actor(
      uid.operator,
      "select public.manage_member($1,'patientA@example.test','TENANT_ADMIN')",
      [f.tA],
    ),
    /UNAUTHORIZED/,
  );
});
test("patient cannot change notes, identity or reactivate their profile", async () => {
  assert.equal(
    (
      await actor(
        uid.patientA,
        "update public.patients set notes='HACK' where id=$1 returning id",
        [f.pa],
      )
    ).rowCount,
    0,
  );
  await assert.rejects(
    actor(uid.adminA, "update public.patients set user_id=$1 where id=$2", [
      uid.patientB,
      f.pa,
    ]),
    /PATIENT_FIELD_NOT_EDITABLE/,
  );
  await db.client.query("update public.patients set active=false where id=$1", [
    f.pa,
  ]);
  await assert.rejects(
    actor(
      uid.patientA,
      "select public.ensure_patient_profile('tenant-a','A','B',null,'555','a@example.test')",
    ),
    /PATIENT_INACTIVE/,
  );
});
test("profile upsert is tenant-scoped and preserves staff notes", async () => {
  await actor(
    uid.patientA,
    "select public.ensure_patient_profile('tenant-a','Updated','A','123','555','a@example.test')",
  );
  assert.equal(
    (
      await db.client.query("select notes from public.patients where id=$1", [
        f.pa,
      ])
    ).rows[0].notes,
    "SECRET A",
  );
  await actor(
    uid.patientA,
    "select public.ensure_patient_profile('tenant-b','Updated','B','999','555','a@example.test')",
  );
  assert.equal(
    (await actor(uid.patientA, "select * from public.get_my_profiles()"))
      .rowCount,
    2,
  );
});
test("reschedule validates availability and rolls back on failure", async () => {
  const a = await book(),
    b = await book(uid.patientB, "10:00");
  await assert.rejects(reschedule(a, "10:00"), /SLOT_UNAVAILABLE/);
  let row = (
    await db.client.query("select * from public.appointments where id=$1", [a])
  ).rows[0];
  assert.equal(row.start_time, "09:00:00");
  assert.equal(row.status, "CONFIRMED");
  await reschedule(a, "11:00");
  row = (
    await db.client.query("select * from public.appointments where id=$1", [a])
  ).rows[0];
  assert.equal(row.start_time, "11:00:00");
  assert.ok(b);
  await reschedule(a, "11:00");
});
test("patient cannot cancel another patient appointment", async () => {
  const a = await book();
  await assert.rejects(
    actor(uid.patientB, "select public.cancel_own_appointment($1)", [a]),
    /APPOINTMENT_NOT_CANCELLABLE/,
  );
});
test("cancelled appointment cannot be reactivated through status RPC", async () => {
  const a = await book();
  await actor(uid.patientA, "select public.cancel_own_appointment($1)", [a]);
  await assert.rejects(
    actor(
      uid.adminA,
      "select public.admin_set_appointment_status($1,'CONFIRMED')",
      [a],
    ),
    /REQUIRES_RESCHEDULE/,
  );
  await reschedule(a, "09:00");
});
test("suspension blocks private operational access and public availability but allows subscription read", async () => {
  await actor(
    uid.platform,
    "select public.platform_update_tenant($1,true,'SUSPENDED',$2)",
    [f.tA, f.plan],
  );
  assert.equal((await slots()).rowCount, 0);
  assert.equal(
    (await actor(uid.adminA, "select * from public.patients")).rowCount,
    0,
  );
  assert.equal(
    (await actor(uid.adminA, "select * from public.subscriptions")).rowCount,
    1,
  );
  await assert.rejects(book(), /SUBSCRIPTION_INACTIVE/);
  await assert.rejects(
    actor(
      uid.adminA,
      "insert into public.patients(tenant_id,first_name,last_name) values($1,'A','B')",
      [f.tA],
    ),
    /row-level security/,
  );
});
test("expired trial and inactive tenant cannot operate", async () => {
  await db.client.query(
    "update public.subscriptions set status='TRIALING',trial_ends_at=now()-interval '1 minute' where tenant_id=$1",
    [f.tA],
  );
  assert.equal((await slots()).rowCount, 0);
  await db.client.query("update public.tenants set active=false where id=$1", [
    f.tA,
  ]);
  await assert.rejects(book(), /TENANT_INACTIVE/);
});
test("last admin protected and member management cannot enumerate other tenants", async () => {
  await assert.rejects(
    actor(
      uid.adminA,
      "select public.manage_member($1,'adminA@example.test','OPERATOR')",
      [f.tA],
    ),
    /LAST_ADMIN_REQUIRED/,
  );
  await assert.rejects(
    actor(
      uid.adminA,
      "select public.manage_member($1,'adminA@example.test','TENANT_ADMIN',false)",
      [f.tA],
    ),
    /LAST_ADMIN_REQUIRED/,
  );
  await assert.rejects(
    actor(uid.adminA, "select * from public.get_tenant_members($1)", [f.tB]),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    actor(
      uid.adminA,
      "select public.manage_member($1,'missing@example.test','OPERATOR')",
      [f.tA],
    ),
    /REGISTERED_USER_REQUIRED/,
  );
  await actor(
    uid.adminA,
    "select public.manage_member($1,'patientA@example.test','TENANT_ADMIN')",
    [f.tA],
  );
  await assert.rejects(
    actor(
      uid.adminA,
      "select public.manage_member($1,'patientB@example.test','TENANT_ADMIN')",
      [f.tA],
    ),
    /PLAN_LIMIT_REACHED/,
  );
});
test("professional quota holds under concurrent writes", async () => {
  await db.client.query(
    "update public.plans set max_professionals=2 where id=$1",
    [f.plan],
  );
  const insert = () =>
    actor(
      uid.adminA,
      "insert into public.professionals(tenant_id,first_name,last_name,specialty) values($1,'Added','Pro','General')",
      [f.tA],
    );
  const r = await Promise.allSettled([insert(), insert()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.match(
    r.find((x) => x.status === "rejected").reason.message,
    /PLAN_LIMIT_REACHED/,
  );
});
test("schedule exclusion protects concurrent overlapping intervals", async () => {
  const insert = (start, end) =>
    actor(
      uid.adminA,
      "insert into public.professional_schedules(tenant_id,professional_id,day_of_week,start_time,end_time,appointment_duration) values($1,$2,2,$3,$4,30)",
      [f.tA, f.proA, start, end],
    );
  const r = await Promise.allSettled([
    insert("08:00", "10:00"),
    insert("09:00", "11:00"),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
});
test("database excludes different-start overlapping appointments", async () => {
  await book();
  await assert.rejects(
    db.client.query(
      "insert into public.appointments(tenant_id,professional_id,patient_id,appointment_date,start_time,end_time) values($1,$2,$3,$4,'09:15','09:45')",
      [f.tA, f.proA, f.pa, f.date],
    ),
    /exclusion constraint/,
  );
});
test("near-midnight slots terminate and never wrap to next day", async () => {
  await db.client.query(
    "insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type,start_time,end_time,appointment_duration) values($1,$2,$3,'CUSTOM_HOURS','23:00','23:59',30)",
    [f.tA, f.proA, f.date],
  );
  const r = await slots();
  assert.equal(r.rowCount, 1);
  assert.equal(r.rows[0].end_time, "23:30:00");
});
test("past dates return no availability; tenant timezone is validated", async () => {
  assert.equal((await slots(f.proA, "2000-01-01")).rowCount, 0);
  await assert.rejects(
    actor(
      uid.adminA,
      "update public.tenants set timezone='invalid/zone' where id=$1",
      [f.tA],
    ),
    /INVALID_TIMEZONE/,
  );
});
test("monthly availability and verified hostname resolve safely", async () => {
  const r = await actor(
    null,
    "select * from public.get_available_days($1,$2,$3)",
    ["tenant-a", f.proA, f.date],
  );
  assert.ok(r.rows.some((x) => x.day === f.date));
  await db.client.query(
    "insert into public.tenant_domains(tenant_id,hostname,verified) values($1,'clinic.example.test',false)",
    [f.tA],
  );
  assert.equal(
    (
      await actor(
        null,
        "select * from public.get_public_tenant_by_hostname('clinic.example.test')",
      )
    ).rowCount,
    0,
  );
  await db.client.query("update public.tenant_domains set verified=true");
  assert.equal(
    (
      await actor(
        null,
        "select * from public.get_public_tenant_by_hostname('clinic.example.test')",
      )
    ).rows[0].slug,
    "tenant-a",
  );
});
test("platform RPC is restricted and never exposes patient details", async () => {
  await assert.rejects(
    actor(uid.adminA, "select public.platform_overview()"),
    /UNAUTHORIZED/,
  );
  const r = (
    await actor(uid.platform, "select public.platform_overview() data")
  ).rows[0].data;
  assert.equal(r.tenants.length, 2);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.equal(
    (await actor(uid.platform, "select * from public.patients")).rowCount,
    0,
  );
});
test("storage write requires matching tenant admin; operator and other tenant denied", async () => {
  const insert = (user, path) =>
    actor(
      user,
      "insert into storage.objects(bucket_id,name) values('tenant-assets',$1)",
      [path],
    );
  await insert(uid.adminA, `${f.tA}/logo.png`);
  await assert.rejects(
    insert(uid.adminA, `${f.tB}/logo.png`),
    /row-level security/,
  );
  await assert.rejects(
    insert(uid.operator, `${f.tA}/other.png`),
    /row-level security/,
  );
  await assert.rejects(
    insert(uid.adminA, "invalid/logo.png"),
    /row-level security/,
  );
  await assert.rejects(
    actor(uid.adminA, "update public.tenants set logo_path=$1 where id=$2", [
      `${f.tB}/logo.png`,
      f.tA,
    ]),
    /tenant_logo_path/,
  );
});
test("atomic registration creates tenant, admin and 14-day trial; duplicate slug does not leave partial data", async () => {
  const r = await actor(
    uid.patientA,
    "select * from public.register_tenant('New clinic','new-clinic','Responsible','555','clinic@example.test')",
  );
  const id = r.rows[0].tenant_id;
  assert.equal(
    (
      await db.client.query(
        "select count(*)::int n from public.tenant_members where tenant_id=$1 and role='TENANT_ADMIN'",
        [id],
      )
    ).rows[0].n,
    1,
  );
  const s = (
    await db.client.query(
      "select trial_ends_at-starts_at as duration from public.subscriptions where tenant_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(s.duration.days, 14);
  await assert.rejects(
    actor(
      uid.patientA,
      "select * from public.register_tenant('New clinic','new-clinic','Responsible','555','clinic@example.test')",
    ),
    /SLUG_TAKEN/,
  );
  assert.equal(
    (
      await db.client.query(
        "select count(*)::int n from public.tenants where slug='new-clinic'",
      )
    ).rows[0].n,
    1,
  );
});
test("seed is reproducible and includes requested demo professionals", async () => {
  const seed = await readFile("supabase/seed.sql", "utf8");
  await db.client.query(seed);
  await db.client.query(seed);
  const r = await actor(
    null,
    "select * from public.get_public_professionals('clinica-demo')",
  );
  assert.equal(r.rowCount, 3);
});
test("staff edits reason and notes via RPC while patients cannot invoke it", async () => {
  const id = await book();
  await actor(
    uid.operator,
    "select public.admin_update_appointment_details($1,'Updated','Internal')",
    [id],
  );
  assert.equal(
    (
      await db.client.query(
        "select notes from public.appointments where id=$1",
        [id],
      )
    ).rows[0].notes,
    "Internal",
  );
  await assert.rejects(
    actor(
      uid.patientA,
      "select public.admin_update_appointment_details($1,'HACK','HACK')",
      [id],
    ),
    /UNAUTHORIZED/,
  );
});
test("patient cancellation racing reschedule preserves one consistent state", async () => {
  const id = await book();
  const r = await Promise.allSettled([
    reschedule(id, "10:00"),
    actor(uid.patientA, "select public.cancel_own_appointment($1)", [id]),
  ]);
  assert.ok(r.every((x) => x.status === "fulfilled"));
  const a = (
    await db.client.query("select * from public.appointments where id=$1", [id])
  ).rows[0];
  assert.equal(a.start_time, "10:00:00");
  assert.ok(["CONFIRMED", "CANCELLED"].includes(a.status));
});
test("a slot ending exactly at midnight keeps a valid 24:00 endpoint", async () => {
  await db.client.query(
    "insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type,start_time,end_time,appointment_duration) values($1,$2,$3,'CUSTOM_HOURS','23:00','24:00',30)",
    [f.tA, f.proA, f.date],
  );
  const available = await slots();
  assert.equal(available.rowCount, 2);
  assert.equal(available.rows[1].end_time, "24:00:00");
  const id = await book(uid.patientA, "23:30");
  assert.equal(
    (
      await db.client.query(
        "select end_time from public.appointments where id=$1",
        [id],
      )
    ).rows[0].end_time,
    "24:00:00",
  );
});
test("daylight-saving gaps are not offered as bookable local times", async () => {
  await db.client.query(
    "update public.tenants set timezone='America/New_York' where id=$1",
    [f.tA],
  );
  const date = (
    await db.client.query(
      "with m as(select make_date(extract(year from now())::int+1,3,1) d) select (d+(7-extract(dow from d)::int)%7+7)::date as d from m",
    )
  ).rows[0].d;
  await db.client.query(
    "insert into public.schedule_exceptions(tenant_id,professional_id,exception_date,type,start_time,end_time,appointment_duration) values($1,$2,$3,'CUSTOM_HOURS','01:00','04:00',30)",
    [f.tA, f.proA, date],
  );
  assert.deepEqual(
    (await slots(f.proA, date)).rows.map((s) => s.start_time),
    ["01:00:00", "03:00:00", "03:30:00"],
  );
});
