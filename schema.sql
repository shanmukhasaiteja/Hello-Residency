-- Hello Residency schema. Run once in the Supabase SQL Editor.
-- Mirrors section 4 of PROJECT.md. All authorization lives in Row Level Security.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  program text,
  cohort text,
  research_topic text,
  bio text,
  tags text[] not null default '{}',
  open_to text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact text not null check (char_length(contact) <= 200)
);

create table public.intros (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  reply text check (reply is null or char_length(reply) <= 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  place text not null check (char_length(place) <= 120),
  when_at timestamptz not null,
  details text check (details is null or char_length(details) <= 400),
  created_at timestamptz not null default now()
);

create table public.meetup_joins (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (meetup_id, user_id)
);

create index on public.intros (to_id);
create index on public.intros (from_id);
create index on public.meetups (when_at);

-- Data API access. Signed-in users only; RLS below decides which rows.
revoke all on public.profiles, public.contacts, public.intros, public.meetups, public.meetup_joins from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert on public.intros to authenticated;
grant select, insert, delete on public.meetups to authenticated;
grant select, insert, delete on public.meetup_joins to authenticated;

-- Row Level Security (required)

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.intros enable row level security;
alter table public.meetups enable row level security;
alter table public.meetup_joins enable row level security;

-- profiles: readable by any signed-in user, writable only by the owner
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- contacts: owner, or someone with an accepted intro to/from the owner
create policy "contacts read" on public.contacts for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.intros i
    where i.status = 'accepted'
      and ((i.from_id = auth.uid() and i.to_id = contacts.user_id)
        or (i.to_id = auth.uid() and i.from_id = contacts.user_id))
  )
);
create policy "contacts insert own" on public.contacts for insert to authenticated with check (user_id = auth.uid());
create policy "contacts update own" on public.contacts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contacts delete own" on public.contacts for delete to authenticated using (user_id = auth.uid());

-- intros: only the two people involved; recipients may only change status and reply
create policy "intros read" on public.intros for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
create policy "intros send" on public.intros for insert to authenticated with check (from_id = auth.uid() and status = 'pending');
create policy "intros respond" on public.intros for update to authenticated using (to_id = auth.uid()) with check (to_id = auth.uid());
revoke update on public.intros from authenticated;
grant update (status, reply) on public.intros to authenticated;

-- meetups
create policy "meetups read" on public.meetups for select to authenticated using (true);
create policy "meetups insert" on public.meetups for insert to authenticated with check (host_id = auth.uid());
create policy "meetups delete" on public.meetups for delete to authenticated using (host_id = auth.uid());
create policy "joins read" on public.meetup_joins for select to authenticated using (true);
create policy "joins insert" on public.meetup_joins for insert to authenticated with check (user_id = auth.uid());
create policy "joins delete" on public.meetup_joins for delete to authenticated using (user_id = auth.uid());

-- Nearby: opt-in check-ins that expire after 2 hours.
-- Coordinates are never readable by other users. Only the nearby() function reads them,
-- and it returns distance rounded up to 50 m buckets, only to people who are checked in too.
create table public.checkins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  spot text check (spot is null or char_length(spot) <= 60),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  check (lat is not null or spot is not null)
);

revoke all on public.checkins from anon;
grant select, insert, update, delete on public.checkins to authenticated;
alter table public.checkins enable row level security;
create policy "checkins read own" on public.checkins for select to authenticated using (user_id = auth.uid());
create policy "checkins insert own" on public.checkins for insert to authenticated with check (user_id = auth.uid());
create policy "checkins update own" on public.checkins for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "checkins delete own" on public.checkins for delete to authenticated using (user_id = auth.uid());

-- The server clock decides when a check-in expires, not the client.
create function public.touch_checkin() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger checkins_touch before insert or update on public.checkins
  for each row execute function public.touch_checkin();

create function public.nearby()
returns table (user_id uuid, distance_m integer, spot text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (
    select c.lat, c.lng from public.checkins c
    where c.user_id = auth.uid() and c.updated_at > now() - interval '2 hours'
  )
  select c.user_id,
         case when d.dist is null then null else (greatest(1, ceil(d.dist / 50.0)) * 50)::integer end,
         c.spot,
         c.updated_at
  from me
  cross join public.checkins c
  cross join lateral (
    select case when me.lat is null or c.lat is null then null
      else 2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(c.lat - me.lat) / 2), 2)
        + cos(radians(me.lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - me.lng) / 2), 2)
      ))) end as dist
  ) d
  where c.user_id <> auth.uid()
    and c.updated_at > now() - interval '2 hours'
    and (d.dist is null or d.dist <= 5000)
  order by d.dist nulls last, c.updated_at desc
  limit 100;
