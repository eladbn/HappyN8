import { useState } from 'react';
import { request } from '../api/client';
import type { AppUser } from '../api/types';
import { Avatar, ROLE_HELP, ROLE_LABEL, useSession } from '../lib/session';
import { Modal, errMsg, useToast } from './ui';

/** The signed-in user's own name and password. */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user.displayName);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true); setError('');
    try {
      const u = await request<AppUser>('PATCH', '/api/me', { displayName: name });
      setUser(u);
      toast('Name saved', 'ok');
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  async function savePassword() {
    if (next !== repeat) { setError("The new passwords don't match"); return; }
    setBusy(true); setError('');
    try {
      await request('POST', '/api/me/password', { current, next });
      setCurrent(''); setNext(''); setRepeat('');
      toast('Password changed. Your other sessions were signed out.', 'ok');
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title="My account" onClose={onClose} footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}>
      <div className="row" style={{ gap: 12 }}>
        <Avatar name={user.displayName} size={44} />
        <div>
          <div style={{ fontWeight: 700 }}>{user.displayName}</div>
          <div className="small muted">{user.username}, {ROLE_LABEL[user.role]}: {ROLE_HELP[user.role].toLowerCase()}</div>
        </div>
      </div>
      <label className="field">
        <span className="label">Display name</span>
        <div className="row">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn" disabled={busy || !name.trim() || name === user.displayName} onClick={saveName}>Save name</button>
        </div>
        <span className="hint">Shown in the activity log and next to the workflows you change.</span>
      </label>
      <fieldset className="group" style={{ margin: 0 }}>
        <legend className="small" style={{ fontWeight: 700, padding: '0 4px' }}>Change password</legend>
        <label className="field"><span className="label">Current password</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span className="label">New password</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <span className="hint">At least 8 characters.</span></label>
        <label className="field"><span className="label">Repeat new password</span>
          <input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy || !current || next.length < 8} onClick={savePassword}>Change password</button>
      </fieldset>
      {error && <div className="notice bad" role="alert">{error}</div>}
    </Modal>
  );
}
