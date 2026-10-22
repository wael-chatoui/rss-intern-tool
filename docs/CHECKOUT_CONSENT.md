# Accord aux conditions dans Checkout

Correctif technique préparé le 22 octobre 2026. Les inscriptions et paiements restent fermés.
Aucune clé, configuration Dashboard ou page de conditions n’a été modifiée par ce correctif.

## Paramètres Stripe vérifiés

La [référence de création de session](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-consent_collection-terms_of_service)
documente `consent_collection.terms_of_service: 'required'` et son prérequis : une URL de conditions
valide dans les [coordonnées publiques du Dashboard](https://dashboard.stripe.com/settings/public).
Le [guide de collecte de l’accord](https://docs.stripe.com/payments/checkout/custom-components#collect-a-terms-of-service-agreement)
documente `custom_text.terms_of_service_acceptance.message`, avec des liens Markdown. Ces sources
officielles ont été lues dans Chrome ; les types du SDK Stripe 23.0.0 installé confirment ces champs.

L’application demande cette case et insère deux liens explicitement configurés dans le texte
fonctionnel de la case. Le texte distingue « J’accepte les conditions de vente » et « j’ai pris
connaissance de la politique de confidentialité ». Il ne présente pas la case comme un consentement
général au traitement des données ou un accord publicitaire.
Aucun champ de création `terms_url` ou `privacy_policy_url` n’est inventé. Aucun champ `consent`
affirmant une acceptation n’est envoyé.

## Configuration avant une future recette Stripe

1. Finaliser et relire les documents applicables au service. Les pages actuellement publiées,
   qui annoncent une vente fermée, ne constituent pas des CGV payantes validées par ce patch.
2. Configurer `BILLING_TERMS_URL` et `BILLING_PRIVACY_URL` sur le serveur. Les deux URLs doivent être
   absolues, HTTPS, sur l’origine exacte de `APP_BASE_URL`, avec un chemin de document. Les
   identifiants dans l’URL, requêtes, fragments, espaces et caractères qui cassent un lien Markdown
   sont refusés. Le texte envoyé à Stripe ne dépasse pas ses 1 200 caractères. Aucune valeur
   par défaut ne devine un document ou ne certifie son contenu.
3. Dans le bon compte et le bon mode Stripe, renseigner séparément l’URL publique des conditions.
   Vérifier aussi le lien de confidentialité et l’affichage des politiques juridiques de Checkout.
   Ce réglage du compte n’est pas remplacé par les variables de l’application. Le compte Stripe
   partagé par plusieurs produits demande une vérification de la portée des documents publics.
4. Contrôler manuellement que les liens configurés et ceux visibles chez Stripe sont publics,
   atteignables, cohérents avec l’offre et les versions effectivement relues. Le serveur vérifie
   leur structure ; il ne déclare ni l’accessibilité ni la validité juridique de leur contenu.
5. Effectuer une recette hébergée en mode test avant toute décision d’ouverture. Ce correctif n’a
   créé aucune session distante et ne prouve pas encore l’affichage de la case chez Stripe.

Les nouveaux prérequis concernent seulement la création ou la reprise d’un Checkout. Leur absence
ne bloque pas les webhooks ni le portail d’un abonnement existant. Les sessions ouvertes sans la
case obligatoire ou sans les liens courants sont expirées avant remplacement ; une modification
de liens change aussi la clé d’idempotence de la tentative suivante. Les informations du navigateur
ne peuvent pas supprimer la case ni remplacer le prix et les liens du serveur.

## Vérifications et limites

`npm run test:stripe` couvre la validation du tarif, les prérequis légaux, l’API applicative
401/403/503/200, les paramètres documentés, le refus avant tout appel fournisseur en cas de
configuration incorrecte, l’expiration des sessions anciennes et la conservation de l’idempotence.
Les fixtures sont isolées ou en mémoire : aucun paiement ni appel Stripe réel.

Demander cette case n’est pas enregistrer une acceptation. Aucun accord historique n’est créé,
reconstitué ou antidaté ; le webhook existant ne devient pas un registre contractuel avec ce patch.
La conservation d’une preuve associée aux versions exactes des documents, les informations
précontractuelles, la demande éventuelle d’exécution immédiate et les parcours de rétractation
ou de résiliation restent des sujets distincts à traiter avant ouverture. Ce document ne déclare
pas le parcours contractuel complet.
