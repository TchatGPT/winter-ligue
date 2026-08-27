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

**Les flocons ❄** — la monnaie de la saison, gagnée uniquement en jouant : 3 ❄ par kill,
80/50/25 ❄ selon le podium, 15 ❄ par game enregistrée.

**Les boosters** — 4 boosters, de 150 à 2 200 ❄, avec raretés garanties. Le tirage est
fait par le serveur avec `crypto.randomInt`.

**Les cartes** — 16 cartes, 4 familles × 4 raretés. Chacune est soit un **bonus** à jouer
sur soi, soit un **malus** à poser sur un adversaire.

| Famille | Rôle | Bonus si complète |
|---|---|---|
| ❄ Glace Éternelle | Geler, protéger | +1 emplacement de main |
| 🌪 Tempête | Multiplicateurs de kills | +5 % de kills en permanence |
| 🌌 Aurore Boréale | Points et flocons | +15 ❄ par game |
| 🎁 Solstice | Chaos et malus | −15 % en boutique, −50 % de taxe de vente |

Le volet hybride : **une carte jouée est consommée, mais sa découverte est définitive.**
Compléter les quatre cartes d’une famille débloque un bonus permanent que ni la revente
ni l’usage ne font perdre.

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
├─ cartes/               Catalogue des 16 cartes
├─ boutique/             Achat et ouverture de boosters
├─ marche/               Hôtel des ventes
│  └─ [cardId]/          Cote d’une carte : courbe de prix, historique
├─ ma-collection/        Main, collection, ventes, grand livre
├─ joueurs/[slug]/       Profil public
├─ regles/               Règles, lues depuis le code
├─ admin/                Modération
└─ api/                  Toutes les écritures passent par ici

lib/
├─ domain/               Règles pures, sans I/O — testées
│  ├─ rules.ts           Toutes les constantes de saison
│  ├─ catalog.ts         Cartes, familles, boosters
│  ├─ scoring.ts         Calcul des scores et du classement
│  ├─ economy.ts         Flocons
│  ├─ collection.ts      Bonus de familles
│  ├─ market.ts          Pas d’enchère, anti-snipe, taxe, statistiques
│  └─ rng.ts             Tirage des boosters (serveur uniquement)
├─ db/                   Adaptateur de stockage + transactions sérialisées
├─ auth/                 Sessions signées, OAuth Twitch (prêt, désactivé)
├─ security/             Limitation de débit
├─ api/                  Validation Zod, garde-fous, réponses
└─ services/             Orchestration : cartes, marché, ligue, grand livre
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
