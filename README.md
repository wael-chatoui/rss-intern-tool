# La rédaction

Un espace de veille RSS, de notes sourcées et de rédaction pour construire une chaîne de presse indépendante. L’interface utilise un thème clair uniquement, avec une direction éditoriale papier et vert forêt.

## Utilisation

- **Veille RSS** : lecture en magazine ou en liste, recherche locale instantanée, filtres par source, langue et thématique, suivi lu/non lu.
- **Enregistrés** : sélection persistante, y compris les articles qui ne sont plus dans le cache RSS.
- **Notes & rédaction** : notes libres ou créées depuis un article avec son lien source. Enregistrement automatique, statuts, mots-clés et export Markdown. Les contenus TikTok, Instagram et LinkedIn existants restent accessibles dans les onglets du carnet.
- **Planning éditorial** : tableau de préparation et calendrier. Un sujet peut être créé à la date sélectionnée. Le planning organise le travail ; il n’exécute pas de publication sur les réseaux.
- **Mes sources** : ajout d’un flux RSS après vérification, activation, pause, recherche et retrait avec confirmation.

Le raccourci `⌘ K` ou `Ctrl K` ouvre la recherche dans la veille. Les sources de mode déjà présentes sont conservées et de nouvelles sources peuvent être ajoutées.

## Démarrage

```sh
npm install
npm run dev
```

Ouvrir [l’application locale](http://localhost:3000).

```sh
npm run build
npm run start
```

Vérification TypeScript : `npx tsc --noEmit --incremental false`.

## Technique et données

Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide et rss-parser. L’application stocke les sources, notes, articles sélectionnés et cache dans `data/db.json`. Les écritures sont atomiques et les mutations sont sérialisées dans le processus serveur. Ce stockage est conçu pour un usage personnel local avec un seul processus serveur.

Le cache RSS dure dix minutes. Une source indisponible conserve ses derniers articles et affiche un avertissement lors de l’actualisation. Les identifiants d’articles sont stables et distincts par source et lien ; les anciens identifiants sont migrés automatiquement. Les contenus RSS sont affichés comme texte sûr dans le lecteur.

Les choix graphiques sont documentés dans `.ui-craft/brief.md` et `.ui-craft/tokens.md`. Les composants actifs de la refonte sont dans `src/components/Newsroom`.
