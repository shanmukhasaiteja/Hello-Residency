# Hello Residency

A mobile-first web app that helps PhD residency students meet each other: make a name tag, find people with shared interests, say hi, and join casual meetups. Full brief in [PROJECT.md](PROJECT.md).

Stack: Vite + React + TypeScript, plain CSS tokens, Supabase (Postgres, Auth, Row Level Security). No custom server.

## Setup

1. Create a Supabase project.
2. Run [`schema.sql`](schema.sql) in the Supabase SQL Editor (tables, indexes and RLS policies).
3. In Authentication, Sign In / Providers, Email, turn **off** "Confirm email". The built-in sender is rate-limited and will block sign-ups for 500+ people.
4. Copy `.env.example` to `.env.local` and fill in the Project URL and anon key (Project Settings, API). Never use the `service_role` key.
5. `npm install` then `npm run dev`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests for matching, tags, relations and safe contact links |

## Deploy (Vercel)

Import the repo, keep the Vite defaults (build `npm run build`, output `dist`), and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.

## How it is put together

```
src/
  App.tsx               auth gate, forced profile setup, tab shell
  lib/supabase.ts       client from env vars
  lib/types.ts          row types + typed Database for supabase-js
  lib/match.ts          score(), relation(), parseTags(), suggestions, safe contact hrefs
  lib/errors.ts         Supabase errors in plain language
  hooks/useSession.ts   auth session
  hooks/useData.ts      all reads and writes; 30s polling, paused while typing or a modal is open
  components/           AuthCard, NameTag, ProfileForm, ProfileModal, Discover, Inbox, Meetups, Modal, Toast
  styles/               tokens.css (section 7 palette) and app.css
```

- Privacy is enforced by RLS. Contact details live in `contacts` and are only returned to the owner or someone with an accepted intro.
- User text is rendered as React text, never HTML. Contacts become links only for `mailto:`, `tel:`, `http:` and `https:`.
- Supabase returns at most 1000 rows per query by default. That covers the residency; past a few thousand profiles, add server-side search and pagination.

## Testing the full flow

Sign up with two accounts in two browser profiles. Alice says hi to Bob, Bob accepts in Inbox, and both see each other's contact. Post a meetup as one user and join it as the other (visible on the next refresh, at most 30 seconds).
