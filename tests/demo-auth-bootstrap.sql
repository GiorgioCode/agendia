-- Only for the isolated SQL test harness. Supabase owns these columns in production.
alter table auth.users
    add column instance_id uuid,
    add column aud text,
    add column role text,
    add column encrypted_password text,
    add column email_confirmed_at timestamptz,
    add column raw_app_meta_data jsonb,
    add column raw_user_meta_data jsonb,
    add column is_super_admin boolean,
    add column created_at timestamptz,
    add column updated_at timestamptz,
    add column confirmation_token text,
    add column recovery_token text,
    add column email_change_token_new text,
    add column email_change text,
    add column email_change_token_current text,
    add column email_change_confirm_status smallint,
    add column phone_change text,
    add column phone_change_token text,
    add column reauthentication_token text,
    add column is_sso_user boolean,
    add column is_anonymous boolean;
create table auth.identities (
    id uuid primary key,
    provider_id text not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    identity_data jsonb not null,
    provider text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    unique (provider_id, provider)
);
