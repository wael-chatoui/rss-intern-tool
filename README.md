# La rédaction

Un espace de veille RSS, de notes sourcées et de rédaction pour construire une chaîne de presse indépendante. L’interface utilise un thème clair uniquement, avec une direction éditoriale papier et vert forêt.

## Utilisation

- **Veille RSS** : lecture en magazine ou en liste, recherche locale dans le texte intégral (accents ignorés), filtres par source, langue et thématique, suivi lu/non lu et parcours « Lu et suivant » dans l’ordre de la sélection.
- **Enregistrés** : sélection persistante, y compris les articles qui ne sont plus dans le cache RSS.
- **Notes & rédaction** : notes libres ou créées depuis un article, avec plusieurs références par sujet. Un article peut rejoindre une note existante. Les extraits sources restent séparés de « Mon angle » et « Mes notes ». Enregistrement automatique, statuts, mots-clés et exports. Les contenus TikTok, Instagram et LinkedIn existants restent accessibles dans les onglets du carnet.
- **Planning éditorial** : tableau de préparation et calendrier. Un sujet peut être créé à la date sélectionnée. Un bac « À planifier » permet d’affecter les sujets existants à la date sélectionnée. Le planning organise le travail ; il n’exécute pas de publication sur les réseaux.
- **Mes sources** : ajout à partir d’une URL de site ou de flux, détection des doublons, activation, pause et retrait avec confirmation. Chaque source affiche sa dernière réussite et son éventuelle erreur, avec une relance ciblée.

La section, les filtres, le mode de lecture et la note ou l’article ouvert disposent d’une URL. La veille et la sélection gardent chacune leur contexte et leur position de retour. Après une note, « Revenir à ma veille » reprend ce contexte.

Les notes sont versionnées : un ancien onglet ne peut pas écraser une modification plus récente. L’éditeur présente les deux versions et permet de conserver son travail dans une nouvelle note. Les brouillons en attente sont copiés sur cet appareil, séparément par compte et onglet ; après rechargement, l’encart « Copies locales » permet de les reprendre ou de les télécharger. L’application signale aussi un stockage local plein et conserve le brouillon ouvert.

Le raccourci `⌘ K` ou `Ctrl K` ouvre la recherche dans la veille. Les sources de mode déjà présentes sont conservées et de nouvelles sources peuvent être ajoutées.

## Démarrage

```sh
npm install
npm run dev
```

Avant la première connexion, créez votre compte propriétaire dans un terminal interactif :

```sh
npm run auth:setup
```

La commande demande votre nom, votre e-mail et un mot de passe de 15 à 128 caractères, avec saisie masquée et confirmation. Aucun compte ni mot de passe par défaut n’est créé.

