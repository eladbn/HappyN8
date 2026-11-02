import { createContext, useContext, type ReactNode } from 'react';
import type { AppUser, Role } from '../api/types';

interface SessionValue {
  user: AppUser;
  setUser: (u: AppUser) => void;
  signOut: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider missing');
  return v;
}

/** Editors and admins can change things; viewers only look. */
export function useCanEdit(): boolean {
  return useSession().user.role !== 'viewer';
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export const ROLE_HELP: Record<Role, string> = {
  admin: 'Everything, including managing users',
  editor: 'Build, change and run workflows and credentials',
  viewer: 'Look at workflows, runs and activity without changing anything',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? '')).toUpperCase() || '?';
}

const AVATAR = ['#4F46E5', '#0E7490', '#B45309', '#15803D', '#BE185D', '#1D4ED8', '#7C3AED', '#9A3412'];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR[Math.abs(h) % AVATAR.length];
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.4) }}>
      {initials(name)}
    </span>
  );
}
