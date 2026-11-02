import { useState, type FormEvent } from 'react';
import { request } from '../api/client';
import { BrandLockup } from '../components/Icon';
import { errMsg } from '../components/ui';

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('POST', '/api/login', { username, password });
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center" style={{ minHeight: '100vh', padding: 16 }}>
      <form className="card pad" onSubmit={submit} style={{ width: 'min(380px, 100%)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ margin: '4px 0 0' }}><BrandLockup height={40} /></h1>
        <p className="muted" style={{ margin: 0 }}>Sign in with your HappyN8 account.</p>
        <label className="field">
          <span className="label">Username</span>
          <input className="input" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="small muted" style={{ margin: 0 }}>No account? Ask a HappyN8 admin to add you.</p>
      </form>
    </div>
  );
}
