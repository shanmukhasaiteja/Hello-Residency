import { useState, type FormEvent } from 'react';
import { OPEN_TO_OPTIONS, type Profile, type ProfileDraft } from '../lib/types';
import { MAX_TAGS, parseTags } from '../lib/match';
import { NameTag } from './NameTag';

const BIO_MAX = 400;

interface ProfileFormProps {
  profile: Profile | null;
  contact: string;
  onSave: (draft: ProfileDraft) => Promise<boolean>;
  onCancel?: () => void;
  submitLabel: string;
}

export function ProfileForm({ profile, contact, onSave, onCancel, submitLabel }: ProfileFormProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [program, setProgram] = useState(profile?.program ?? '');
  const [cohort, setCohort] = useState(profile?.cohort ?? '');
  const [topic, setTopic] = useState(profile?.research_topic ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [tagsText, setTagsText] = useState((profile?.tags ?? []).join(', '));
  const [openTo, setOpenTo] = useState<string[]>(profile?.open_to ?? []);
  const [contactText, setContactText] = useState(contact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = parseTags(tagsText);
  const rawTagCount = tagsText.split(',').filter((t) => t.trim()).length;

  function toggleOpenTo(option: string) {
    setOpenTo((cur) => (cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Add your name so people know who you are.');
      return;
    }
    setBusy(true);
    const ok = await onSave({
      name,
      program,
      cohort,
      research_topic: topic,
      bio,
      tags,
      open_to: OPEN_TO_OPTIONS.filter((o) => openTo.includes(o)),
      contact: contactText,
    });
    setBusy(false);
    if (!ok) setError("Your changes weren't saved. Check the message above and try again.");
  }

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <div className="profile-preview" aria-label="Preview of your name tag">
        <NameTag profile={{ name, program, cohort, research_topic: topic, tags }} size="full" />
      </div>
      <div className="form-grid">
        <label className="field">
          <span>
            Name <em className="req">required</em>
          </span>
          <input data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="field">
          <span>Program</span>
          <input value={program} maxLength={80} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Computer Science" />
        </label>
        <label className="field">
          <span>Cohort</span>
          <input value={cohort} maxLength={40} onChange={(e) => setCohort(e.target.value)} placeholder="e.g. 2026" />
        </label>
        <label className="field">
          <span>Research topic</span>
          <input value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder="One line about your work" />
        </label>
        <label className="field field-wide">
          <span>Bio</span>
          <textarea value={bio} maxLength={BIO_MAX} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="A few sentences about you" />
          <small className="hint">
            {bio.length}/{BIO_MAX}
          </small>
        </label>
        <label className="field field-wide">
          <span>Interest tags</span>
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="climbing, causal inference, jazz" />
          <small className="hint">
            Separate with commas. Up to {MAX_TAGS}.{rawTagCount > MAX_TAGS && ` Only the first ${MAX_TAGS} will be saved.`}
          </small>
        </label>
        <fieldset className="field field-wide">
          <legend>Open to</legend>
          <div className="chip-row">
            {OPEN_TO_OPTIONS.map((o) => (
              <button
                key={o}
                type="button"
                className={openTo.includes(o) ? 'chip chip-on' : 'chip'}
                aria-pressed={openTo.includes(o)}
                onClick={() => toggleOpenTo(o)}
              >
                {o}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field field-wide">
          <span>Contact (private)</span>
          <input
            value={contactText}
            maxLength={200}
            onChange={(e) => setContactText(e.target.value)}
            placeholder="Email, phone, or a profile link"
          />
          <small className="hint">Only people you connect with can see this.</small>
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
