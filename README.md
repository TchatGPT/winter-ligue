# Winter Ligue ❄

Ligue hivernale **Call of Duty: Warzone**. Classement de saison, économie de flocons,
boosters, cartes bonus/malus et hôtel des ventes entre joueurs.

Suite de [Summer Ligue](https://summer-ligue.com), sur une base neuve : les roues sont
remplacées par un système de **boosters et de cartes**, et toute la logique de jeu a été
déplacée côté serveur.

---

## Le principe

**Le score d’une game**

```
score = (kills × multiplicateur) + points de classement + bonus
```

1 kill = 1 point. Top 1 : +20, Top 2 : +15, Top 3 : +8. Le multiplicateur ne s’applique
qu’aux kills — les points de classement restent fixes.

**Les flocons ❄** — la monnaie de la saison. Deux sources, et la séparation est le cœur
de l’équilibre : **le jeu** (25 ❄ par kill, 400/250/120 ❄ selon le podium, 150 ❄ par game)
est la seule source qui crée un écart entre joueurs ; **les subs** arrosent tout le monde
également.

**Les subs Twitch** — chaque palier de subs verse **à tous les joueurs actifs, à parts
égales**. Le chat fait grossir l’économie entière ; il ne fait monter personne au
classement. C’est ce qui empêche le pay-to-win.

| Palier | Récompense, pour chaque joueur |
|---|---|
| tous les 5 subs | 40 ❄ |
| tous les 25 subs | +200 ❄ |
| tous les 100 subs | un booster Givre |
| tous les 500 subs | un booster Aurore |

Un gifteur peut désigner un joueur à partir de 5 subs : celui-ci reçoit une **carte
commune au hasard**, jamais des flocons.

**Les boosters** — 4 boosters, de 150 à 3 000 ❄, avec raretés garanties et courbe de
tirage améliorée à mesure du prix. Le tirage est fait par le serveur avec
`crypto.randomInt`, et s’ouvre en 3D dans le navigateur.

**Les raretés** — six paliers. Les poids sont exprimés sur 100 000 pour rester exacts.

| Rareté | Par carte | Au moins une par booster de 5 |
|---|---|---|
| C — Commune | 73 % | — |
| PC — Peu commune | 20 % | — |
| R — Rare | 5,7 % | 1 booster sur 4 |
| SR — Super rare | 1 % | 1 sur 20 |
| UR — Ultra rare | 0,28 % | 1 sur 72 |
| **L — Légendaire** | **0,02 %** | **1 sur 1 000** |

**Les cartes** — 24 cartes, 4 familles × 6 raretés. Chacune est soit un **bonus** à jouer
sur soi, soit un **malus** à poser sur un adversaire.

| Famille | Rôle | 4/6 | 6/6 |
|---|---|---|---|
| ❄ Glace Éternelle | Geler, protéger | +8 places de réserve | +20 places |
| 🌪 Tempête | Multiplicateurs de kills | +3 % de kills | +7 % de kills |
| 🌌 Aurore Boréale | Points et flocons | +8 ❄ par game | +20 ❄ par game |
| 🎁 Solstice | Chaos et malus | −8 % en boutique | −18 % et −50 % de taxe |

Le palier à 4 cartes n’est pas un cadeau : la légendaire d’une famille sort une ouverture
sur mille, exiger les six d’emblée rendrait le bonus décoratif. Les cartes manquantes
s’achètent à l’hôtel des ventes.

Le volet hybride : **une carte jouée est consommée, mais sa découverte est définitive.**
Les bonus de famille sont donc un acquis, que ni la revente ni l’usage ne font perdre.

**La réserve** — 40 places de base. Le plafond est appliqué à l’ouverture d’un booster,
et il est économique avant d’être ergonomique : sans lui, les cartes s’accumulent et
l’hôtel des ventes se vide.

**L’hôtel des ventes** — chaque carte peut être mise aux enchères avec un prix de départ,
un achat immédiat facultatif et une durée (1 h à 72 h). Enchérir bloque les flocons en
séquestre ; ils sont rendus dès qu’on est dépassé. Une mise dans la dernière minute
repousse la clôture d’une minute. Chaque carte a sa cote : dernier prix, dernier
acheteur, moyenne, extrêmes, volume, tendance 7 jours et courbe des ventes.

---

## Démarrer

```bash
npm install
npm run hash-password -- "un mot de passe long"   # copier la sortie dans .env.local
cp .env.example .env.local                        # puis compléter
npm run seed                                      # saison de démonstration (facultatif)
npm run dev
```

Sur <http://localhost:3000>. Avec `ALLOW_DEV_LOGIN=true`, la page `/connexion` propose
d’incarner un joueur pour tester cartes et enchères sans Twitch.

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm test` | Tests du domaine (score, économie, collection, marché) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run seed` | Écrit une saison de démonstration dans `.data/` |
| `npm run hash-password -- "…"` | Génère `ADMIN_PASSWORD_HASH` et `AUTH_SECRET` |

---

## Architecture

```
app/
├─ page.tsx              Classement général
├─ boosters/             Achat, ouverture 3D, catalogue des 24 cartes
├─ marche/               Hôtel des ventes
│  └─ [cardId]/          Cote d’une carte : courbe de prix, historique
├─ ma-collection/        Réserve, collection, ventes, grand livre
├─ joueurs/[slug]/       Profil public
├─ regles/               Règles, lues depuis le code
├─ admin/                Modération
└─ api/                  Toutes les écritures passent par ici

lib/
├─ domain/               Règles pures, sans I/O — testées
│  ├─ rules.ts           Constantes, taux de rareté, paliers de subs
│  ├─ catalog.ts         Raretés, cartes, familles, boosters
│  ├─ scoring.ts         Calcul des scores et du classement
│  ├─ economy.ts         Flocons
│  ├─ collection.ts      Bonus de familles
│  ├─ market.ts          Pas d’enchère, anti-snipe, taxe, statistiques
│  └─ rng.ts             Tirage des boosters (serveur uniquement)
├─ db/                   Adaptateur de stockage + transactions sérialisées
├─ auth/                 Sessions signées, OAuth Twitch (prêt, désactivé)
├─ security/             Limitation de débit
├─ api/                  Validation Zod, garde-fous, réponses
└─ services/             Orchestration : cartes, marché, subs, ligue, grand livre
```

Une règle structure tout le reste : **`lib/domain` ne fait aucune entrée-sortie.**
C’est ce qui rend le calcul des scores et des enchères testable en isolation, et ce qui
garantit qu’une même règle ne peut pas diverger entre l’affichage et le serveur.

---

## Sécurité

Le site est conçu pour qu’un joueur ne puisse **rien** modifier depuis son navigateur.
Le détail est dans [`docs/SECURITE.md`](docs/SECURITE.md). En résumé :

- **Aucun score ne vient du client.** Le navigateur envoie des kills, un placement, un
  identifiant de carte. Le score est calculé — et recalculé — côté serveur.
- **Le tirage des boosters est serveur**, avec une source cryptographique. Le module est
  marqué `server-only` : le build échoue s’il partait dans un bundle client.
- **Écritures sérialisées.** Toutes les mutations passent par une file d’attente
  transactionnelle : pas de course concurrente sur les flocons.
- **Séquestre des enchères.** Enchérir débite immédiatement ; on ne peut pas miser deux
  fois le même solde.
- **Sessions HttpOnly signées en HMAC**, vérification d’origine sur toute écriture,
  limitation de débit par IP, CSP avec nonce, `frame-ancestors 'none'`.
- **Aucun versement de subs ne peut viser un joueur** : la route n’expose pas ce
  paramètre, et un test le vérifie.
- **Grand livre et journal d’audit** : chaque mouvement de flocons et chaque action de
  modération laissent une trace.

Avant la mise en production, deux points restent à traiter — ils sont détaillés dans
`docs/SECURITE.md` : remplacer le stockage fichier par une vraie base, et déporter la
limitation de débit si le site tourne sur plusieurs instances.

---

## Ce qui reste à brancher

- **Connexion Twitch** — le flux OAuth est écrit et testé côté code
  (`lib/auth/twitch.ts`, `app/api/auth/twitch/`). Il suffit de renseigner
  `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` : le bouton apparaît, les comptes
  existants ne bougent pas.
- **Base de données** — l’adaptateur actuel écrit dans `.data/league.json`. L’interface
  `Store` (`lib/db/store.ts`) est le seul point à réimplémenter pour passer à
  Postgres/Supabase ; aucun fichier de `lib/domain` ni de `lib/services` n’est à toucher.

---

Fait pour la Winter Ligue.
