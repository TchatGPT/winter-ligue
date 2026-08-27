# Sécurité — Winter Ligue

Ce document décrit ce qui protège la ligue, et surtout **ce qui reste à faire** avant une
mise en production. Il est écrit pour être relu : chaque mesure dit ce qu'elle empêche
concrètement.

---

## Le modèle de menace

Trois attaquants à considérer, par ordre de probabilité :

1. **Un joueur qui veut gonfler son score.** Il a un compte légitime, un navigateur, et
   les outils de développement ouverts. C'est la menace principale.
2. **Un joueur qui veut fabriquer des flocons.** Achats concurrents, double clic,
   requêtes rejouées, enchères simultanées.
3. **Un tiers qui veut casser ou défigurer le site.** XSS via un pseudo, CSRF, forçage du
   mot de passe admin, déni de service applicatif.

---

## Ce qui est en place

### 1. Le client ne calcule rien qui compte

Le navigateur envoie **des identifiants et des faits bruts**, jamais des résultats.

| Le client envoie | Le serveur décide |
|---|---|
| kills, placement | le score, avec `scoreGame()` |
| un identifiant de copie de carte | l'effet, relu dans le catalogue serveur |
| un identifiant de booster | le contenu, tiré par `rollBooster()` |
| un montant d'enchère | s'il est recevable, avec `checkBid()` |

Le champ `score` stocké en base n'est **qu'un cache** : `recomputeGame()` le réécrit à
partir des kills, du placement, du multiplicateur et des bonus. Une écriture directe en
base serait effacée au prochain recalcul.

`app/api/games/route.ts` n'accepte **ni multiplicateur ni bonus** dans son corps de
requête : ces valeurs ne peuvent naître que d'une carte jouée, résolue serveur.

### 2. Le hasard est serveur, et non observable

`lib/domain/rng.ts` commence par `import 'server-only'`. Si ce module partait un jour
dans un bundle client, **le build échouerait** — ce n'est pas une convention, c'est une
erreur de compilation.

Le tirage utilise `crypto.randomInt`, uniforme et non prédictible, et non `Math.random()`.
Il n'existe pas d'état « booster acheté mais non ouvert » : achat et ouverture sont la
même transaction, ce qui interdit de rejouer un tirage jugé mauvais.

### 3. Les écritures sont sérialisées

`Store.transaction()` (`lib/db/store.ts`) enchaîne les écritures sur une file d'attente.
Deux requêtes qui tentent d'acheter le même booster avec le même solde sont traitées l'une
après l'autre — jamais de lecture-modification-écriture entrelacée.

Si le corps de la transaction lève, l'instantané pris à l'entrée est restauré : pas
d'état à moitié écrit.

`debit()` lève sur solde insuffisant. Combiné au rollback, c'est ce qui garantit
qu'aucune séquence de requêtes concurrentes ne peut créer des flocons.

### 4. Les enchères sont sous séquestre

Enchérir **débite immédiatement**. L'enchérisseur précédent est remboursé dans la même
transaction. À aucun instant la somme des soldes et des séquestres ne change — c'est
vérifié par les tests (`sellerPayout(p) + marketFee(p) === p`).

Conséquences directes :

- impossible de miser sur dix ventes avec le même solde ;
- impossible de gagner une enchère qu'on ne peut pas payer ;
- une carte mise en vente porte un `listingId` qui la rend **injouable** : on ne peut pas
  la vendre et la consommer en même temps.

L'anti-snipe (une mise dans la dernière minute repousse la clôture d'une minute) rend
inutile toute course à l'horloge — et le compte à rebours affiché est purement cosmétique,
c'est le serveur qui tranche.

### 5. Idempotence

L'achat de booster et le jeu d'une carte exigent une `idempotencyKey` (UUID). Un double
clic, une reprise réseau ou un rejeu de requête **rejouent la réponse précédente** au lieu
de débiter ou de consommer une seconde fois.

### 6. Authentification et session

- Jeton `payload.signature`, signé en **HMAC-SHA256** avec `AUTH_SECRET`.
- Comparaison de signature à **temps constant** (`timingSafeEqual`).
- Cookie **HttpOnly** (invisible au JavaScript, donc insensible au vol par XSS),
  **SameSite=Lax**, **Secure** en production.
- Le jeton ne porte qu'un identifiant et un rôle : solde, collection et droits réels sont
  toujours relus en base.
- Mot de passe admin stocké en **scrypt** salé, jamais en clair. La réponse est identique
  que le hash soit absent ou le mot de passe faux.
- `AUTH_SECRET` manquant ou trop court fait **échouer le démarrage en production**.

### 7. Contrôle d'accès en profondeur

Masquer un onglet n'est pas un contrôle d'accès. Chaque page sensible (`/admin`,
`/ma-collection`) revérifie la session côté serveur, **et** chaque route d'API la
revérifie de son côté. Taper l'URL directement ne donne rien.

Le profil public (`getPublicProfile`) retire la main, le grand livre et les enchères en
cours **avant** l'envoi : ces informations ne transitent jamais, elles ne sont pas
seulement masquées à l'affichage.

### 8. Validation des entrées

Zod sur chaque route. Les bornes reprennent celles de `lib/domain/rules` : une valeur
acceptée par Zod est une valeur que le moteur de score sait traiter.

En plus, les fonctions de score **bornent** leurs entrées (`clampKills`,
`clampMultiplier`, `clampBonus`). Une valeur aberrante qui franchirait la validation ne
peut pas gonfler un score — c'est testé.

