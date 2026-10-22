# La Rédaction

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
# Usage personnel local : nommer explicitement le répertoire persistant.
export RSS_DATA_DIR="$PWD/data"
npm run start
```

Vérification TypeScript : `npx tsc --noEmit --incremental false`.

## Technique et données

Next.js 15.5.28, React 18, TypeScript, Tailwind CSS, Lucide et rss-parser. Sur Vercel, les sources, notes, articles, sessions et sauvegardes utilisent une base libSQL/Turso durable. Les mutations utilisent une transaction d’écriture, y compris entre plusieurs instances serveur. Sans configuration distante, un usage personnel local reste possible avec `data/db.json` et un seul processus Node. En production, il exige un `RSS_DATA_DIR` persistant explicitement choisi. Sur Vercel, Netlify, Cloudflare Pages et AWS Lambda, l’absence de base distante authentifiée ou une URL SQLite locale provoque une erreur explicite. `REQUIRE_DURABLE_STORAGE=1` impose la même garde sur tout autre hôte, sans repli éphémère.

Le cache RSS dure dix minutes. Le dernier contenu disponible s’affiche immédiatement, puis la collecte se poursuit en arrière-plan si nécessaire. La santé de chaque source est conservée après rechargement. Les collectes ciblées gardent les articles et diagnostics des autres sources. Une source indisponible conserve ses derniers articles et affiche un avertissement lors de l’actualisation. Les identifiants d’articles sont stables et distincts par source et lien ; les anciens identifiants sont migrés automatiquement. Le lecteur reconstruit les paragraphes, listes et liens HTTP(S) du flux, sans insérer son HTML brut. Le lien vers l’original reste visible dès le début de la lecture.

Les flux sont téléchargés avec contrôle des adresses publiques et des réponses DNS. Chaque redirection est revérifiée ; les adresses privées, locales, les métadonnées d’hébergement et les identifiants dans les URL sont refusés. Le lecteur reconstruit le texte sans injecter le HTML brut. Le proxy d’images distant est désactivé, car l’application utilise directement les images des sources.

Les anciennes adresses intégrées ELLE, FashionNetwork, Madame Figaro et Dazed sont migrées vers leurs flux officiels. Les erreurs HTTP, délais et réponses invalides sont signalés par source.

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

Une sauvegarde automatique précède chaque import et restauration. Les dix dernières sont téléchargeables dans l’onglet **Sauvegardes**. La restauration complète remplace l’état courant après confirmation, avec contrôle des modifications intervenues depuis l’aperçu. En mode local, les fichiers se trouvent dans `data/backups/` et sont exclus de Git. En mode distant, les sauvegardes sont stockées dans la même base durable et dans le même espace privé que leur propriétaire.

JSON et les formats natifs Markdown/HTML/ZIP conservent les métadonnées éditoriales. Les PDF importés deviennent du texte : les images et la mise en page ne sont pas reprises. Les documents scannés sans texte nécessitent un OCR externe. Les caractères absents des polices d’export sont signalés et représentés par leur code Unicode.

Limites : 20 Mo par fichier et par requête d’import, 10 000 enregistrements par import. Les archives sont contrôlées avant décompression. Les PDF sont limités à 500 pages et 2 millions de caractères extraits.

L’application nécessite Node.js 22.19 ou ultérieur. Le worker PDF est copié localement par `predev` et `prebuild` ; aucun service de conversion externe n’est utilisé. `RSS_DATA_DIR` permet de définir un autre répertoire de données, notamment pour les tests.

Vérification : `npm test` (notes versionnées, brouillons, parcours d’écriture, navigation, recherche et transferts), `npm run test:rss`, `npm run test:auth`, puis `npm run build`. Les tests de transfert utilisent une base temporaire et ne modifient pas `data/db.json`.


## Authentification, espaces privés et abonnement

Le propriétaire conserve son espace existant et ne paie pas d’abonnement. Chaque abonné possède un compte, des sessions, un document éditorial et des sauvegardes indépendants. Le serveur déduit l’espace du cookie de session opaque ; aucun identifiant fourni par le navigateur ne sélectionne un autre compte. Une nouvelle inscription commence avec un espace vide et choisit ses propres sources. Elle ne reçoit aucune note ni source du propriétaire ou d’un autre abonné.

Les inscriptions sont fermées par défaut (`PUBLIC_SIGNUP_ENABLED=0`). Le paiement est fermé par défaut (`BILLING_ENABLED=0`). Avant ouverture : vérifier l’identité et les informations du vendeur, les conditions applicables à l’hébergement et une recette Stripe en mode test. Aucun tarif n’est envoyé par le navigateur : `STRIPE_PRICE_MONTHLY` est relu côté serveur et doit être actif, dans le bon mode, à 590 centimes EUR par mois (intervalle 1, `per_unit`, `licensed`, taxes incluses). Son produit actif doit porter `metadata.application=la-redaction`. Stripe Tax reste désactivé dans Checkout. Les anciennes sessions incompatibles sont expirées avant remplacement. Checkout accepte les codes promotionnels créés dans Stripe. Le portail Stripe permet de gérer l’abonnement et les factures.

Avant tout nouveau Checkout, `BILLING_TERMS_URL` et `BILLING_PRIVACY_URL` doivent désigner des documents publics relus, en HTTPS et sur l’origine de `APP_BASE_URL`. Aucun lien n’est déduit par défaut. La case d’accord aux conditions de vente est demandée côté serveur ; les anciens Checkout sans cette case ou avec d’autres liens sont expirés. Stripe exige aussi une URL de conditions valide dans les coordonnées publiques du Dashboard, configurée séparément. Voir [les prérequis et limites de cette collecte](docs/CHECKOUT_CONSENT.md). Cette préparation n’ouvre pas les ventes et ne constitue pas à elle seule le parcours contractuel complet.

L’accès en écriture et la collecte RSS nécessitent un abonnement actif confirmé côté serveur. La consultation des notes, des articles enregistrés et l’export complet restent disponibles après résiliation, depuis `/espace` et `/compte`. Le retour d’un paiement ne donne aucun droit : seul un webhook signé, cohérent avec le compte, le produit et le mode configurés met à jour l’abonnement. Les événements rejoués ou anciens sont traités sans doublon.

L’archivage d’un prix ou de son produit bloque les nouveaux achats, mais conserve les droits d’un abonnement existant valide. Il ne remplace pas une résiliation Stripe.

Les mots de passe sont dérivés avec scrypt et un sel aléatoire. Les sessions sont opaques, stockées sous forme de condensats SHA-256, expirent après sept jours et sont révoquées à la déconnexion. Le cookie est HttpOnly, SameSite=Lax et Secure en production. Les mutations vérifient l’origine exacte. Le compteur des échecs de connexion persiste, ainsi que la limitation des inscriptions. Les données d’authentification ne figurent jamais dans les exports éditoriaux.

L’installation propriétaire sur serveur utilise un lien privé `/activation#token=…`, avec un jeton aléatoire de 32 octets. Seul son SHA-256 est configuré dans `AUTH_SETUP_TOKEN_SHA256`, accompagné de `AUTH_SETUP_EXPIRES_AT`. Le fragment ne part pas dans la requête HTTP et est retiré de l’URL dès ouverture. La création du compte consomme atomiquement la possibilité d’installation ; le lien ne peut pas remplacer un compte existant. Le propriétaire choisit lui-même son mot de passe dans le formulaire. `OWNER_RESERVED_EMAIL` peut réserver son adresse avant l’ouverture des inscriptions.

