'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, NotebookPen, Rss } from 'lucide-react';
import './auth.css';

export function LoginForm({ configured, expired, signupEnabled = false }: { configured: boolean; expired: boolean; signupEnabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<'email' | 'password' | 'both' | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(''); setInvalid(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (!email || !emailRef.current?.validity.valid) {
      setInvalid('email'); setError('Saisissez une adresse e-mail valide.'); emailRef.current?.focus(); return;
    }
    if (!password) {
      setInvalid('password'); setError('Saisissez votre mot de passe.'); passwordRef.current?.focus(); return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'La connexion a échoué. Réessayez.');
        if (response.status === 401) { setInvalid('both'); passwordRef.current?.focus(); }
        else requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      window.location.replace('/espace');
    } catch {
      setError('Impossible de joindre l’application. Vérifiez votre connexion, puis réessayez.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setBusy(false); }
  }

  return <div className="auth-page">
    <a className="skip-link" href="#login-main">Aller à la connexion</a>
    <aside className="auth-panel" aria-label="La Rédaction">
      <Link href="/" className="auth-brand"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link>
      <div className="auth-panel-copy"><span className="auth-panel-label">Votre espace de travail</span><h2>Retrouvez vos sources<br />et vos notes.</h2><p>La veille, la rédaction et le planning éditorial dans un même espace.</p>
        <div className="auth-context"><Rss aria-hidden="true" /><span>Lire une source</span><ArrowRight aria-hidden="true" /><NotebookPen aria-hidden="true" /><span>Garder une idée</span></div>
      </div>
      <p className="auth-panel-foot"><LockKeyhole aria-hidden="true" />Un espace personnel, accessible après connexion.</p>
    </aside>
    <main id="login-main" className="auth-main" tabIndex={-1}>
      <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" />Retour à l’accueil</Link>
      <div className="auth-form-wrap">
        <div className="auth-mobile-brand"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></div>
        <h1>Se connecter</h1><p className="auth-intro">Ouvrez votre espace de rédaction.</p>
        {expired && <p className="auth-notice" role="status">Votre session a expiré. Connectez-vous pour reprendre votre travail.</p>}
        {!configured ? <div className="auth-notice auth-setup"><LockKeyhole aria-hidden="true" /><h2>L’accès reste à configurer</h2><p>Le propriétaire doit ouvrir son lien d’activation privé pour choisir ses identifiants.</p><p><Link href="/demo">La démonstration reste accessible sans compte.</Link></p></div> : <>
          <form onSubmit={submit} noValidate aria-busy={busy}>
            <div className="auth-field"><label htmlFor="email">Adresse e-mail</label><input ref={emailRef} className="field" id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="vous@exemple.fr" aria-invalid={invalid === 'email' || invalid === 'both'} aria-describedby={invalid === 'email' || invalid === 'both' ? 'login-error' : undefined} /></div>
            <div className="auth-field"><label htmlFor="password">Mot de passe</label><div className="auth-password"><input ref={passwordRef} className="field" id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={512} aria-invalid={invalid === 'password' || invalid === 'both'} aria-describedby={invalid === 'password' || invalid === 'both' ? 'login-error' : undefined} /><button type="button" className="icon-btn" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></div>
            {error && <div id="login-error" ref={errorRef} className="auth-error" role="alert" tabIndex={-1}>{error}</div>}
            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}{busy ? 'Connexion en cours…' : 'Se connecter'}{!busy && <ArrowRight aria-hidden="true" />}</button>
            <p className="auth-session-note">La session reste ouverte pendant 7 jours. Déconnectez-vous sur un ordinateur partagé.</p>
          </form>
          <details className="auth-recovery"><summary>Mot de passe oublié ?</summary><p>Pour récupérer l’accès, contactez l’éditeur depuis les <Link href="/mentions-legales">mentions légales</Link>. Ne communiquez jamais votre mot de passe.</p></details>
          {signupEnabled && <p className="auth-session-note">Pas encore de compte ? <Link href="/inscription">Créer mon espace privé</Link></p>}
        </>}
      </div>
      <p className="auth-main-foot">La Rédaction <span aria-hidden="true">·</span> Espace personnel</p>
    </main>
  </div>;
}
