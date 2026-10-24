# Hello Residency

A mobile-first web app that helps PhD residency students meet each other: make a name tag, find people with shared interests, say hi, and join casual meetups. Full brief in [PROJECT.md](PROJECT.md).

Stack: Vite + React + TypeScript, plain CSS tokens, Supabase (Postgres, Auth, Row Level Security). No custom server.

## Features

- **Name tags** with a photo, interests, what you're open to, an icebreaker prompt, and a private contact
- **This or that**: five quick picks; profiles show how many you agree on, and agreements count toward matching
- **Discover**: search, filters, "People like you", and a **match of the day** that changes at midnight
- **Nearby**: opt-in check-in ("Library café, 2nd floor", plus optional location) that lasts 2 hours. You only see others while you're checked in yourself, and they only ever see a distance rounded to 50 m, never your coordinates. Coordinates stay in a table nobody else can read; the `nearby()` database function does the math.
- **Say hi and Inbox**: accept or decline; contacts unlock on accept
- **Meetups**: post, join, leave
- **Block and report**: blocking hides two people from each other everywhere (enforced in the database). Reports are write-only for users; organizers read them in the Supabase dashboard under Table Editor, `reports`

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
  hooks/useNearby.ts    check-in, check-out and the nearby() call
  components/           AuthCard, NameTag, ProfileForm, ProfileModal, Discover, Inbox, Meetups, Modal, Toast
  styles/               tokens.css (section 7 palette) and app.css
```

- Privacy is enforced by RLS. Contact details live in `contacts` and are only returned to the owner or someone with an accepted intro.
- User text is rendered as React text, never HTML. Contacts become links only for `mailto:`, `tel:`, `http:` and `https:`.
- Profiles load in pages of 1000 (Supabase's per-request cap), then each 30 s poll downloads only profiles whose `updated_at` changed, plus a full reload every 10 minutes. Contacts and intros are fetched only for the signed-in user. Discover draws cards in batches as you scroll.
- Tested with 1,200 profiles on a simulated mid-range phone: first cards in about 1 s, search in about 0.4 s, and about 7 KB per background poll.

## Password reset emails

"Forgot password?" on the sign-in screen emails a reset link that opens the app on a "Choose a new password" screen. For the emails to go out:

1. **Authentication → URL Configuration:** set Site URL to the live address (`https://hello-residency.vercel.app`) and add `https://hello-residency.vercel.app/**` to Redirect URLs (add `http://localhost:5173/**` for local development).
2. **Authentication → Emails → SMTP Settings:** turn on custom SMTP with an email provider (Supabase's built-in sender only allows about 2 emails an hour).
3. **Authentication → Rate Limits:** once custom SMTP is on, raise "Rate limit for sending emails" (for example to 100 an hour).

## Before a big event

- **Supabase plan:** the free plan includes 5 GB of data transfer a month and pauses after a week of inactivity. With 1000 people active all day, polling alone is roughly 6 GB a day, so switch to the Pro plan for the event.
- **Auth rate limits:** many people signing up from the same venue Wi-Fi share one IP address. Raise the sign-up and sign-in limits in Authentication, Rate Limits before doors open.

## Testing the full flow

Sign up with two accounts in two browser profiles. Alice says hi to Bob, Bob accepts in Inbox, and both see each other's contact. Post a meetup as one user and join it as the other (visible on the next refresh, at most 30 seconds).
