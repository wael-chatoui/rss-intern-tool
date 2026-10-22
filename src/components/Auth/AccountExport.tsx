'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { downloadAccountSnapshot } from '@/lib/account-export';

export function AccountExport() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function download() {
    if (pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      await downloadAccountSnapshot();
      setNotice('Fichier prêt. Vérifiez les téléchargements de votre navigateur.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Le téléchargement a échoué. Réessayez.'); }
    finally { setPending(false); }
  }
  return <>
    <button className="btn btn-secondary" onClick={() => void download()} disabled={pending}>{pending && <LoaderCircle className="is-spinning" aria-hidden="true" />}{pending ? 'Préparation du fichier…' : 'Télécharger mes données enregistrées'}</button>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="auth-notice" role="status">{notice}</p>}
  </>;
}
