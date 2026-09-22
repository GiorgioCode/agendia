create table if not exists public.subscription_payments (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    subscription_id uuid not null references public.subscriptions(id) on delete cascade,
    plan_id uuid not null references public.plans(id),
    user_id uuid references auth.users(id) on delete set null,
    provider text not null default 'mercadopago',
    provider_preference_id text,
    provider_payment_id text,
    status text not null default 'PENDING',
    amount numeric(12,2) not null,
    currency text not null default 'ARS',
    checkout_url text,
    raw_payload jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint subscription_payments_status_check
        check (status in ('PENDING','APPROVED','REJECTED','CANCELLED','REFUNDED','IN_PROCESS'))
);

create index if not exists subscription_payments_tenant_idx
    on public.subscription_payments (tenant_id, created_at desc);

create unique index if not exists subscription_payments_provider_payment_unique
    on public.subscription_payments (provider, provider_payment_id)
    where provider_payment_id is not null;

drop trigger if exists trg_subscription_payments_updated_at on public.subscription_payments;
create trigger trg_subscription_payments_updated_at
before update on public.subscription_payments
for each row execute function public.set_updated_at();

alter table public.subscription_payments enable row level security;

drop policy if exists subscription_payments_member_read on public.subscription_payments;
create policy subscription_payments_member_read
on public.subscription_payments
for select
to authenticated
using (
    exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = subscription_payments.tenant_id
          and tm.user_id = auth.uid()
          and tm.active = true
          and tm.role in ('TENANT_ADMIN','OPERATOR')
    )
);

grant select on public.subscription_payments to authenticated;
