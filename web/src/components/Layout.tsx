import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useMeta, useStatus } from '../api/hooks';
import { Avatar, ROLE_LABEL, useSession } from '../lib/session';
import { AccountDialog } from './AccountDialog';
import { BrandLockup, Icon } from './Icon';

type Link = { to: string; label: string; icon: string };

/** The day-to-day building blocks — top of the sidebar. */
const BUILD_LINKS: Link[] = [
  { to: '/workflows', label: 'Workflows', icon: 'workflows' },
  { to: '/executions', label: 'Executions', icon: 'executions' },
  { to: '/agents', label: 'AI agents', icon: 'agents' },
  { to: '/credentials', label: 'Credentials', icon: 'key' },
  { to: '/data-tables', label: 'Data tables', icon: 'table' },
  { to: '/variables', label: 'Variables', icon: 'braces' },
];

/** Oversight / administration — pinned to the bottom of the sidebar. */
const ACTIVITY_LINK: Link = { to: '/activity', label: 'Activity', icon: 'history' };
const USERS_LINK: Link = { to: '/users', label: 'Users', icon: 'users' };
const CONNECTION_LINK: Link = { to: '/n8n-connection', label: 'n8n connection', icon: 'settings' };

function NavItem({ link }: { link: Link }) {
  return (
    <NavLink to={link.to} className={({ isActive }) => `item${isActive ? ' active' : ''}`}>
      <Icon name={link.icon} />{link.label}
    </NavLink>
  );
}

export function Layout() {
  const meta = useMeta();
  const status = useStatus();
  const { user, signOut } = useSession();
  const location = useLocation();
  const [account, setAccount] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ok = status.data?.api;
  const host = meta.data?.n8nUrl ? meta.data.n8nUrl.replace(/^https?:\/\//, '') : 'Address not set';
  const manageLinks = user.role === 'admin' ? [ACTIVITY_LINK, USERS_LINK, CONNECTION_LINK] : [ACTIVITY_LINK];

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Esc closes the drawer; lock page scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('nav-locked');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('nav-locked'); };
  }, [menuOpen]);

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="topbar-btn" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <NavLink to="/workflows" className="topbar-brand" aria-label="HappyN8 home"><BrandLockup onDark height={28} /></NavLink>
        <button type="button" className="topbar-me" onClick={() => setAccount(true)} aria-label="My account">
          <Avatar name={user.displayName} size={30} />
        </button>
      </header>

      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <nav id="main-nav" className={`nav${menuOpen ? ' open' : ''}`} aria-label="Main">
        <div className="nav-head">
          <NavLink to="/workflows" className="brand" aria-label="HappyN8 home"><BrandLockup onDark /></NavLink>
          <button type="button" className="nav-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="nav-group">
          {BUILD_LINKS.map((l) => <NavItem key={l.to} link={l} />)}
        </div>

        <div className="spacer" />

        <div className="nav-group nav-manage">
          <div className="nav-label">{user.role === 'admin' ? 'Manage' : 'Workspace'}</div>
          {manageLinks.map((l) => <NavItem key={l.to} link={l} />)}
        </div>

        <div className="conn">
          <strong><span className={`dot ${ok ? 'ok' : status.isLoading ? '' : 'bad'}`} />{ok ? 'n8n connected' : status.isLoading ? 'Checking n8n…' : 'n8n unreachable'}</strong>
          <div className="conn-host">{host}</div>
          {status.data?.apiError && <div style={{ color: '#ffb08a', marginTop: 4 }}>{status.data.apiError}</div>}
          {status.data?.login === false && <div style={{ color: '#ffb08a', marginTop: 4 }}>n8n login failed: {status.data.loginError}</div>}
          {meta.data && !meta.data.login && <div style={{ marginTop: 4 }}>Limited mode: add N8N_EMAIL / N8N_PASSWORD to get logos, step forms and Run.</div>}
          {meta.data?.n8nUrl && <a href={meta.data.n8nUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', display: 'inline-block', marginTop: 6 }}>Open n8n ↗</a>}
          {user.role === 'admin' && <NavLink to="/n8n-connection" style={{ color: 'inherit', display: 'inline-block', marginTop: 6, marginLeft: meta.data?.n8nUrl ? 12 : 0 }}>Change address</NavLink>}
        </div>
        <div className="me">
          <button type="button" className="me-btn" onClick={() => setAccount(true)} title="My account">
            <Avatar name={user.displayName} size={32} />
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
              <span className="me-name">{user.displayName}</span>
              <span className="me-role">{ROLE_LABEL[user.role]}</span>
            </span>
          </button>
          {!meta.data?.authDisabled && (
            <button type="button" className="me-out" aria-label="Sign out" title="Sign out" onClick={signOut}><Icon name="logout" size={18} /></button>
          )}
        </div>
      </nav>
      <main className="main"><Outlet /></main>
      {account && <AccountDialog onClose={() => setAccount(false)} />}
    </div>
  );
}
