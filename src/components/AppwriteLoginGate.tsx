import React, { FormEvent, ReactNode, useEffect, useState } from 'react';
import { appwriteAccount, getCurrentFinovaUser, FinovaUser } from '../services/appwriteAuth';
import { LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';

interface Props { children: ReactNode; }

export const AppwriteLoginGate: React.FC<Props> = ({ children }) => {
  const [user, setUser] = useState<FinovaUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refreshSession = async () => {
    try {
      const current = await getCurrentFinovaUser();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { void refreshSession(); }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await appwriteAccount.createEmailPasswordSession({ email: email.trim(), password });
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your email and password.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    try { await appwriteAccount.deleteSession({ sessionId: 'current' }); }
    finally { setUser(null); }
  };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-[#070d18] text-slate-300 text-sm">Checking secure session…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d18] px-4 py-10 text-slate-100">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-[#0d1527] p-7 shadow-2xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h1 className="text-center text-2xl font-black text-white">MOTI FINOVA</h1>
          <p className="mt-1 text-center text-xs text-slate-400">Sign in to your secure finance workspace</p>
          <label className="mt-7 block text-xs font-semibold text-slate-300">Email address</label>
          <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3.5 py-3 text-sm text-white outline-none focus:border-amber-400" />
          <label className="mt-4 block text-xs font-semibold text-slate-300">Password</label>
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3.5 py-3 text-sm text-white outline-none focus:border-amber-400" />
          {error && <p role="alert" className="mt-3 text-xs text-rose-400">{error}</p>}
          <button type="submit" disabled={busy} className="mt-6 w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-950 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in securely'}</button>
          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Access is limited to approved Finova accounts</div>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-[60] flex items-center gap-2 rounded-full border border-slate-700 bg-[#0d1527]/95 px-3 py-2 text-[11px] text-slate-300 shadow-lg">
        <span className="max-w-[150px] truncate">{user.email}</span>
        <button onClick={() => void handleLogout()} title="Sign out" aria-label="Sign out" className="text-slate-400 hover:text-white"><LogOut className="h-4 w-4" /></button>
      </div>
      {children}
    </>
  );
};
