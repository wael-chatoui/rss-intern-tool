'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Download, FileText, NotebookPen, RotateCcw } from 'lucide-react';
import './demo.css';

export function DemoWorkspace({ signupEnabled }: { signupEnabled: boolean }) {
  const [view, setView] = useState<'source' | 'note' | 'planning'>('source');
  const [created, setCreated] = useState(false);
  const [title, setTitle] = useState('Mon premier sujet');
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('idea');
  const [notice, setNotice] = useState('');
  function create() { setCreated(true); setView('note'); setNotice('La référence est conservée avec votre note.'); }
  function reset() { setCreated(false); setTitle('Mon premier sujet'); setText(''); setDate(''); setStatus('idea'); setView('source');setNotice('La démonstration a été réinitialisée.'); }
  function download() {
    const blob = new Blob([`${title}\n\n${text}\n\nSource : article fictif de démonstration\n${date ? `Date prévue : ${date}\n` : ''}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');link.href = url;link.download = 'ma-note-de-demonstration.txt';link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);setNotice('Votre note de démonstration a été téléchargée.');
  }
  return <main className="demo-page">
    <header className="demo-header"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link><Link href={signupEnabled ? '/inscription' : '/connexion'} className="btn btn-primary">{signupEnabled ? 'Créer mon espace privé' : 'Se connecter'}<ArrowRight aria-hidden="true" /></Link></header>
    <div className="demo-intro"><h1>Essayez le parcours de rédaction.</h1><p>Partez d’une source, prenez une note et préparez une date. Cet exemple est fictif et reste dans cette page, sans compte ni envoi de données.</p></div>
    <div className="demo-workspace">
      <nav className="demo-navigation" aria-label="Étapes de la démonstration">
        <button className={view === 'source' ? 'active' : ''} aria-current={view === 'source' ? 'step' : undefined} onClick={() => setView('source')}><FileText aria-hidden="true" />Lire la source</button>
        <button className={view === 'note' ? 'active' : ''} aria-current={view === 'note' ? 'step' : undefined} onClick={() => setView('note')}><NotebookPen aria-hidden="true" />Préparer ma note</button>
        <button className={view === 'planning' ? 'active' : ''} aria-current={view === 'planning' ? 'step' : undefined} onClick={() => setView('planning')}><CalendarDays aria-hidden="true" />Planifier le sujet</button>
      </nav>
      <div className="demo-canvas">
        {view === 'source' && <article className="demo-reading"><p className="demo-source-label">Article fictif de démonstration</p><h2>Transformer une lecture en sujet</h2><p>Une information repérée peut devenir un angle à explorer. Conservez la référence avec votre note, puis complétez-la avec votre analyse et les autres sources utiles.</p><p>Dans l’application, les extraits et les liens restent séparés de votre propre texte. Vous retrouvez ainsi l’origine d’une idée pendant la rédaction.</p><button className="btn btn-primary" onClick={create}>{created ? 'Revenir à ma note' : 'Créer une note depuis cette source'}<ArrowRight aria-hidden="true" /></button></article>}
        {view === 'note' && (!created ? <div className="demo-empty"><h2>Votre carnet commence ici.</h2><p>Créez votre première note. La référence de démonstration y sera attachée.</p><button className="btn btn-primary" onClick={create}>Créer ma note</button></div> : <section className="demo-editor" aria-label="Note de démonstration"><label htmlFor="demo-title">Mon angle</label><input className="field demo-title" id="demo-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} /><div className="demo-reference"><strong>Référence conservée</strong><p>Transformer une lecture en sujet</p><span>Article fictif de démonstration</span></div><label htmlFor="demo-text">Mes notes</label><textarea className="field" id="demo-text" value={text} onChange={event => setText(event.target.value)} placeholder="Développez votre angle, notez vos questions et les faits à vérifier…" rows={8} maxLength={20000} /><div className="demo-editor-actions"><button className="btn btn-secondary" onClick={download}><Download aria-hidden="true" />Télécharger ma note</button><button className="btn btn-primary" onClick={() => setView('planning')}>Planifier ce sujet<ArrowRight aria-hidden="true" /></button></div></section>)}
        {view === 'planning' && (!created ? <div className="demo-empty"><h2>Préparez d’abord votre sujet.</h2><p>Une note peut recevoir une date et un statut dans le planning.</p><button className="btn btn-primary" onClick={create}>Créer ma première note</button></div> : <section className="demo-plan"><h2>{title || 'Sujet sans titre'}</h2><p>Organisez votre travail. Le planning ne publie rien sur les réseaux sociaux.</p><div className="demo-plan-fields"><label htmlFor="demo-date">Date prévue<input className="field" id="demo-date" type="date" value={date} onInput={event => { setDate(event.currentTarget.value);setNotice('La date de votre sujet a été mise à jour dans cette démonstration.'); }} onChange={event => setDate(event.target.value)} /></label><label htmlFor="demo-status">Statut<select className="field" id="demo-status" value={status} onChange={event => setStatus(event.target.value)}><option value="idea">Idée</option><option value="in_progress">En rédaction</option><option value="ready">Prêt</option><option value="published">Publié</option></select></label></div><p className="demo-planned-result">{date ? `Prévu le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(`${date}T12:00:00Z`))}` : 'Ce sujet est dans le bac « À planifier ».'}</p><button className="btn btn-secondary" onClick={() => setView('note')}>Revenir à ma note</button></section>)}
      </div>
    </div>
    <div className="demo-foot"><p role="status">{notice || 'Les essais sont effacés à la fermeture ou au rechargement de la page.'}</p><button className="btn btn-ghost" onClick={reset}><RotateCcw aria-hidden="true" />Recommencer</button></div>
    <footer className="demo-footer"><p>Dans votre espace : sources RSS réelles, notes privées, enregistrement automatique et exports.</p><Link href={signupEnabled ? '/inscription' : '/'}>{signupEnabled ? 'Créer mon espace privé' : 'Découvrir les fonctionnalités'}<ArrowRight aria-hidden="true" /></Link></footer>
  </main>;
}
