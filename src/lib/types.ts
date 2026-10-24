// Row types for every table in schema.sql. Keep in sync with the SQL.
// These are `type` aliases, not interfaces, so they satisfy supabase-js generic constraints.

export const OPEN_TO_OPTIONS = [
  'Coffee chat',
  'Study buddy',
  'Research collab',
  'Writing partner',
  'Feedback swap',
  'Just saying hi',
] as const;

/** Icebreaker prompts a person can answer on their name tag. */
export const PROMPTS = [
  'Ask me about…',
  "I'm weirdly good at…",
  'The best spot around here is…',
  'My most controversial opinion…',
  'This weekend I want to…',
  "I'll buy you a coffee if you…",
] as const;

/** This-or-that pairs. Answers are stored as the chosen option, so option names must be unique. */
export const THIS_OR_THAT = [
  ['Coffee', 'Tea'],
  ['Early bird', 'Night owl'],
  ['Mountains', 'Beach'],
  ['Cats', 'Dogs'],
  ['Big party', 'Small dinner'],
] as const;

export type IntroStatus = 'pending' | 'accepted' | 'declined';

export type Profile = {
  id: string;
  name: string;
  program: string | null;
  cohort: string | null;
  research_topic: string | null;
  bio: string | null;
  tags: string[];
  open_to: string[];
  avatar_path: string | null;
  prompt: string | null;
  prompt_answer: string | null;
  this_or_that: string[];
  created_at: string;
}

export type Contact = {
  user_id: string;
  contact: string;
}

export type Intro = {
  id: string;
  from_id: string;
  to_id: string;
  message: string;
  reply: string | null;
  status: IntroStatus;
  created_at: string;
}

export type Meetup = {
  id: string;
  host_id: string;
  title: string;
  place: string;
  when_at: string;
  details: string | null;
  created_at: string;
}

export type MeetupJoin = {
  meetup_id: string;
  user_id: string;
}

/** The signed-in user's own check-in. Nobody else can read this row. */
export type Checkin = {
  user_id: string;
  lat: number | null;
  lng: number | null;
  spot: string | null;
  updated_at: string;
};

/** One row from the nearby() function: a rough distance, never coordinates. */
export type NearbyPerson = {
  user_id: string;
  distance_m: number | null;
  spot: string | null;
  checked_in_at: string;
};

/** How the signed-in user relates to another person. */
export type Relation = 'none' | 'sent' | 'incoming' | 'connected';

/** Editable profile fields plus the private contact, as captured by the form. */
export type ProfileDraft = {
  name: string;
  program: string;
  cohort: string;
  research_topic: string;
  bio: string;
  tags: string[];
  open_to: string[];
  contact: string;
  avatar_path: string | null;
  prompt: string;
  prompt_answer: string;
  this_or_that: string[];
}

export type Block = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export type MeetupDraft = {
  title: string;
  place: string;
  when_at: string; // ISO timestamp
  details: string;
}

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

/** Supabase client typing, so query results come back as the row types above. */
export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Omit<Profile, 'created_at' | 'avatar_path' | 'prompt' | 'prompt_answer' | 'this_or_that'> &
          Partial<Pick<Profile, 'created_at' | 'avatar_path' | 'prompt' | 'prompt_answer' | 'this_or_that'>>
      >;
      contacts: Table<Contact, Contact>;
      intros: Table<
        Intro,
        Pick<Intro, 'from_id' | 'to_id' | 'message'> & Partial<Pick<Intro, 'id' | 'reply' | 'status' | 'created_at'>>,
        Partial<Pick<Intro, 'status' | 'reply'>>
      >;
      meetups: Table<
        Meetup,
        Pick<Meetup, 'host_id' | 'title' | 'place' | 'when_at'> & Partial<Pick<Meetup, 'id' | 'details' | 'created_at'>>
      >;
      meetup_joins: Table<MeetupJoin, MeetupJoin>;
      blocks: Table<Block, Pick<Block, 'blocker_id' | 'blocked_id'>>;
      reports: Table<
        { id: string; reporter_id: string; reported_id: string; reason: string; created_at: string },
        { reported_id: string; reason: string; reporter_id?: string }
      >;
      checkins: Table<Checkin, Omit<Checkin, 'updated_at'> & { updated_at?: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      nearby: { Args: never; Returns: NearbyPerson[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
