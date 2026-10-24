import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { OPEN_TO_OPTIONS, PROMPTS, THIS_OR_THAT, type Profile, type ProfileDraft } from '../lib/types';
import { MAX_TAGS, OPEN_TO_EMOJI, parseTags } from '../lib/match';
import { NameTag } from './NameTag';

const BIO_MAX = 400;
const ANSWER_MAX = 150;

interface ProfileFormProps {
  profile: Profile | null;
  contact: string;
  onSave: (draft: ProfileDraft) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel: string;
}

export function ProfileForm({ profile, contact, onSave, onUploadPhoto, onCancel, submitLabel }: ProfileFormProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [program, setProgram] = useState(profile?.program ?? '');
  const [cohort, setCohort] = useState(profile?.cohort ?? '');
  const [topic, setTopic] = useState(profile?.research_topic ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [tagsText, setTagsText] = useState((profile?.tags ?? []).join(', '));
  const [openTo, setOpenTo] = useState<string[]>(profile?.open_to ?? []);
  const [contactText, setContactText] = useState(contact);
  const [avatarPath, setAvatarPath] = useState<string | null>(profile?.avatar_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState<string>(profile?.prompt ?? PROMPTS[0]);
  const [answer, setAnswer] = useState(profile?.prompt_answer ?? '');
  const [picks, setPicks] = useState<string[]>(profile?.this_or_that ?? []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = parseTags(tagsText);
  const rawTagCount = tagsText.split(',').filter((t) => t.trim()).length;

  function toggleOpenTo(option: string) {
    setOpenTo((cur) => (cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option]));
  }

  function pick(pair: readonly string[], option: string) {
    setPicks((cur) => {
      const rest = cur.filter((c) => !pair.includes(c));
      return cur.includes(option) ? rest : [...rest, option];
    });
  }

  async function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const path = await onUploadPhoto(file);
    setUploading(false);
    if (path) setAvatarPath(path);
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
      avatar_path: avatarPath,
      prompt,
      prompt_answer: answer,
      this_or_that: picks,
    });
    setBusy(false);
    if (!ok) setError("Your changes weren't saved. Check the message above and try again.");
  }

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <div className="profile-preview" aria-label="Preview of your name tag">
        <NameTag
          profile={{ name, program, cohort, research_topic: topic, tags, avatar_path: avatarPath, prompt, prompt_answer: answer.trim() }}
          size="full"
        />
        <div className="photo-actions">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={choosePhoto} tabIndex={-1} />
          <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : avatarPath ? 'Change photo' : 'Add a photo'}
          </button>
          {avatarPath && !uploading && (
            <button type="button" className="link-btn" onClick={() => setAvatarPath(null)}>
              Remove photo
            </button>
          )}
        </div>
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
                <span aria-hidden="true">{OPEN_TO_EMOJI[o]}</span> {o}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field field-wide icebreaker">
          <legend>Icebreaker</legend>
          <label className="sr-only" htmlFor="prompt">
            Prompt
          </label>
          <select id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}>
            {PROMPTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="prompt-answer">
            Your answer
          </label>
          <input
            id="prompt-answer"
            value={answer}
            maxLength={ANSWER_MAX}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer, the more specific the better"
          />
          <small className="hint">Gives people an easy way to start a conversation.</small>
        </fieldset>
        <fieldset className="field field-wide">
          <legend>This or that</legend>
          <div className="tot-grid">
            {THIS_OR_THAT.map((pair) => (
              <div key={pair[0]} className="tot-pair" role="group" aria-label={`${pair[0]} or ${pair[1]}`}>
                {pair.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={picks.includes(option) ? 'tot-option tot-on' : 'tot-option'}
                    aria-pressed={picks.includes(option)}
                    onClick={() => pick(pair, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <small className="hint">Tap one in each pair, or skip any. You'll see who agrees with you.</small>
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
        <button type="submit" className="btn btn-primary" disabled={busy || uploading}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
