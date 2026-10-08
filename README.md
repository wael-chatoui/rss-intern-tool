# 🌟 Fashion Press & Social Cockpit

> **Cockpit personnel de veille de presse fashion internationale et studio de rédaction multicanal (TikTok, Instagram, LinkedIn).**

Cette application réunit les flux RSS des plus grands médias de mode (France & International), vous permet de sélectionner les sujets chauds, de définir votre angle éditorial, et de rédiger instantanément vos déclinaisons pour les réseaux sociaux avec un planning éditorial interactif (Kanban & Calendrier).

---

## 🏛️ Architecture & Organisation de l'Interface

L'interface est structurée selon un **Split-Layout (Gauche / Droite)** optimisé pour un workflow de création sans friction :

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  HEADER : Statuts, KPI (# flux, # articles, # posts prêts), Synchronisation, Gestion   │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│        SECTION GAUCHE                    │              SECTION DROITE                 │
│      VEILLE RSS FASHION                  │          ATELIER & PLANNING SOCIAL          │
│                                          │                                             │
│ • Filtres : Catégories (Haute Couture,   │ 1. ✍️ Atelier Rédaction :                     │
│   Business, Streetwear, Tendances, RSE)  │    • TikTok (Hook, Script minuté, B-roll)   │
│ • Langues : Français 🇫🇷 / Anglais 🇬🇧    │    • Instagram (Légende, Carrousel, Tags)   │
│ • Recherche temps réel                   │    • LinkedIn (Analyse marché, Takeaways)   │
│ • Marque-pages (Favoris)                 │    • Compteurs de caractères & Copie 1-clic │
│ • Cartes éditoriales & Lecteur d'article │ 2. 📋 Pipeline Kanban (Idée ➔ Publié)       │
│ • Bouton "Créer un post" direct          │ 3. 📅 Calendrier Éditorial Mensuel          │
│                                          │ 4. ✨ Studio IA (Prêt pour Phase 2)         │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 📰 Sources RSS Fashion Intégrées par Défaut

### 🇫🇷 Médias Français
* **Vogue France** (`https://www.vogue.fr/feed/rss`) — Haute Couture & Défilés
* **FashionNetwork France** (`https://fr.fashionnetwork.com/rss/news/`) — Business du luxe & Retail
* **ELLE Mode** (`https://www.elle.fr/Mode/rss`) — Tendances & Célébrités
* **Madame Figaro Mode** (`https://madame.lefigaro.fr/mode/feed`) — Haute Joaillerie & Couture

### 🇬🇧 Médias Internationaux
* **The Business of Fashion (BoF)** (`https://www.businessoffashion.com/arc/outboundfeeds/rss/`) — Analyses marché & Économie
* **Hypebeast** (`https://hypebeast.com/feed`) — Streetwear & Sneaker Culture
* **Highsnobiety** (`https://www.highsnobiety.com/feed/`) — Streetwear haut de gamme & Mode contemporaine
* **Fashionista** (`https://fashionista.com/.rss/full/`) — Culture mode & Tendances
* **Vogue US** (`https://www.vogue.com/feed/rss`) — Actualités mode mondiale
* **Dazed Fashion** (`https://www.dazeddigital.com/rss/fashion`) — Avant-garde & Pop culture

*Note : Vous pouvez ajouter n'importe quel flux RSS personnalisé ou désactiver des flux existants via le bouton **"Sources RSS"** dans le bandeau supérieur.*

---

## 🚀 Démarrage Rapide

### 1. Démarrer le serveur de développement
```bash
npm run dev
```

L'application est disponible sur : **[http://localhost:3000](http://localhost:3000)**

### 2. Builder pour la production
```bash
npm run build
npm run start
```

---

## 🛠️ Stack Technique

* **Framework :** [Next.js 14](https://nextjs.org/) (App Router, Route Handlers, Server Components)
* **Langage :** TypeScript 5.6
* **UI & Styles :** Composants shadcn/ui (Button, Input, Badge, Card, Separator), Tailwind CSS avec palette sombre épurée à faible contraste
* **Séparateur Dynamique :** Volet redimensionnable à la souris en temps réel avec mémorisation locale
* **Flux RSS :** `rss-parser` avec extraction automatique des vignettes/images, détection des balises d'auteurs et sanitisation HTML
* **Persistance :** Base de données locale JSON auto-gérée (`data/db.json`), zéro dépendance C++/node-gyp complexe, backup immédiat
* **Composants & Icônes :** Lucide React, Date-fns

---

## 🤖 Préparation de la Feature IA (Phase 2)

Comme convenu, **l'appel effectif aux modèles IA est en attente**. Cependant, le socle est entièrement architecturé pour l'accueillir :
1. **Modèle de données prêt :** Découpage strict des formats vidéo TikTok, carrousels Instagram et analyses LinkedIn.
2. **Onglet Assistant IA :** Contient des **templates de prompts calibrés pour l'actualité mode** que vous pouvez déjà copier-coller dans ChatGPT, Claude ou Gemini en 1 clic.
3. **Branchage API futur :** Une route dédiée pourra simplement recevoir votre clé OpenAI/Gemini/Anthropic pour automatiser la génération des 3 formats à partir du texte de l'article RSS sélectionné.
