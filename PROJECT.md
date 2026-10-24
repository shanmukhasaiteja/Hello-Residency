# Hello Residency: Project Brief

> Drop this file in the repo root (for Claude Code you can also copy it to `CLAUDE.md`; for Cursor, put it in `.cursor/rules/project.md` or just reference it with `@PROJECT.md`). It is written so an AI coding agent can build and extend the app without further context.

## 1. What we're building

A web app that helps PhD students at a residency meet each other. Residencies are short, intense windows where hundreds of people who barely know each other need to find the right people fast. The app replaces awkward small talk with profiles, smart suggestions, and low-pressure introductions.

- **Audience:** 500+ PhD residency students, mostly on phones during the event
- **Primary job:** social networking. Help people find and meet others with shared interests
- **Secondary job:** organize casual meetups
- **Time constraint:** first working version must ship fast (a working prototype exists, see section 9)

## 2. Core user flow

1. Student opens the link and creates an account (email + password, no email verification)
2. Student fills in a "name tag": name, program, cohort, research topic, bio, interest tags, what they're open to, and a private contact method
3. Student browses **Discover**: search, filters, and a "People like you" row
4. Student opens someone's name tag and sends a short **hi** message
5. Recipient sees it in **Inbox** and accepts or declines (with an optional reply)
6. On accept, both sides can see each other's private contact details
7. Anyone can post or join a casual **Meetup**

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Front end | Vite + React + TypeScript | Mobile-first, no SSR needed |
| Styling | Tailwind CSS or plain CSS with the tokens in section 7 | Keep one approach, don't mix |
| Backend | Supabase (Postgres, Auth, Row Level Security) | No custom server |
| Client SDK | `@supabase/supabase-js` v2 | Pin the version |
| Hosting | Vercel (static) | Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

**Rules**
- All authorization lives in Postgres Row Level Security. Never rely on front-end checks for privacy.
- The Supabase anon key is public by design. Never ship the `service_role` key to the browser.
- Escape or safely render all user-generated text. Never use `dangerouslySetInnerHTML` with user content.
- Don't render contact details as clickable links without validating the scheme (avoid `javascript:` URLs).

## 4. Data model

Run in the Supabase SQL Editor. Same schema as `schema.sql`.

```sql
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
```

### Row Level Security (required)

```sql
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
```

**Supabase dashboard setting:** Authentication, Sign In / Providers, Email, turn **off** "Confirm email". The free built-in email sender is rate-limited to a few emails per hour, which breaks sign-up for 500+ users. Re-enable it later with a custom SMTP provider if you want verified emails.

## 5. Features and acceptance criteria

### 5.1 Auth
- Email + password sign up and sign in; session persists across reloads
- Sign out from the header
- Errors from Supabase are shown inline in plain language
- **Done when:** a new user can sign up and land on the profile setup screen in under 30 seconds

### 5.2 Profile ("name tag")
- Fields: name (required), program, cohort, research topic, bio (400 chars), tags (comma-separated, max 8, lowercased and deduplicated), open-to (multi-select), contact (private)
- Open-to options: Coffee chat, Study buddy, Research collab, Writing partner, Feedback swap, Just saying hi
- First sign-in forces profile creation before anything else
- Contact is stored in `contacts`, not `profiles`, so it never leaks through profile reads
- **Done when:** editing the profile updates the visible badge immediately

### 5.3 Discover
- Search across name, program, cohort, topic, bio, and tags (client-side is fine at this scale)
- Filter chips: one "open to" value and one popular tag at a time (toggle off by clicking again)
- **People like you:** top 6 not-yet-contacted users ranked by score
  - `score = 2 * sharedTags + sharedOpenTo + (sameCohort ? 1 : 0) + (sameProgram ? 1 : 0)`
  - Hidden while searching or filtering; hide users with score 0
- Each card shows a status: Say hi / Hi sent / Wants to say hi / Connected
- **Done when:** with 500 profiles, search feels instant and the page stays responsive on a mid-range phone

### 5.4 Say hi and Inbox
- Opening a card shows the full profile, shared tags highlighted, and a pre-filled editable message (mentions a shared tag if one exists)
- One intro per direction per pair (DB unique constraint). Show a friendly message on duplicate (`23505`)
- Inbox sections: Waiting for your reply (accept or "Not now" with optional reply), Connections (shows contact), Waiting on them
- A declined intro appears to the sender as still "sent" (no rejection notice)
- Inbox tab shows a count badge for pending incoming intros
- **Done when:** Alice sends hi, Bob accepts, and both see each other's contact details

### 5.5 Meetups
- Post: title, place, date and time, optional details; host auto-joins
- List upcoming meetups (hide ones that started more than 3 hours ago); join and leave; host can delete
- Show host, count going, and first names of up to 5 attendees
- **Done when:** posting and joining are reflected for other users on their next refresh

