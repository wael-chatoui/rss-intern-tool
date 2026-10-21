'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import './auth.css';

export function ActivationForm() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(value); setReady(true);
    // Keep the capability out of the browser's visible URL and subsequent navigation.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (password !== String(form.get('confirmation') || '')) { setError('Les deux mots de passe doivent être identiques.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: form.get('name'), email: form.get('email'), password }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'L’activation a échoué. Réessayez.'); return; }
      setToken('');
      window.location.replace('/espace');
    } catch { setError('Impossible de joindre l’application. Vérifiez votre connexion, puis réessayez.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-main auth-activation" id="activation-main">
    <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" />Retour à l’accueil</Link>
    <div className="auth-form-wrap">
      <Link href="/" className="auth-brand"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link>
      <h1>Activer mon espace</h1>
      <p className="auth-intro">Choisissez vos identifiants pour retrouver vos sources et vos notes.</p>
      {!ready ? <p role="status">Vérification du lien…</p> : !token ? <div className="auth-notice"><LockKeyhole aria-hidden="true" /><p>Ouvrez le lien d’activation privé qui vous a été remis. Il permet de créer votre compte une seule fois.</p></div> : <form onSubmit={submit} aria-busy={busy}>
        <div className="auth-field"><label htmlFor="activation-name">Nom</label><input className="field" id="activation-name" name="name" autoComplete="name" required maxLength={80} /></div>
        <div className="auth-field"><label htmlFor="activation-email">Adresse e-mail</label><input className="field" id="activation-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} /></div>
        <div className="auth-field"><label htmlFor="activation-password">Mot de passe</label><input className="field" id="activation-password" name="password" type="password" autoComplete="new-password" required minLength={15} maxLength={128} aria-describedby="activation-password-hint" /><p id="activation-password-hint" className="auth-session-note">Une phrase personnelle de 15 à 128 caractères.</p></div>
        <div className="auth-field"><label htmlFor="activation-confirmation">Confirmer le mot de passe</label><input className="field" id="activation-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} /></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}{busy ? 'Activation en cours…' : 'Créer mon compte'}</button>
        <p className="auth-session-note">Cet espace est personnel. Les inscriptions publiques sont fermées.</p>
      </form>}
    </div>
  </main>;
}