Le pseudo n'accepte que lettres, chiffres, espaces, tirets, points et soulignés : aucune
balise HTML ne peut y entrer, avant même l'échappement de React.

### 9. En-têtes et CSP

`middleware.ts` pose sur chaque réponse :

| En-tête | Ce qu'il empêche |
|---|---|
| `Content-Security-Policy` avec nonce | l'exécution de tout script injecté |
| `frame-ancestors 'none'` + `X-Frame-Options: DENY` | le détournement de clic sur les boutons d'enchère |
| `X-Content-Type-Options: nosniff` | l'interprétation d'un fichier comme script |
| `Referrer-Policy: strict-origin-when-cross-origin` | la fuite d'URL vers des tiers |
| `Permissions-Policy` | l'accès caméra/micro/position |
| `Strict-Transport-Security` (prod) | la rétrogradation en HTTP |

`connect-src 'self'` : même en cas d'injection, aucune donnée ne peut être exfiltrée vers
un domaine tiers.

### 10. CSRF et limitation de débit

Cookies en `SameSite=Lax` : une requête d'écriture intersite n'emporte déjà pas la
session. La vérification d'origine (`sameOrigin()`) ferme le cas des navigateurs anciens
et des requêtes forgées côté serveur.

La déconnexion est un **POST**, jamais un lien GET : une image piégée sur un autre site ne
peut pas déconnecter un visiteur.

Barèmes (`lib/security/ratelimit.ts`), en seau à jetons — un pic ne peut donc pas passer
juste après la remise à zéro d'une fenêtre :

| Action | Limite |
|---|---|
| Connexion admin | 5 / 15 min / IP |
| Écritures de jeu | 30 / min / IP |
| Enchères | 60 / min / IP |
| Lectures d'API | 240 / min / IP |

### 11. Traçabilité

Aucun mouvement de flocons sans ligne au **grand livre** (`LedgerEntry`) : le solde d'un
joueur doit toujours être reconstructible à partir de son historique, ce qui rend une
manipulation détectable.

Le **journal d'audit** enregistre chaque action de modération, chaque carte jouée, chaque
vente conclue. Toute attribution manuelle exige un motif : la modération peut donner, mais
jamais discrètement.

---

## Ce qui reste à faire avant la production

### ⚠️ 1. Remplacer le stockage fichier

`lib/db/store.ts` écrit dans `.data/league.json`. La sérialisation des écritures est
**correcte pour un seul processus Node**, mais deux instances (montée en charge Vercel,
plusieurs conteneurs) écriraient chacune leur copie et se perdraient mutuellement des
transactions.

**À faire :** implémenter `Store` sur Postgres/Supabase, avec de vraies transactions
`SERIALIZABLE` ou `SELECT … FOR UPDATE` sur la ligne du joueur et sur celle de la vente.
L'interface est faite pour ça : rien de `lib/domain` ni de `lib/services` n'est à toucher.

Contraintes à poser au niveau du schéma, pour que la base refuse elle-même l'incohérence :

- `CHECK (snowflakes >= 0)` sur les joueurs ;
- unicité sur `(player_id, idempotency_key)` pour les ouvertures de boosters ;
- unicité partielle sur `card_instance_id WHERE status = 'ACTIVE'` pour les ventes.

### ⚠️ 2. Déporter la limitation de débit

Elle est en mémoire, donc par instance. Sur plusieurs instances, la limite effective est
multipliée par leur nombre. **À faire :** Redis/Upstash, en gardant le contrat de
`consume()`.

### 3. Points de vigilance

- **`x-forwarded-for`** n'est fiable que derrière un proxy qui le réécrit (Vercel le fait).
  En auto-hébergement, s'assurer que le reverse proxy l'impose, sinon la limitation par IP
  se contourne avec un en-tête forgé.
- **`ALLOW_DEV_LOGIN`** est doublement verrouillée (`NODE_ENV !== 'production'` **et**
  la variable à `true`). Ne pas la définir en production.
- **`CRON_SECRET`** : sans lui, `/api/market/close` est fermée et la clôture des ventes
  reste paresseuse — correcte, mais déclenchée seulement à la visite. Avec un cron, les
  adjudications tombent à l'heure même sans public.
- **Sauvegardes** : `/api/admin/backup` exporte tout en JSON. À faire avant toute
  manipulation. La restauration est destructive et tracée.
- **`.env.local` n'est jamais commité.** Le séparateur de `ADMIN_PASSWORD_HASH` est un
  deux-points et non un dollar : les fichiers `.env` développent les `$VAR`, un format à
  dollars serait tronqué en silence et la connexion échouerait sans explication.

---

## Vérifier soi-même

```bash
npm test          # règles de score, économie, collection, marché
npm run typecheck # aucune erreur tolérée
npm run build     # échoue si un module server-only fuit côté client
```

Contrôles manuels utiles, serveur lancé :

```bash
# Une écriture admin sans session doit être refusée
curl -X PATCH localhost:3000/api/admin/config \
  -H 'content-type: application/json' -d '{"shopOpen":false}'

# Une écriture depuis une origine étrangère doit être refusée
curl -X POST localhost:3000/api/market/bid \
  -H 'origin: https://evil.example' -H 'content-type: application/json' \
  -d '{"listingId":"…","amount":50}'

# Les en-têtes de sécurité doivent être présents
curl -sI localhost:3000/ | grep -i 'content-security\|x-frame\|nosniff'
```

---

## Signaler une faille

Ouvrir une *issue* **sans détail exploitable**, ou contacter directement la modération de
la ligue. Merci de laisser le temps de corriger avant toute publication.