Ouvrir [la page d’accueil locale](http://localhost:3000). La landing est publique à `/`, la connexion se trouve à `/connexion` et l’espace éditorial protégé à `/espace`. Les données existantes sont conservées.

Pour réinitialiser le mot de passe, arrêtez le serveur puis exécutez `npm run auth:setup -- --reset` dans le même répertoire de données. Cette opération révoque toutes les sessions. Redémarrez ensuite le serveur. La réinitialisation demande un accès local à l’hébergement, sans envoi d’e-mail.

```sh
npm run build
npm run start
```

Vérification TypeScript : `npx tsc --noEmit --incremental false`.

## Technique et données

Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide et rss-parser. L’application stocke les sources, notes, articles sélectionnés et cache dans `data/db.json`. Les écritures sont atomiques et les mutations sont sérialisées dans le processus serveur. Ce stockage est conçu pour un usage personnel local avec un seul processus serveur.

Le cache RSS dure dix minutes. Le dernier contenu disponible s’affiche immédiatement, puis la collecte se poursuit en arrière-plan si nécessaire. La santé de chaque source est conservée après rechargement. Les collectes ciblées gardent les articles et diagnostics des autres sources. Une source indisponible conserve ses derniers articles et affiche un avertissement lors de l’actualisation. Les identifiants d’articles sont stables et distincts par source et lien ; les anciens identifiants sont migrés automatiquement. Le lecteur reconstruit les paragraphes, listes et liens HTTP(S) du flux, sans insérer son HTML brut. Le lien vers l’original reste visible dès le début de la lecture.

Sur un hébergement en lecture seule comme Vercel, le cache RSS utilise la mémoire du processus si son écriture est refusée. Les articles restent consultables. Ce cache temporaire est reconstruit à la demande et ne constitue pas un stockage durable. Cette solution concerne uniquement le cache RSS : un stockage persistant reste nécessaire pour enregistrer durablement les notes et les préférences sur un hébergement serveur. Les anciennes adresses intégrées ELLE, FashionNetwork, Madame Figaro et Dazed sont migrées vers les flux officiels vérifiés. Dazed couvre désormais la mode et la culture. Les erreurs HTTP, délais et réponses invalides sont signalés par source.

Tests RSS isolés : `npm run test:rss` (serveur HTTP local de test, sans données utilisateur).

Les choix graphiques sont documentés dans `.ui-craft/brief.md` et `.ui-craft/tokens.md`. Les composants actifs de la refonte sont dans `src/components/Newsroom`.

## Import et export

La section **Import / export** est accessible dans la navigation et depuis les notes, la veille et les sources.

| Données | Import | Export |
| --- | --- | --- |
| Sources RSS | OPML, JSON | OPML, JSON |
| Notes | Markdown, TXT, HTML, JSON, ZIP, PDF texte | Markdown, TXT, HTML, JSON, PDF |
| Articles | CSV, Markdown, HTML, JSON | CSV, Markdown, HTML, JSON, PDF |
| Espace complet | Sauvegarde JSON | Sauvegarde JSON |

Les notes peuvent être sélectionnées individuellement. La veille peut être exportée selon les filtres courants, les articles enregistrés ou l’ensemble des articles disponibles. Les exports multiples Markdown, TXT et HTML sont regroupés dans un ZIP contenant aussi un manifeste JSON. Les PDF regroupent le contenu dans un document paginé. Une note peut aussi être exportée depuis son éditeur.

Chaque import affiche un aperçu des ajouts, mises à jour et doublons avant confirmation. Les doublons sont ignorés par défaut ; leur mise à jour doit être choisie explicitement. Les articles importés sont conservés dans **Enregistrés**. Les flux importés ne sont pas contactés pendant l’import.

Une sauvegarde automatique précède chaque import et restauration. Les dix dernières sont téléchargeables dans l’onglet **Sauvegardes**. La restauration complète remplace l’état courant après confirmation, avec contrôle des modifications intervenues depuis l’aperçu. Les fichiers se trouvent dans `data/backups/` et sont exclus de Git.

JSON et les formats natifs Markdown/HTML/ZIP conservent les métadonnées éditoriales. Les PDF importés deviennent du texte : les images et la mise en page ne sont pas reprises. Les documents scannés sans texte nécessitent un OCR externe. Les caractères absents des polices d’export sont signalés et représentés par leur code Unicode.

Limites : 20 Mo par fichier et par requête d’import, 10 000 enregistrements par import. Les archives sont contrôlées avant décompression. Les PDF sont limités à 500 pages et 2 millions de caractères extraits.

L’application nécessite Node.js 22.13 ou ultérieur. Le worker PDF est copié localement par `predev` et `prebuild` ; aucun service de conversion externe n’est utilisé. `RSS_DATA_DIR` permet de définir un autre répertoire de données, notamment pour les tests.

Vérification : `npm test` (notes versionnées, brouillons, parcours d’écriture, navigation, recherche et transferts), `npm run test:rss`, `npm run test:auth`, puis `npm run build`. Les tests de transfert utilisent une base temporaire et ne modifient pas `data/db.json`.


## Authentification et hébergement

Un seul compte propriétaire protège l’espace existant. Les inscriptions publiques sont fermées. Toutes les API de données, y compris les sauvegardes, vérifient la session avant tout accès. La connexion utilise un cookie HttpOnly, SameSite=Lax, Secure en production, expirant après sept jours. La déconnexion révoque la session côté serveur, après l’enregistrement des notes en attente.

Les mots de passe sont dérivés avec scrypt et un sel aléatoire. Les sessions sont opaques, générées aléatoirement et stockées uniquement sous forme de condensats SHA-256. Dix tentatives de connexion sont autorisées par fenêtre de quinze minutes pour l’ensemble du compte ; la limite persiste après redémarrage. Une connexion réussie réinitialise le compteur.

`data/auth.json` contient le propriétaire, ses secrets dérivés et les sessions. Ce fichier et ses temporaires sont exclus de Git et des exports éditoriaux. Les permissions de création sont 0600. Conservez-le dans un volume persistant privé. Une restauration éditoriale ne modifie pas le compte propriétaire.

En production, utilisez HTTPS et configurez `AUTH_ORIGIN` avec l’origine publique exacte, par exemple `https://redaction.example.com`. Toutes les mutations exigent une origine identique. Le proxy doit contrôler les en-têtes Host et X-Forwarded-Proto. Le stockage JSON, les sauvegardes et l’authentification nécessitent un disque inscriptible et **un seul processus Node.js**. Un hébergement éphémère, plusieurs instances ou une ouverture multi-utilisateurs demandent une base de données adaptée.

`RSS_DATA_DIR` s’applique aussi au stockage d’authentification et doit être identique lors de l’installation du compte et du lancement du serveur. La commande d’installation utilise TypeScript, déjà présent parmi les dépendances de développement ; installez-les avant de créer ou réinitialiser le compte.

Vérifications auth isolées : `npm run test:auth`. Aucun compte ni fichier de données utilisateur n’est modifié par ces tests. `RSS_BUILD_DIR` permet un répertoire de compilation séparé pour les aperçus et les tests.


Références d’implémentation : [authentification Next.js 14](https://nextjs.org/docs/14/app/building-your-application/authentication), [stockage des mots de passe OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [gestion des sessions OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
