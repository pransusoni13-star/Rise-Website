create extension if not exists pgcrypto;

create table if not exists public.waitlist (
  waitlist_number integer primary key,
  name text not null,
  email text not null,
  confirmation_code text not null unique,
  joined_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_status text not null default 'pending',
  last_email_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_email_lower_unique
on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create sequence if not exists public.waitlist_number_seq
start with 39
increment by 1
minvalue 39;

create or replace function public.get_or_create_waitlist_number()
returns integer
language sql
security definer
set search_path = public
as $$
  select nextval('public.waitlist_number_seq')::integer;
$$;

revoke all
on function public.get_or_create_waitlist_number()
from public, anon, authenticated;

grant execute
on function public.get_or_create_waitlist_number()
to service_role;