import type { RoleId } from './caseflow';

/* The sign-in register, hardcoded for now.
 *
 * These are demo credentials, not secrets: the API has no authentication, every endpoint is
 * open, and this check runs in the browser where anyone can read it. It decides which role
 * the dashboard acts as. Move it behind a real server the day one exists. */

export interface Account {
  email: string;
  password: string;
  role: RoleId;
  /** Sees the developer-only tools, such as the risk formula comparison on the Branches page. */
  developer?: boolean;
}

export const ACCOUNTS: Account[] = [
  { email: 'branch@gmail.com', password: 'fif2026', role: 'branch' },
  { email: 'cx@gmail.com', password: 'fif2026', role: 'cx' },
  { email: 'compliance@gmail.com', password: 'fif2026', role: 'comp' },
  { email: 'developer@gmail.com', password: 'fif2026', role: 'comp', developer: true },
];

/** The matching account, or null. Email is matched case-insensitively; the password is not. */
export function findAccount(email: string, password: string): Account | null {
  const e = email.trim().toLowerCase();
  return ACCOUNTS.find((a) => a.email === e && a.password === password) ?? null;
}