`AUTH_ORIGIN` et `APP_BASE_URL` doivent correspondre à l’origine publique exacte. Les variables attendues sont décrites dans `.env.example`. Les secrets restent uniquement dans l’environnement serveur.

## Migration et restauration

Une migration initiale explicite préserve les fichiers d’origine, enregistre une copie privée avant envoi, puis vérifie l’égalité complète et le SHA-256 du document migré. Elle refuse de remplacer une destination déjà initialisée :

```sh
node --env-file=.env.migration.local scripts/migrate-durable.cjs --from /chemin/prive/db.json --backup-dir /chemin/prive/sauvegardes
```

Le compte et les sauvegardes locales sont également transférés s’ils existent. Les anciens identifiants d’infrastructure et du dépôt restent inchangés. Ne placez jamais les fichiers d’authentification ou les liens d’activation dans Git.

## Hébergement portable

`output: standalone` et le `Dockerfile` permettent un hébergement Node 22 hors Vercel, avec le même stockage Turso. Le conteneur s’exécute sans privilèges root et les fichiers d’environnement et de données sont exclus de l’image. Il impose `REQUIRE_DURABLE_STORAGE=1` par défaut. Aucun abonnement d’hébergement payant n’est requis par le code. Vérifiez les conditions commerciales de l’offre d’hébergement avant d’ouvrir les ventes.

```sh
docker build -t la-redaction .
docker run --rm -p 3000:3000 --env-file /chemin/prive/production.env la-redaction
```

Le stockage JSON personnel local demande un volume inscriptible, privé et un seul processus. Dans un conteneur personnel avec un volume réellement monté, cette option exige aussi `REQUIRE_DURABLE_STORAGE=0` et un `RSS_DATA_DIR` pointant vers ce volume. Les inscriptions multi-utilisateurs nécessitent le stockage durable.

## Vérification

- `npm test` : notes, brouillons, navigation, recherche, formats, sauvegardes et restauration.
- `npm run test:rss` : vrais flux HTTP locaux compressés, découverte et cache.
- `npm run test:auth` et `npm run test:activation` : sessions et activation propriétaire à usage unique.
- `npm run test:durable` : trois processus, concurrence, redémarrage, restauration et isolation A/B/propriétaire avec SQLite temporaire.
- `npm run test:stripe` : Checkout idempotent, portail privé, HMAC Stripe réel, rejeux, mode, prix étrangers et résiliation, sans appel de paiement ni réseau.
- `npm run test:security` : SSRF, DNS, IPv4/IPv6, redirections et refus des exceptions de test en production.
- `npm run build`, puis `npm run test:production` : serveur Next compilé, cookies, API privées, abonnements, lecture et export après résiliation.

Ces tests utilisent uniquement des données temporaires et ne modifient pas la base utilisateur. La démo publique `/demo` reste entièrement dans la page et ne contacte aucune API.

Références : [correctifs Next.js du 14 octobre 2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026), [SDK libSQL](https://docs.turso.tech/sdk/ts/reference), [webhooks Stripe](https://docs.stripe.com/webhooks), [idempotence Stripe](https://docs.stripe.com/api/idempotent_requests).
