# La rédaction

## Product
Espace de travail personnel pour construire une chaîne de presse indépendante : lire ses sources RSS, conserver les informations, prendre des notes sourcées, rédiger et organiser la publication.

## Audience et tâche
Une personne qui assure la veille et la rédaction. En une minute : repérer un article utile et en tirer une note sans perdre sa source.

## Direction
Thème clair uniquement, papier presque blanc, encre sombre, accent vert forêt. Newsreader pour les titres éditoriaux, DM Sans pour les contrôles. Navigation stable, densité modérée, animations de retour uniquement. La signature est le repère de navigation vert associé aux notes.

## Principes classés
1. La source reste attachée à l'idée. Conserver les liens, sans inventer d'analyse à partir d'un extrait.
2. Une tâche principale par espace. Veille, notes, planning et gestion des sources ont chacun un espace lisible.
3. Écrire sans perdre son travail. Persistance, états d'enregistrement et erreurs explicites.
4. Le contenu avant les compteurs. Images et titres structurent la veille ; les chiffres restent contextuels.

## Contraintes
Next.js 14, React 18, Tailwind et CSS, Lucide. Garder la base existante et ses flux de mode, sans imposer ce secteur aux nouveaux contenus. Le planning organise les sujets, sans prétendre les publier automatiquement.

## Contraintes apprises
- 2026-10-15 : refonte complète demandée, UX et direction artistique existantes rejetées. Thème clair seulement.

- 2026-10-15 : outil interne. Aucun slogan, accroche marketing ou texte décoratif. Titres de sections fonctionnels, textes courts et factuels, aide seulement si elle facilite une action.

## Composition
Navigation latérale 224 px, barre de contexte 64 px, espace de veille large et carnet secondaire. Sur mobile, navigation repliée et contenu sur une seule colonne. Notes : liste de sujets puis page d'écriture. Planning : tableau ou calendrier.

Import / export : choix du contenu, du format et de la sélection. L’import présente les changements et doublons avant écriture. Les sauvegardes restent accessibles dans un onglet dédié. PDF pour les notes et les articles, extraction de texte pour l’import de notes.


## Accueil public et accès propriétaire
- 2026-10-15 : ajout demandé d’une landing et d’une authentification. Un seul compte propriétaire e-mail/mot de passe protège l’espace existant.
- Charte existante conservée : papier, vert forêt, Newsreader et DM Sans. Landing factuelle à hero asymétrique, variance 7, signature : capture réelle recadrée du produit avec données de démonstration. Aucun tarif ni témoignage inventé.
- Connexion à deux panneaux, variance 4. Signature : accueil lié au métier, « Retrouvez vos sources et vos notes ». Étiquettes visibles, erreurs accessibles, affichage du mot de passe, session de sept jours et déconnexion.


## Continuité et fiabilité du travail éditorial
- 2026-10-19 : priorité UX confirmée. Sauvegardes versionnées, conflits explicites, copies locales récupérables et erreurs propres à chaque collection.
- Veille et sélection conservent leur recherche, leurs filtres et leur position. Sections, notes et lecteur ont une URL ; le retour navigateur suit le parcours.
- Un sujet rassemble plusieurs références. Les extraits importés restent séparés de l’angle et du texte de l’auteur. Le lecteur permet « Lu et suivant » et l’ajout à un sujet existant.
- Recherche dans le texte intégral et les déclinaisons sociales, sources avec diagnostic persistant, calendrier avec bac « À planifier ». Le cache se lit avant la collecte distante.
