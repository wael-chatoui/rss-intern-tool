'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import './auth.css';

export function RegistrationForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (password !== String(form.get('confirmation') || '')) { setError('Les deux mots de passe doivent être identiques.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password, acceptTerms: form.get('acceptTerms') === 'on' }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'L’inscription a échoué. Réessayez.'); return; }
      window.location.replace('/compte');
    } catch { setError('Impossible de joindre l’application. Vérifiez votre connexion, puis réessayez.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-main auth-activation">
    <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" />Retour à l’accueil</Link>
    <div className="auth-form-wrap">
      <Link href="/" className="auth-brand"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link>
      <h1>Votre espace privé</h1><p className="auth-intro">Rassemblez vos sources et préparez vos textes. Vos notes restent accessibles uniquement depuis votre compte.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <div className="auth-field"><label htmlFor="register-name">Nom</label><input className="field" id="register-name" name="name" autoComplete="name" required maxLength={80} /></div>
        <div className="auth-field"><label htmlFor="register-email">Adresse e-mail</label><input className="field" id="register-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} /></div>
        <div className="auth-field"><label htmlFor="register-password">Mot de passe</label><input className="field" id="register-password" name="password" type="password" autoComplete="new-password" required minLength={15} maxLength={128} aria-describedby="register-password-hint" /><p id="register-password-hint" className="auth-session-note">Une phrase personnelle de 15 à 128 caractères.</p></div>
        <div className="auth-field"><label htmlFor="register-confirmation">Confirmer le mot de passe</label><input className="field" id="register-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} /></div>
        <label className="auth-terms"><input type="checkbox" name="acceptTerms" required /><span>J’accepte les <Link href="/conditions">conditions d’utilisation</Link> et j’ai lu la <Link href="/confidentialite">politique de confidentialité</Link>.</span></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}{busy ? 'Création du compte…' : 'Créer mon compte'}</button>
        <p className="auth-session-note">Vous choisissez votre abonnement après la création du compte. Aucun paiement à cette étape.</p>
      </form>
      <p className="auth-session-note">Vous avez déjà un compte ? <Link href="/connexion">Se connecter</Link></p>
    </div>
  </main>;
}