### 5.6 Freshness
- No realtime required for v1. Reload data on tab changes and poll every 30 seconds, skipping the refresh while the user is typing or a modal is open
- Stretch: switch to Supabase Realtime subscriptions on `intros` and `meetup_joins`

## 6. Suggested file structure (Vite + React + TS)

```
hello-residency/
  PROJECT.md
  schema.sql
  .env.example            # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  index.html
  src/
    main.tsx
    App.tsx               # auth gate, tab shell
    lib/supabase.ts       # createClient from env
    lib/match.ts          # score(), relation(), parseTags()
    lib/types.ts          # Profile, Intro, Meetup, Contact
    hooks/useData.ts      # loads profiles/intros/contacts/meetups/joins, 30s refresh
    components/
      AuthCard.tsx
      NameTag.tsx         # the badge card
      ProfileModal.tsx
      ProfileForm.tsx
      Discover.tsx
      Inbox.tsx
      Meetups.tsx
      Toast.tsx
    styles/tokens.css
```

## 7. Design direction

The identity is a **conference name tag**: each student is a badge with a punched lanyard slot, a colored band, "Hello, I'm" and their name. That badge is the one memorable element; keep everything else quiet.

**Color tokens**

| Token | Value | Use |
|---|---|---|
| paper | `#F2F4F7` | page background |
| ink | `#15233B` | text, primary buttons |
| soft | `#51607A` | secondary text |
| line | `#D3DAE5` | borders |
| teal | `#0B7A7C` | brand, links of interest |
| badge bands | `#0B7A7C`, `#F4B63F` (dark text), `#6B4C9A`, `#B93A4C`, `#2F5DA8` | band color chosen by hashing cohort (fallback program, then name) |
| danger / ok | `#B93A4C` / `#1C7A4A` | errors / success |

**Type:** Bricolage Grotesque (600/800) for headings and names, DM Sans for body. Always include system fallbacks.

**Copy rules:** plain, sentence case, active verbs ("Say hi", "Post meetup", "Save changes"). Error messages say what went wrong and how to fix it. Empty states invite an action ("You are the first one here. Share the link so others can join.").

**Quality floor:** mobile-first (grid `minmax(250px, 1fr)`), visible keyboard focus, `prefers-reduced-motion` respected, text contrast of at least 4.5:1, modals close on Escape and overlay click and trap focus.

## 8. Conventions for the coding agent

- TypeScript strict mode; no `any` for DB rows (define types in `lib/types.ts`)
- Keep Supabase calls in hooks or a small data layer, not scattered through components
- Handle every Supabase `{ error }` result and show a toast; never swallow errors
- Small, reviewable commits; one feature per commit
- Don't add dependencies without a clear reason; prefer the standard library and the Supabase SDK
- After each feature, manually test with two browser profiles (two users) before moving on
- Never commit real keys; use `.env.local` and keep `.env.example` current

## 9. Existing prototype

`index.html` in this folder is a working single-file prototype (vanilla JS + `supabase-js` from a CDN) that already implements every feature in section 5. Two ways to proceed:

1. **Keep it:** paste your Supabase URL and anon key at the top of the script and deploy the folder as-is
2. **Port it:** have the agent migrate it to the React + TypeScript structure in section 6 while keeping behavior and visuals identical, using the prototype as the reference implementation

## 10. Setup checklist

- [ ] Create a Supabase project
- [ ] Run `schema.sql` in the SQL Editor
- [ ] Turn off "Confirm email" (Authentication, Sign In / Providers, Email)
- [ ] Copy Project URL and anon key from Project Settings, API
- [ ] Add them to `.env.local` (React) or the top of `index.html` (prototype)
- [ ] Deploy to Vercel or Netlify and add the same env vars there
- [ ] Sign up with two accounts and test the full flow (hi, accept, contact reveal, meetup)

## 11. Roadmap

**Next (high value, small effort)**
1. Profile photos (Supabase Storage bucket, public read, owner write, 2 MB image limit)
2. Email notifications for new intros (Supabase Edge Function + Resend)
3. "Random match of the day" on Discover

**Later**
4. Direct messaging after connecting (a `messages` table with RLS limited to the connected pair, plus Realtime)
5. Interest group chats or channels
6. Residency schedule tab with RSVPs
7. Admin view: moderate profiles and meetups, export a participant list, optional invite code or allowed email domain
8. Report and block: a `blocks` table, and RLS hiding blocked users from each other
9. Analytics: connections made per day, most popular tags

## 12. Risks and open questions

- **Open sign-up:** any email can join. If this becomes a problem, add an invite code or restrict by email domain
- **Spam intros:** consider a daily cap per user (enforce with a Postgres trigger, not only in the UI)
- **Privacy:** profiles are visible to every signed-in user by design; make that clear on the sign-up screen
- **Scale:** loading all profiles is fine up to a few thousand; past that, add server-side search and pagination
- **Free-tier limits:** check Supabase project pause and database size limits before the residency starts
