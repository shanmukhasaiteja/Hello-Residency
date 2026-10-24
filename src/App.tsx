import { useCallback, useState } from 'react';
import { isConfigured, supabase } from './lib/supabase';
import { relation } from './lib/match';
import type { ProfileDraft } from './lib/types';
import { useSession } from './hooks/useSession';
import { useData, type Notify } from './hooks/useData';
import { useNearby } from './hooks/useNearby';
import { AuthCard } from './components/AuthCard';
import { Discover } from './components/Discover';
import { Inbox } from './components/Inbox';
import { Meetups } from './components/Meetups';
import { Nearby } from './components/Nearby';
import { Modal } from './components/Modal';
import { NameTag } from './components/NameTag';
import { ProfileForm } from './components/ProfileForm';
import { ProfileModal } from './components/ProfileModal';
import { Toasts, useToasts } from './components/Toast';

type Tab = 'discover' | 'nearby' | 'inbox' | 'meetups';

export default function App() {
  const session = useSession();
  const { toasts, notify, dismiss } = useToasts();

  let content;
  if (!isConfigured) content = <SetupNotice />;
  else if (session === undefined) content = <Loading />;
  else if (session === null) content = <AuthCard />;
  else content = <Shell key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} notify={notify} />;

  return (
    <>
      {content}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

/** True while the user is typing in a field, so background refreshes don't disrupt them. */
function isTyping(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function Shell({ userId, email, notify }: { userId: string; email: string; notify: Notify }) {
  const [tab, setTab] = useState<Tab>('discover');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const modalOpen = openId !== null || editing;
  const isPaused = useCallback(() => modalOpen || isTyping(), [modalOpen]);
  const data = useData(userId, { notify, isPaused });
  const nearby = useNearby(userId, { notify, isPaused, active: tab === 'nearby' });

  const me = data.profiles.find((p) => p.id === userId);
  const pendingCount = data.intros.filter((i) => i.to_id === userId && i.status === 'pending').length;

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) notify("Couldn't sign out. Check your connection and try again.", 'error');
  }

  if (!data.loaded) return <Loading onRetry={data.refresh} />;

  if (!me) {
    return (
      <main className="setup-wrap">
        <header className="setup-head">
          <h1>Make your name tag</h1>
          <p className="lead">This is what other residents see. You can change it any time.</p>
        </header>
        <div className="card">
          <ProfileForm
            profile={null}
            contact=""
            submitLabel="Create name tag"
            onSave={async (draft: ProfileDraft) => {
              const ok = await data.saveProfile(draft);
              if (ok) notify('Name tag created. Say hi to someone!');
              return ok;
            }}
          />
        </div>
        <p className="setup-foot">
          Signed in as {email}.{' '}
          <button type="button" className="link-btn" onClick={signOut}>
            Sign out
          </button>
        </p>
      </main>
    );
  }

  function switchTab(next: Tab) {
    setTab(next);
    void data.refresh();
  }

  const openPerson = openId ? data.profiles.find((p) => p.id === openId) : undefined;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'discover', label: 'Discover' },
    { id: 'nearby', label: 'Nearby' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'meetups', label: 'Meetups' },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="logo">Hello Residency</span>
          <div className="topbar-actions">
            <button type="button" className="me-btn" onClick={() => setEditing(true)} aria-label="Edit your name tag">
              <NameTag profile={me} size="mini" />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'tab tab-on' : 'tab'}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
              {t.id === 'inbox' && pendingCount > 0 && (
                <span className="badge" aria-label={`${pendingCount} waiting`}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === 'discover' && <Discover me={me} profiles={data.profiles} intros={data.intros} onOpen={(p) => setOpenId(p.id)} />}
        {tab === 'nearby' && (
          <Nearby me={me} profiles={data.profiles} intros={data.intros} nearby={nearby} onOpen={(p) => setOpenId(p.id)} />
        )}
        {tab === 'inbox' && (
          <Inbox
            me={me}
            profiles={data.profiles}
            intros={data.intros}
            contacts={data.contacts}
            onRespond={async (id, status, reply) => {
              const ok = await data.respondIntro(id, status, reply);
              if (ok) notify(status === 'accepted' ? "Connected. You can now see each other's contact." : 'Got it. They won’t be notified.');
              return ok;
            }}
            onOpen={(p) => setOpenId(p.id)}
            onDiscover={() => switchTab('discover')}
          />
        )}
        {tab === 'meetups' && (
          <Meetups
            me={me}
            profiles={data.profiles}
            meetups={data.meetups}
            joins={data.joins}
            onPost={data.postMeetup}
            onJoin={data.joinMeetup}
            onLeave={data.leaveMeetup}
            onDelete={data.deleteMeetup}
            notify={notify}
          />
        )}
      </main>

      {openPerson && (
        <ProfileModal
          key={openPerson.id}
          me={me}
          person={openPerson}
          relation={relation(me.id, openPerson.id, data.intros)}
          incoming={data.intros.find((i) => i.from_id === openPerson.id && i.to_id === me.id && i.status === 'pending')}
          contact={data.contacts.get(openPerson.id)}
          onSendIntro={async (toId, message) => {
            const ok = await data.sendIntro(toId, message);
            if (ok) notify('Hi sent.');
            return ok;
          }}
          onRespond={async (id, status, reply) => {
            const ok = await data.respondIntro(id, status, reply);
            if (ok) notify(status === 'accepted' ? "Connected. You can now see each other's contact." : 'Got it. They won’t be notified.');
            if (ok && status === 'declined') setOpenId(null);
            return ok;
          }}
          onClose={() => setOpenId(null)}
        />
      )}

      {editing && (
        <Modal title="Edit your name tag" onClose={() => setEditing(false)}>
          <ProfileForm
            profile={me}
            contact={data.contacts.get(me.id) ?? ''}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSave={async (draft) => {
              const ok = await data.saveProfile(draft);
              if (ok) {
                setEditing(false);
                notify('Name tag updated.');
              }
              return ok;
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Loading({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="loading" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <p>Loading…</p>
      {onRetry && (
        <button type="button" className="link-btn" onClick={onRetry}>
          Taking too long? Try again
        </button>
      )}
    </main>
  );
}

function SetupNotice() {
  return (
    <main className="setup-wrap">
      <div className="card">
        <h1>Almost there</h1>
        <p>This app needs a Supabase project. To finish setup:</p>
        <ol>
          <li>Run <code>schema.sql</code> in the Supabase SQL Editor.</li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and fill in <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>Restart the dev server, or add the same variables in your Vercel project and redeploy.</li>
        </ol>
      </div>
    </main>
  );
}
