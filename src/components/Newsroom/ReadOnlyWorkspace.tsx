'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { DatabaseSchema } from '@/types';
import { getNoteSources } from '@/lib/note-model';
import { safeWebUrl } from './dialog';
import './read-only.css';

export function ReadOnlyWorkspace({ database }: { database: DatabaseSchema }) {
  const [query, setQuery] = useState('');
  const normalized = query.toLocaleLowerCase('fr');
  const notes = database.posts.filter(note => `${note.angle} ${note.notes || ''}`.toLocaleLowerCase('fr').includes(normalized));
  const articles = database.savedArticles.filter(article => article.title.toLocaleLowerCase('fr').includes(normalized));
  return <main className="read-only-workspace">
    <header><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">r.</span><span className="brand-name">La Rédaction</span></Link><Link className="btn btn-primary" href="/compte">Mon compte et mon abonnement</Link></header>
    <h1>Votre espace en lecture seule</h1>
    <p className="read-only-intro">Vos notes et vos articles restent consultables. Réactivez votre abonnement pour écrire et actualiser vos sources.</p>
    <a className="btn btn-secondary" href="/api/account/export" download>Télécharger toutes mes données</a>
    <label className="read-only-search"><Search aria-hidden="true" /><span className="sr-only">Rechercher dans mes notes et articles</span><input className="field" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher dans mes notes et articles" /></label>
    <section aria-labelledby="readonly-notes"><h2 id="readonly-notes">Mes notes</h2>
      {!notes.length && <p>{query ? 'Aucune note ne correspond à votre recherche.' : 'Vous n’avez pas encore de note dans cet espace.'}</p>}
      {notes.map(note => <article className="read-only-note" key={note.id}><h3>{note.angle || 'Sans titre'}</h3><p className="read-only-text">{note.notes || 'Cette note ne contient pas encore de texte.'}</p>{getNoteSources(note).length > 0 && <details><summary>Sources de la note</summary><ul>{getNoteSources(note).map((source, index) => <li key={`${source.link}:${index}`}>{safeWebUrl(source.link) ? <a href={source.link} target="_blank" rel="noopener noreferrer">{source.title || source.link}</a> : source.title}{source.excerpt && <p className="read-only-text">{source.excerpt}</p>}</li>)}</ul></details>}</article>)}
    </section>
    <section aria-labelledby="readonly-articles"><h2 id="readonly-articles">Mes articles enregistrés</h2>{!articles.length && <p>{query ? 'Aucun article ne correspond à votre recherche.' : 'Aucun article enregistré.'}</p>}<ul className="read-only-articles">{articles.map(article => <li key={article.id}>{safeWebUrl(article.link) ? <a href={article.link} target="_blank" rel="noopener noreferrer">{article.title}</a> : article.title}<small>{article.feedName}</small></li>)}</ul></section>
    <footer><Link href="/compte">Revenir à mon compte</Link></footer>
  </main>;
}
