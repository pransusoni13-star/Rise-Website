-- RISE WAITLIST DATABASE
-- Run this entire script in Supabase SQL Editor.
--
-- IMPORTANT:
-- Existing Formspree signups cannot be imported automatically from this file.
-- Import your existing applicants into rise_waitlist BEFORE launching the new form.
-- Give each imported person their original waitlist_number.

create extension if not exists pgcrypto;

create sequence if not exists rise_waitlist_number_seq start 1;

create table if not exists public.rise_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  email text not null,
  waitlist_number bigint not null unique,
  confirmation_code text not null unique,
  email_sent boolean not null default false,
  created_at timestamptz not null default now(),
  constraint rise_waitlist_email_unique unique (email)
);

create index if not exists rise_waitlist_created_at_idx
  on public.rise_waitlist (created_at);

create or replace function public.generate_rise_confirmation_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  loop
    code := 'RISE-' ||
      upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 5));

    exit when not exists (
      select 1
      from public.rise_waitlist
      where confirmation_code = code
    );
  end loop;

  return code;
end;
$$;

create or replace function public.register_waitlist(
  p_name text,
  p_email text
)
returns table (
  success boolean,
  waitlist_number bigint,
  confirmation_code text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  next_number bigint;
  new_code text;
begin
  normalized_email := lower(trim(p_email));

  if length(trim(p_name)) < 2 then
    return query select false, null::bigint, null::text, 'Please enter your name.';
    return;
  end if;

  if not (normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    return query select false, null::bigint, null::text, 'Please enter a valid email address.';
    return;
  end if;

  if exists (
    select 1 from public.rise_waitlist
    where email = normalized_email
  ) then
    return query select false, null::bigint, null::text,
      'That email is already on the RISE waitlist.';
    return;
  end if;

  next_number := nextval('rise_waitlist_number_seq');
  new_code := public.generate_rise_confirmation_code();

  insert into public.rise_waitlist (
    name,
    email,
    waitlist_number,
    confirmation_code
  )
  values (
    trim(p_name),
    normalized_email,
    next_number,
    new_code
  );

  return query select true, next_number, new_code, 'Signup successful.';
end;
$$;

-- The browser should NOT be allowed to read/write this table directly.
revoke all on table public.rise_waitlist from anon, authenticated;

-- The browser only calls the registration RPC through your server.
revoke all on function public.register_waitlist(text, text) from public, anon, authenticated;
grant execute on function public.register_waitlist(text, text) to service_role;
