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
3. **Un tiers qui veut casser ou défigurer le site.** XSS via un pseudo, CSRF, vol de
   session, déni de service applicatif.

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

La saisie porte un troisième fait brut, facultatif : `meilleurKills`, les kills du
meilleur tueur de la partie lus sur la même capture. Il ne sert qu'à la carte « Clone
kill du meilleur ». C'est une donnée de jeu comme les kills — saisie par la modération,
bornée par le schéma de 0 à 60 — et la carte plafonne ce qu'elle en tire au budget de sa
rareté.

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
- Le jeton ne porte qu'un identifiant et un rôle, et **le rôle du jeton ne sert à rien** :
  à chaque requête, `getSession()` relit en base le rôle, l'état actif et la date de
  révocation du joueur (`Store.etatSession`, une ligne lue par sa clé, mise en cache le
  temps d'une requête). Un admin rétrogradé perd ses droits à la requête suivante,
  un compte désactivé est dehors. Décision pure : `lib/domain/revocation.ts`, testée.
- **Se déconnecter révoque** : la déconnexion pose `joueurs.sessions_depuis`, et tout
  jeton émis avant est refusé, sur tous les appareils — un cookie copié ne survit pas.
- **Il n'y a pas de mot de passe.** Twitch est la seule porte : l'entrée par mot de passe
  et sa session « de secours », sans joueur, ont été retirées une fois Twitch branché. Un
  ancien jeton de secours ne désigne aucun compte : `getSession()` le refuse.
- `AUTH_SECRET` manquant ou trop court fait **échouer le démarrage en production**. Les
  autres secrets du site (state OAuth, clés d'overlay) en sont dérivés par HMAC, avec un
  usage distinct : une signature valable pour l'un ne l'est jamais pour l'autre.

### 7. Contrôle d'accès en profondeur

Masquer un onglet n'est pas un contrôle d'accès. Chaque page de `/admin` appelle
`exigeRole()` **elle-même** — la mise en page le fait aussi, mais Next ne la rejoue pas
lors d'une navigation entre onglets, et une requête fabriquée peut demander la seule
page. Chaque route d'API revérifie la session de son côté. Taper l'URL directement ne
donne rien.

Rien de la ligue ne se lit sans compte : le classement (`GET /api/players`), les duels
(`GET /api/affrontements`) et le compteur de subs (`GET /api/admin/subs`) exigent une
session, comme les pages.

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

`proxy.ts` (l'ancien `middleware.ts`, renommé par Next 16) pose sur chaque réponse :

| En-tête | Ce qu'il empêche |
|---|---|
| `Content-Security-Policy` avec nonce | l'exécution de tout script injecté |
| `frame-ancestors 'none'` + `X-Frame-Options: DENY` | le détournement de clic sur les boutons d'enchère |
| `X-Content-Type-Options: nosniff` | l'interprétation d'un fichier comme script |
| `Referrer-Policy: strict-origin-when-cross-origin` | la fuite d'URL vers des tiers |
| `Permissions-Policy` | l'accès caméra/micro/position, le suivi publicitaire (`browsing-topics`) |
| `Strict-Transport-Security` (prod) | la rétrogradation en HTTP |

`X-Powered-By` n'est plus envoyé (`poweredByHeader: false`). Les réponses d'API portent
`Cache-Control: private, no-store` : un solde ou un rôle n'est jamais servi depuis un
cache à la mauvaise personne.

`connect-src 'self'` : même en cas d'injection, aucune donnée ne peut être exfiltrée vers
un domaine tiers.

### 10. CSRF et limitation de débit

Cookies en `SameSite=Lax` : une requête d'écriture intersite n'emporte déjà pas la
session. La vérification d'origine (`sameOrigin()`) ferme le cas des navigateurs anciens
et des requêtes forgées côté serveur. Toute route qui lit un corps exige
`Content-Type: application/json` — qu'un formulaire d'un autre site ne peut pas envoyer
sans demander la permission au navigateur — et le borne à 64 Kio (sauf la lecture des
captures, qui déclare sa propre taille).

Chaque seau de limitation se purge selon **sa** fenêtre : la purge utilisait celle de la
requête qui la déclenchait, et les tentatives de connexion (fenêtre d'un quart d'heure)
étaient oubliées au bout de quatre minutes.

La déconnexion est un **POST**, jamais un lien GET : une image piégée sur un autre site ne
peut pas déconnecter un visiteur.

Barèmes (`lib/security/ratelimit.ts`), en seau à jetons — un pic ne peut donc pas passer
juste après la remise à zéro d'une fenêtre :

| Action | Limite |
|---|---|
| Export de sauvegarde, connexion de développement | 5 / 15 min / IP |
| Écritures de jeu | 30 / min / IP |
| Enchères | 60 / min / IP |
| Lectures d'API | 240 / min / IP |
| Messages de Twitch (EventSub) | 1 200 / min / IP |
| Codes cadeaux | 10 / 10 min / IP |

### 11. Équilibre de l'économie

Deux garde-fous ne relèvent pas de la sécurité technique mais de l'intégrité du jeu, et
méritent la même vigilance :

- **Aucun versement de subs ne peut cibler un joueur.** `addSubs()` verse à tous les
  joueurs actifs, et la route n'expose aucun paramètre de destinataire. Un test
  (`ne verse jamais de flocons à un joueur nommé`) échoue si un palier individuel
  apparaît un jour dans la table. Sans cela, la communauté la plus généreuse achèterait
  le classement de son joueur.
- **Aucun avantage permanent ne se gagne en ouvrant des boosters.** Les bonus de
  collection — places de réserve, multiplicateur de kills, flocons par game, remises —
  ont été retirés, ainsi que la réserve et la taxe de vente. Ils faisaient marquer et
  gagner davantage celui qui dépensait davantage, et le multiplicateur de kills réécrivait
  rétroactivement toute la saison. Le score d'une game ne dépend plus que de la game.
  Seule exception, bornée : la carte « Game supplémentaire » ajoute un créneau de game,
  trois au plus par joueur et par saison.
- **Une carte pèse ce que sa rareté autorise.** Les actions des cartes reprennent celles
  des roues de la Summer Ligue, pas leur force : `IMPACT_PAR_RARETE` fixe ce qu'une
  carte peut faire bouger sur une game, de 4 points pour une commune à 25 pour une
  légendaire, et `tests/equilibre.test.ts` le vérifie carte par carte, au pire cas. Une
  game ne porte jamais deux cartes. Un malus ne tombe que sur la prochaine game d'un
  joueur tiré au sort ou de la tête du classement ; il ne transfère rien, et la game
  d'autrui n'est jamais supprimée, volée ni copiée. La streameuse n'est jamais tirée.

### 12. Rôles et réglages

Deux rôles — joueur et admin — et le garde compare des rangs plutôt que des listes : une
route qui demande `joueur` accepte un admin. La streameuse et les modérateurs de sa chaîne
sont admin ; l'espace s'appelle « Modération » à l'écran. Il a existé un rôle modérateur à
part, aux droits réduits : il a été fondu dans admin, et ce qui en restait en base est
passé admin au démarrage (`SCHEMA_SQL`).

Parce que les modérateurs jouent peut-être dans la ligue, **aucun admin n'agit sur son
propre compte de joueur** : il ne se crédite pas de flocons, ne s'inscrit pas de subs
offerts, ne saisit ni ne modifie ses games, n'ouvre pas un booster qui lui revient. Un
autre membre de la modération le fait, et le journal le trace.

Les taux de rareté ne se règlent plus depuis le site : ce sont ceux du catalogue. Un
compte administrateur compromis ne peut pas rendre les légendaires certaines.

Les rôles ne se changent pas à la main : ils suivent la chaîne Twitch à chaque
connexion. Pour retirer la modération à quelqu'un, on lui retire son rôle de modérateur
sur Twitch ; il la perd à sa connexion suivante, douze heures au plus tard.

Les réglages de taux enregistrés avant ce retrait restent lus par `resolvedBooster()` et
vérifiés par `verifieTable()` : somme exacte de 100 000, faute de quoi `pickWeighted`
tirerait dans une plage qui ne correspond plus aux taux affichés.

### 13. Traçabilité

Aucun mouvement de flocons sans ligne au **grand livre** (`LedgerEntry`) : le solde d'un
joueur doit toujours être reconstructible à partir de son historique, ce qui rend une
manipulation détectable.

Le **journal d'audit** enregistre chaque action de modération, chaque carte jouée, chaque
rôle donné par Twitch, chaque code cadeau créé, désactivé et utilisé. Les flocons ne se
donnent plus à la main : ils passent par des codes, et le journal dit qui a pris quoi.

Le journal est **en ajout seul**. Il n'est plus rogné (il l'était aux cinq mille dernières
lignes : enchaîner les actions effaçait les traces des précédentes), il n'est plus chargé
avec le reste de la base (il se lit à part, `Store.journal`), et un **déclencheur en base**
refuse toute modification, suppression ou vidage de la table `journal`. La restauration
de sauvegarde par le site, qui remplaçait toute la base d'une requête, est supprimée ;
l'export (`GET /api/admin/backup`, admin, cinq par quart d'heure) inclut le journal.

Les textes libres (note de game, motif) perdent leurs caractères de contrôle et ceux qui
retournent le sens de lecture : une ligne du journal ne peut pas se déguiser.

---

### 14. Accès, pseudo Activision et lecture des captures

**Déconnecté, on ne voit que l'accueil.** `lib/auth/acces.ts` expose `exigeSession()`,
appelé en tête de chaque page de membre (`/`, `/boosters`, `/duels`, `/regles`,
`/joueurs/[slug]`) : sans session, redirection vers `/` ; avec une session de
joueur sans pseudo Activision, redirection vers `/bienvenue`. L'espace
`/admin` garde son propre garde. Ce n'est qu'un aiguillage d'affichage : les
routes d'API restent seules responsables de leurs contrôles.

**Une session désigne toujours un joueur.** La session de secours, sans compte
derrière, a disparu avec l'entrée par mot de passe : `getSession()` ne rend qu'une
session dont le joueur existe, est actif, et ne s'est pas déconnecté depuis.
L'aiguillage est une fonction pure, `lib/domain/aiguillage.ts`, verrouillée par
`tests/aiguillage.test.ts`.

**Le pseudo Activision** (`Player.activisionId`) est la seule donnée qu'un joueur
écrit sur son propre compte : `PATCH /api/me`, `guard({ role: 'joueur' })`, schéma
`monActivisionSchema` (lettres, chiffres, `_ - .`, espace, suffixe `#chiffres`
facultatif ; jamais de `<`). La modération corrige celui d'un joueur par
`PATCH /api/players` (`admin`). Les deux passent par `transaction()` et
laissent une trace au journal — seulement sur un vrai changement. Un nom déjà pris
par un autre joueur est refusé (comparé sans suffixe, casse ni accents,
`lib/domain/activision.ts`) : sinon l'un se ferait attribuer les games de
l'autre. Le retour Twitch envoie vers `/bienvenue` tant qu'il manque.

**Les overlays OBS** (`/overlay/booster`, `/overlay/duel`, `/overlay/subs`) n'ont
pas de session : ils s'ouvrent par un lien qui porte une clé signée (dérivée
d'`AUTH_SECRET`) et une **génération** ; « Régénérer les liens » (admin) avance la
génération et révoque tous les liens donnés. Une clé mal signée est refusée sans
toucher à la base. La clé n'ouvre que ce que le stream montre déjà — compteur de
subs, boosters ouverts, duels lancés — par une lecture ciblée
(`Store.fluxOverlay`, quelques lignes par index, jamais la base entière), bornée
à 240 lectures par minute et par adresse. Les pages d'overlay sont rendues sans
décor (le proxy pose un en-tête qu'il efface de toute requête entrante), en
`Referrer-Policy: no-referrer` et `noindex`. Un joueur a au plus trois duels en
attente : chacun est annoncé sur le stream.

**Les rôles viennent de Twitch.** Il n'y a plus de connexion « modération » à
l'écran. À chaque connexion, le retour OAuth lit, avec le jeton de la personne
(portée `user:read:moderated_channels`), si elle modère la chaîne
`TWITCH_BROADCASTER_LOGIN` (par défaut `lriaa`) : la streameuse et ses
modérateurs sont `admin`, les autres `joueur`. Un modérateur retiré sur Twitch
perd son accès à sa connexion suivante — une session dure douze heures au plus.
En cas d'échec de l'appel, le rôle accordé est `joueur` : rien ne s'accorde par
défaut. Les rôles ne se choisissent plus à la main, et plus personne ne
s'inscrit autrement que par Twitch.

**Les codes cadeaux** distribuent les flocons. La modération crée un code
(`/api/admin/codes`, admin) : un montant, un nombre d'utilisations, un texte
choisi ou tiré au sort (huit signes sans caractères ambigus, près de mille
milliards de possibilités). Un joueur le tape derrière l'icône cadeau
(`POST /api/codes`) : le navigateur n'envoie que le code, tout le reste se décide
dans `utiliseCode`, dans une transaction — un joueur ne s'en sert qu'une fois, le
code ne sert pas plus que prévu, celui qui l'a créé ne s'en sert pas, la
streameuse non plus. Chaque utilisation est un `credit()` au grand livre avec le
code en référence : les utilisations se comptent là, sans double écriture. Dix
essais par dix minutes et par adresse.

**Le circuit OAuth.** `GET /api/auth/twitch` signe un `state` (clé dérivée de
`AUTH_SECRET`, distincte de celle des sessions) qui expire au bout de dix minutes
et porte un nonce ; le même nonce est posé dans un cookie `HttpOnly`, limité aux
routes `/api/auth/twitch`. `GET /api/auth/twitch/callback` exige un `state` signé,
non expiré, **et** le nonce de ce navigateur, puis efface le cookie : un `state`
intercepté ou fabriqué ailleurs ne connecte personne (pas de « login CSRF »).
Seule la portée `user:read:moderated_channels` est demandée, jamais l'e-mail. Un
compte désactivé par la modération reste désactivé : se reconnecter ne le rouvre
plus, et la session est refusée. Chaque refus ramène à `/connexion?erreur=…`, dont
le texte vient d'une table fixe. L'adresse de retour à déclarer chez Twitch est
`https://www.winter-ligue.com/api/auth/twitch/callback`.

**Les subs viennent de Twitch** (EventSub, en webhook : `POST /api/twitch/eventsub`).
La streameuse branche une fois, depuis Admin → Saison : la connexion Twitch repart
avec `subs=1`, signé dans le `state`, et demande en plus `channel:read:subscriptions`.
Au retour, le site vérifie que c'est bien la chaîne de la ligue et que la portée est
accordée, puis crée, avec le jeton de l'application, trois abonnements : nouveaux subs,
subs offerts, réabonnements annoncés. Tout autre compte est connecté, sans rien
brancher. À la réception : signature HMAC-SHA256 vérifiée **avant** de lire le corps
(secret tiré d'`AUTH_SECRET`, jamais écrit), message de plus de dix minutes ignoré,
chaîne de la ligue seulement, corps de 64 Kio au plus. Chaque message ne compte
qu'une fois : sa trace (`saison.twitch_vus`, une heure) s'écrit dans la **même
transaction** que le compteur, et un échec répond 500 pour que Twitch réessaie. Le
compteur avance par `addSubs()`, comme la saisie de la modération. Un sub offert
compte par le message du cadeau, jamais par ceux de ses destinataires. Deux gestes
valent en plus un Booster Perso à un joueur qui a un compte : un cadeau groupé d'au
moins cinq subs, fait à visage découvert (ses subs offerts montent d'autant), et un
sub de niveau 3 pris pour soi. Rien pour un sub simple, un réabonnement, un petit
cadeau ou un cadeau anonyme, ni pour la streameuse. Un admin peut remettre le
compteur à zéro avant le départ de la saison : rien de ce qui a été versé n'est
repris, et le journal le note.

**Tant que Twitch n'est pas branché, la connexion Twitch est fermée.** Une
connexion *simulée* a existé : un clic sur le bouton faisait entrer n'importe quel
visiteur sur le compte administrateur. Elle est supprimée ; `/api/auth/twitch` et
l'ancienne `/api/auth/twitch/demo` renvoient simplement à `/connexion`.

**Il n'y a plus d'entrée par mot de passe.** Elle a servi de porte à
l'administration en attendant Twitch (`ADMIN_PASSWORD` ou `ADMIN_PASSWORD_HASH`,
avec une session de secours sans joueur quand aucun admin n'existait) ; elle a
été retirée dès Twitch branché — route, formulaire, session de secours et script
d'empreinte. Ces deux variables ne servent plus à rien : elles se suppriment de
Vercel.

Sans `DATABASE_URL`, sur Vercel, les données vont dans `/tmp` et sont éphémères.

**Base Supabase.** Une table par type de donnée (`lib/db/tables.ts`) : `saison`,
`joueurs`, `games`, `boosters_a_ouvrir`, `ouvertures`, `cartes_en_attente`,
`flocons`, `subs`, `journal`, `reglages_boosters`, `duels`, `evenements`, plus le
catalogue `cartes` et `boosters` recopié du code. Chaque transaction verrouille
la ligne `saison` (`FOR UPDATE`), ce qui sérialise les écritures entre serveurs,
puis n'écrit que les lignes modifiées. RLS activée partout sans politique, droits
d'`anon` et `authenticated` retirés : seule la connexion serveur lit la base. La
connexion est **chiffrée** (`ssl: 'require'`) : l'adresse n'imposant pas `sslmode`,
requêtes et réponses passaient en clair entre Vercel et Supabase. Le certificat du
pooler est signé par l'autorité de Supabase, que Node ne connaît pas : l'épingler
(`verify-full` avec son certificat racine) protégerait aussi d'une interception
active — c'est l'étape suivante.
L'ancienne ligne unique `league_state` est gardée comme sauvegarde ; vider les
tables la fait reverser au démarrage suivant.

**La lecture des captures** (`POST /api/admin/games/analyse`, `admin`) envoie
l'image à l'API Anthropic **depuis le serveur** : la clé `ANTHROPIC_API_KEY` ne
quitte jamais le serveur, et la CSP (`connect-src 'self'`) interdirait de toute
façon l'appel depuis le navigateur. Garde-fous : image en base64 validée par
schéma (8 Mo maximum, alphabet base64 strict, types MIME image seulement), débit
propre de 20 appels par minute et par IP, sortie du modèle validée par Zod
(`lib/services/reconnaissance.ts`). La route **n'écrit rien** : elle renvoie une
proposition, et chaque game est ensuite enregistrée par `POST /api/games`, qui
recalcule le score. Sans clé, la route répond `INTROUVABLE` et l'écran ne propose
que la saisie à la main.

## Ce qui reste à faire

### 1. Déporter la limitation de débit

Elle est en mémoire, donc par instance Vercel : sur plusieurs instances, la limite
effective est multipliée par leur nombre. Une règle de limitation du **pare-feu
Vercel** sur `/api/auth/twitch` et `/api/overlay`, ou un compteur partagé (Upstash),
fermerait le dernier écart.

### 2. Épingler le certificat de la base

La connexion est chiffrée, sans vérifier le certificat du pooler. L'épingler
(`ssl: { ca }`, avec le certificat racine de Supabase téléchargé depuis son tableau de
bord) protégerait aussi d'une interception active entre Vercel et Supabase.

### 3. Un rôle de base sans droits de structure

Le site se connecte avec le rôle propriétaire : il crée ses tables au démarrage, et
pourrait donc aussi retirer le déclencheur du journal. Un rôle limité aux lectures et
écritures, les migrations passant par un autre, fermerait cette porte.

### 4. Contraintes de schéma

`CHECK (flocons >= 0)` sur `joueurs` : la base refuserait elle-même un solde négatif, que
le code interdit déjà (`debit()` lève, `adjust()` borne).

### 5. La photo de fond

Elle est servie par `cdn.midjourney.com`, déclaré dans la CSP : chaque visiteur y envoie
son adresse. L'héberger dans `public/` retirerait ce domaine de la CSP.

### Points de vigilance

- **`x-forwarded-for`** n'est fiable que derrière un proxy qui le réécrit (Vercel le fait).
- **`ALLOW_DEV_LOGIN`** est triplement verrouillée (hors production, variable à `true`,
  base locale). Ne jamais la définir sur Vercel.
- **Sauvegardes** : `/api/admin/backup` exporte tout, journal compris. Le fichier contient
  des données personnelles : hors du dépôt (`.gitignore` l'écarte), et supprimé une fois
  inutile. Il n'y a plus de restauration par le site.
- **Variables Vercel** : `AUTH_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `TWITCH_CLIENT_SECRET` en **Production seulement**, marquées sensibles. Changer `AUTH_SECRET` déconnecte tout le monde, change les liens d'overlay, et
  coupe les subs Twitch jusqu'à ce que la streameuse les rebranche.
- **`.env.local` n'est jamais commité.**

---

## Vérifier soi-même

```bash
npm test          # règles de score, économie, sessions, state OAuth, schémas
npm run typecheck # aucune erreur tolérée
npm run build     # échoue si un module server-only fuit côté client
```

Contrôles en ligne :

```bash
# Le départ de la connexion part chez Twitch, avec l'adresse de retour déclarée
curl -sI 'https://www.winter-ligue.com/api/auth/twitch' | grep -i location

# Une écriture d'administration sans session est refusée
curl -s -X POST https://www.winter-ligue.com/api/admin/codes -H 'content-type: application/json' -d '{}'

# Une écriture depuis une origine étrangère est refusée
curl -s -X POST https://www.winter-ligue.com/api/auth/logout -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{}'

# Un overlay sans clé valide ne lit rien
curl -s 'https://www.winter-ligue.com/api/overlay?cle=1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

# Les en-têtes de sécurité sont présents
curl -sI https://www.winter-ligue.com/ | grep -i 'content-security\|x-frame\|nosniff'
```

---

## Signaler une faille

Ouvrir une *issue* **sans détail exploitable**, ou contacter directement la modération de
la ligue. Merci de laisser le temps de corriger avant toute publication.

