# Winter Ligue ❄

Ligue hivernale **Call of Duty: Warzone** de la chaîne Twitch de Lriaa : un classement
de saison, des flocons, des boosters de cartes ouverts à l'antenne, et des duels entre
joueurs.

Suite de [Summer Ligue](https://summer-ligue.com), sur une base neuve : les roues sont
remplacées par des boosters et des cartes, et toute la logique de jeu est décidée côté
serveur.

Next.js 16 · React 19 · Tailwind CSS v4 · Postgres (Supabase) · Vercel.

---

## Le principe

**Le score d'une game**

```
score = kills + points de classement + bonus de la carte jouée dessus
```

1 kill = 1 point. Top 1 : +20, Top 2 : +15, Top 3 : +8. Soixante games par joueur au plus.

**Les flocons ❄** — la monnaie de la saison.

- Ils se gagnent en jouant : 10 ❄ par kill, et 125, 200 ou 250 ❄ pour un Top 3, 2 ou 1.
- Le cadeau du jour en donne 40 (200 le septième jour d'affilée), et les codes cadeaux
  donnés pendant le stream quelques-uns de plus.
- Ils se misent en duel, de 100 à 50 000 ❄.
- Ils font monter la chance des boosters ouverts pour soi, de ×1 à ×4 selon le solde.
  Le solde est plafonné à 50 000 ❄.

**Les subs Twitch** profitent à toute la ligue, jamais à un joueur en particulier.

| Tous les… | Ce qui tombe |
|---|---|
| 50 subs | un Booster Commu |
| 100 subs | Avalanche : les flocons des games doublés pendant une heure |
| 200 subs | un Booster Folie |
| 500 subs | Tempête de neige : un Booster Commu tous les 20 subs, pendant quatre jours |

Un sub payé compte pour un, quel que soit son niveau ; les subs Prime ne comptent pas.
Un sub T3, ou cinq subs offerts, valent en plus un Booster Perso à qui les paie.

**Les boosters** — quatre, une carte chacun, et aucun ne s'achète.

| Booster | Pour qui | Quand |
|---|---|---|
| Perso | un joueur | un sub T3, ou cinq subs offerts |
| Commu | ceux que le sort désigne | tous les 50 subs |
| Folie | ceux que le sort désigne — rien sous rare | tous les 200 subs |
| Finisseur | un joueur | sa dernière game de la saison |

La streameuse les ouvre à l'antenne. Le serveur tire la carte, puis, pour un booster de
la ligue, le ou les joueurs sur qui elle tombe, dans la même transaction. L'écran et
l'overlay ne font que dérouler ce tirage.

**Les cartes** — quatre raretés : commune, rare, ultra rare, légendaire. Une carte se
joue sur une game, le plus souvent la prochaine, puis disparaît. Elle pèse au plus ce que
sa rareté autorise : 6 points pour une commune, 15 pour une rare, 20 pour une ultra rare,
25 pour une légendaire. **Une carte n'a aucune valeur en flocons : elle ne s'achète, ne
s'échange ni ne se revend.**

Le catalogue compte pour l'instant une carte par rareté, le temps de repenser les cartes.

### L'équilibrage

- **Une carte ne fait jamais bouger une game de plus de 25 points**, une bonne game.
  Chaque carte annonce son plafond, et un test le vérifie au pire cas.
- **Un malus retire des points, il n'en donne jamais à personne.** Il ne touche que la
  prochaine game de sa cible, et ne supprime, ne vole ni ne copie la game de personne.
- Un malus tombe sur un joueur tiré au sort ou sur la tête du classement, jamais sur
  quelqu'un que quelqu'un aurait choisi. Aucun ne sort d'un booster ouvert pour soi.
- Aucun avantage permanent ne se gagne en ouvrant des boosters : le score d'une game ne
  dépend que de la game et de la carte jouée dessus.

---

## Démarrer

```bash
npm install
cp .env.example .env.local    # puis compléter
npm run dev
```

Sans `DATABASE_URL`, le site écrit dans un fichier local (`.data/league.json`) ; avec, il
utilise Postgres. La connexion passe par Twitch : il faut une application Twitch
(`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`) et la chaîne de la ligue
(`TWITCH_BROADCASTER_LOGIN`).

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm test` | Tests du domaine et des services |
| `npm run typecheck` | Vérification TypeScript |
| `npm run cartes` | Régénère l'index des illustrations de cartes et de boosters |
| `npm run importe-base` | Verse un fichier `.data/league.json` dans une base Postgres vide |

---

## Architecture

```
app/
├─ page.tsx              Accueil : classement, subs de la saison
├─ boosters/             Ouverture des boosters, cartes de la saison
├─ duels/                Duels de flocons entre joueurs
├─ joueurs/[slug]/       Profil public
├─ regles/               Règles, lues depuis le code
├─ admin/                Modération : joueurs, saison, overlays, journal
├─ overlay/              Overlays OBS : booster, duel, subs
└─ api/                  Toutes les écritures passent par ici

lib/
├─ domain/               Règles pures, sans entrée-sortie — testées
│  ├─ rules.ts           Constantes de saison, flocons, chance, paliers de subs
│  ├─ catalog.ts         Raretés, cartes, boosters
│  ├─ scoring.ts         Score des games et classement
│  └─ rng.ts             Tirages (serveur uniquement)
├─ db/                   Stockage, transactions sérialisées
├─ auth/                 Connexion Twitch, sessions signées
├─ api/                  Garde des routes, validation Zod, réponses
├─ security/             Limitation de débit
└─ services/             Boosters, effets des cartes, grand livre, subs, duels, overlays
```

Une règle structure tout le reste : **`lib/domain` ne fait aucune entrée-sortie.** C'est
ce qui rend les règles testables en isolation, et ce qui garantit qu'une même règle ne
peut pas diverger entre l'affichage et le serveur.

---

## Sécurité

Le site est conçu pour qu'un joueur ne puisse **rien** décider depuis son navigateur. Le
détail est dans [`docs/SECURITE.md`](docs/SECURITE.md). En résumé :

- **Aucune valeur qui compte ne vient du client.** Le navigateur envoie des kills, un
  placement, un identifiant ; le score, l'effet d'une carte et le contenu d'un booster
  sont décidés côté serveur.
- **Les tirages sont faits par le serveur**, avec une source cryptographique, dans un
  module marqué `server-only`.
- **Écritures transactionnelles** : pas de course concurrente sur les flocons, et chaque
  mouvement passe par le grand livre.
- **Chaque route d'API commence par une garde** : origine, débit, session, validation.
- **Le rôle se lit en base**, jamais dans le jeton de session.
- **Journal en ajout seul** : un déclencheur en base refuse toute modification.

---

Fait pour la Winter Ligue.
