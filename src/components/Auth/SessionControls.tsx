'use client';

import { useState } from 'react';
import { LoaderCircle, LogOut } from 'lucide-react';
import type { Owner } from '@/lib/auth-store';
import './auth.css';

export function SessionControls({ owner, beforeLogout, disabled }: { owner: Owner; beforeLogout: () => Promise<void>; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true); setError('');
    try {
      await beforeLogout();
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Impossible de fermer la session. Réessayez.');
      window.location.replace('/connexion');
    } catch (e) { setError(e instanceof Error ? e.message : 'La déconnexion a échoué. Réessayez.'); setBusy(false); }
  }
  return <div className="session-controls"><div className="local-profile"><span className="profile-avatar" aria-hidden="true">{(owner.name || owner.email).charAt(0).toUpperCase()}</span><div className="session-identity"><strong>{owner.name}</strong><small title={owner.email}>{owner.email}</small></div></div><a className="session-account" href="/compte">Mon compte et mon abonnement</a><button className="btn btn-ghost session-logout" disabled={busy || disabled} onClick={() => void logout()}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <LogOut aria-hidden="true" />}{busy ? 'Déconnexion…' : 'Se déconnecter'}</button>{error && <p className="session-error" role="alert">{error}{error.includes('session a expiré') && <> <a href="/connexion?expired=1" target="_blank" rel="noopener noreferrer">Se reconnecter</a></>}</p>}</div>;
}
