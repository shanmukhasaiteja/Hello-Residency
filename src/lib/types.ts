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
      profiles: Table<Profile, Omit<Profile, 'created_at'> & { created_at?: string }>;
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
