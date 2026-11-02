import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { request } from '../api/client';
import { useUsers } from '../api/hooks';
import type { AppUser, Role } from '../api/types';
import { Icon } from '../components/Icon';
import { Menu, Modal, Spinner, errMsg, useToast } from '../components/ui';
import { timeAgo } from '../lib/format';
import { Avatar, ROLE_HELP, ROLE_LABEL, useSession } from '../lib/session';

const ROLES: Role[] = ['admin', 'editor', 'viewer'];

/** HappyN8's own accounts. They are separate from n8n, which keeps its single owner account. */
export function UsersPage() {
  const { user: me } = useSession();
  const users = useUsers(true);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);

  async function patch(u: AppUser, body: Record<string, unknown>, done: string) {
    try {
      await request('PATCH', `/api/users/${u.id}`, body);
      await qc.invalidateQueries({ queryKey: ['users'] });
      await qc.invalidateQueries({ queryKey: ['people'] });
      toast(done, 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  }

  async function remove(u: AppUser) {
    if (!window.confirm(`Remove ${u.displayName}? Their past activity stays in the log.`)) return;
    try {
      await request('DELETE', `/api/users/${u.id}`);
      await qc.invalidateQueries({ queryKey: ['users'] });
      toast(`Removed ${u.displayName}`, 'ok');
    } catch (e) { toast(errMsg(e), 'bad'); }
  }

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <header className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>People who can sign in to HappyN8. They all work through the same n8n connection, so nobody needs an n8n account.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />Add user</button>
      </header>
      <div className="role-key">
        {ROLES.map((r) => <div key={r}><strong>{ROLE_LABEL[r]}</strong><span className="small muted">{ROLE_HELP[r]}</span></div>)}
      </div>
      <div className="card">
        <div className="list-row list-head stack-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 140px 150px 44px' }}><span>Person</span><span>Role</span><span>Last sign-in</span><span /></div>
        {users.isLoading && <div className="center"><Spinner /></div>}
        {users.error && <div className="empty">Couldn't load users: {errMsg(users.error)}</div>}
        {(users.data ?? []).map((u) => (
          <div key={u.id} className="list-row stack-row" style={{ gridTemplateColumns: 'minmax(0,1fr) 140px 150px 44px', opacity: u.disabled ? 0.6 : 1 }}>
            <div className="row" style={{ minWidth: 0, gap: 12 }}>
              <Avatar name={u.displayName} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{u.displayName}{u.id === me.id && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</div>
                <div className="small muted">{u.username}{u.disabled ? ', disabled' : ''}</div>
              </div>
            </div>
            <div>
              <select className="select compact" aria-label={`Role of ${u.displayName}`} value={u.role} disabled={u.id === me.id}
                onChange={(e) => patch(u, { role: e.target.value }, `${u.displayName} is now ${ROLE_LABEL[e.target.value as Role].toLowerCase()}`)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div className="small muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</div>
            <Menu label={`Actions for ${u.displayName}`}>
              {(close) => (
                <>
                  <button type="button" onClick={() => { close(); setEditing(u); }}><Icon name="settings" size={16} />Edit name or reset password</button>
                  {u.id !== me.id && (
                    <>
                      <button type="button" onClick={() => { close(); patch(u, { disabled: !u.disabled }, u.disabled ? `${u.displayName} can sign in again` : `${u.displayName} is disabled and signed out`); }}>
                        <Icon name="power" size={16} />{u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      <div className="sep" />
                      <button type="button" style={{ color: 'var(--bad-text)' }} onClick={() => { close(); remove(u); }}><Icon name="trash" size={16} />Remove</button>
                    </>
                  )}
                </>
              )}
            </Menu>
          </div>
        ))}
      </div>
      {editing && <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserDialog({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'editor');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError('');
    try {
      if (user) {
        const body: Record<string, unknown> = {};
        if (displayName !== user.displayName) body.displayName = displayName;
        if (password) body.password = password;
        await request('PATCH', `/api/users/${user.id}`, body);
      } else {
        await request('POST', '/api/users', { username, displayName: displayName || username, role, password });
      }
      await qc.invalidateQueries({ queryKey: ['users'] });
      await qc.invalidateQueries({ queryKey: ['people'] });
      toast(user ? 'User updated' : `Added ${displayName || username}`, 'ok');
      onClose();
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title={user ? `Edit ${user.displayName}` : 'Add user'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || (!user && (!username || password.length < 8))} onClick={save}>{busy ? 'Saving…' : user ? 'Save changes' : 'Add user'}</button></>}>
      {!user && (
        <label className="field"><span className="label">Username</span>
          <input className="input" autoFocus autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. dana or dana@company.com" />
          <span className="hint">Used to sign in. It can't be changed later.</span></label>
      )}
      <label className="field"><span className="label">Display name</span>
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Dana Levi" /></label>
      {!user && (
        <div className="field"><span className="label">Role</span>
          <div className="choice-list" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <label key={r} className={`choice${role === r ? ' on' : ''}`}>
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                <span><strong>{ROLE_LABEL[r]}</strong><span className="small muted" style={{ display: 'block', fontWeight: 400 }}>{ROLE_HELP[r]}</span></span>
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="field"><span className="label">{user ? 'New password' : 'Password'}</span>
        <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={user ? 'Leave empty to keep the current one' : ''} />
        <span className="hint">At least 8 characters.{user ? ' Resetting it signs the person out everywhere.' : ' Share it with them privately; they can change it under My account.'}</span></label>
      {error && <div className="notice bad" role="alert">{error}</div>}
    </Modal>
  );
}