$$;
revoke execute on function public.nearby() from public, anon;
grant execute on function public.nearby() to authenticated;

-- Social: photos, icebreaker prompt, this-or-that, block and report.

alter table public.profiles
  add column avatar_path text,
  add column prompt text check (prompt is null or char_length(prompt) <= 80),
  add column prompt_answer text check (prompt_answer is null or char_length(prompt_answer) <= 150),
  add column this_or_that text[] not null default '{}' check (cardinality(this_or_that) <= 5),
  -- Photos may only point at the owner's own folder in the avatars bucket.
  add constraint profiles_avatar_path_own check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9._-]{1,80}$'));

-- Profile photos: public bucket, 2 MB, images only, each user writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "avatars read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- Blocks: only the blocker can see their own block list.
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on public.blocks (blocked_id);
revoke all on public.blocks from anon;
grant select, insert, delete on public.blocks to authenticated;
alter table public.blocks enable row level security;
create policy "blocks read own" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks insert own" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks delete own" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Reports: write-only for users; organizers read them in the Supabase dashboard.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
revoke all on public.reports from anon;
grant insert on public.reports to authenticated;
alter table public.reports enable row level security;
create policy "reports insert own" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- Helpers. Security definer so a blocked person's queries can respect a block they cannot see.
create function public.blocked_me(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks b where b.blocker_id = other and b.blocked_id = auth.uid());
$$;
create function public.blocked_either(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;
revoke execute on function public.blocked_me(uuid) from public, anon;
revoke execute on function public.blocked_either(uuid, uuid) from public, anon;
grant execute on function public.blocked_me(uuid) to authenticated;
grant execute on function public.blocked_either(uuid, uuid) to authenticated;

-- Someone who blocked you disappears for you. (The blocker hides the people they block in the app.)
drop policy "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or not public.blocked_me(id));

-- No hi's, intros or contacts across a block, in either direction.
drop policy "intros send" on public.intros;
create policy "intros send" on public.intros for insert to authenticated
  with check (from_id = auth.uid() and status = 'pending' and not public.blocked_either(from_id, to_id));
drop policy "intros read" on public.intros;
create policy "intros read" on public.intros for select to authenticated
  using ((from_id = auth.uid() or to_id = auth.uid()) and not public.blocked_either(from_id, to_id));
drop policy "contacts read" on public.contacts;
create policy "contacts read" on public.contacts for select to authenticated using (
  user_id = auth.uid()
  or (
    not public.blocked_either(auth.uid(), contacts.user_id)
    and exists (
      select 1 from public.intros i
      where i.status = 'accepted'
        and ((i.from_id = auth.uid() and i.to_id = contacts.user_id)
          or (i.to_id = auth.uid() and i.from_id = contacts.user_id))
    )
  )
);

-- Nearby skips blocked people in either direction.
create or replace function public.nearby()
returns table (user_id uuid, distance_m integer, spot text, checked_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (
    select c.lat, c.lng from public.checkins c
    where c.user_id = auth.uid() and c.updated_at > now() - interval '2 hours'
  )
  select c.user_id,
         case when d.dist is null then null else (greatest(1, ceil(d.dist / 50.0)) * 50)::integer end,
         c.spot,
         c.updated_at
  from me
  cross join public.checkins c
  cross join lateral (
    select case when me.lat is null or c.lat is null then null
      else 2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(c.lat - me.lat) / 2), 2)
        + cos(radians(me.lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - me.lng) / 2), 2)
      ))) end as dist
  ) d
  where c.user_id <> auth.uid()
    and c.updated_at > now() - interval '2 hours'
    and (d.dist is null or d.dist <= 5000)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = c.user_id)
         or (b.blocker_id = c.user_id and b.blocked_id = auth.uid())
    )
  order by d.dist nulls last, c.updated_at desc
  limit 100;
$$;

-- Final table grants: exactly what the app uses, nothing more. RLS still decides which rows.
-- (Supabase's default grants give every role full access, so start from nothing.)
revoke all on public.profiles, public.contacts, public.intros, public.meetups, public.meetup_joins, public.checkins, public.blocks, public.reports from authenticated, anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert on public.intros to authenticated;
grant update (status, reply) on public.intros to authenticated;
grant select, insert, delete on public.meetups to authenticated;
grant select, insert, delete on public.meetup_joins to authenticated;
grant select, insert, update, delete on public.checkins to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant insert on public.reports to authenticated;
