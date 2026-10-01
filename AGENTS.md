<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:winter-ligue -->

# Winter Ligue — règles du projet

## Invariants à ne jamais casser

1. **Aucune valeur qui compte ne vient du client.** Le navigateur envoie des kills, un
   placement, un identifiant de carte ou de booster, une mise de duel. Le score,
   l'effet d'une carte, le contenu d'un booster et la recevabilité d'une mise sont
   toujours décidés côté serveur.
2. **`lib/domain/` ne fait aucune entrée-sortie.** Pas de `fetch`, pas de cookie, pas
   d'accès base. Ce sont des fonctions pures, couvertes par `tests/`.
3. **Toute mutation passe par `getStore().transaction()`.** Jamais de
   lecture-modification-écriture hors transaction : c'est ce qui empêche les courses
   concurrentes sur les flocons.
4. **Aucun mouvement de flocons sans passer par `credit()` / `debit()` / `adjust()`.**
   Modifier `player.snowflakes` directement contourne le grand livre.
5. **Toute route d'API commence par `guard()`** — origine, débit, session, validation Zod.
   Une route qui l'oublie est une faille.
6. **`lib/domain/rng.ts` et tout module manipulant des secrets gardent
   `import 'server-only'`.**
7. **Le rôle d'une session se lit en base, jamais dans le jeton.** `getSession()` confronte
   chaque jeton au compte (actif, rôle, `sessions_depuis`). Les pages de `/admin` appellent
   `exigeRole()` elles-mêmes, pas seulement la mise en page.
8. **Le journal est en ajout seul.** Ni rognage, ni modification, ni suppression : un
   déclencheur en base le refuse, et une transaction qui s'y essaierait échouerait.

## Conventions

- Interface, commentaires et messages d'erreur **en français**.
- Les constantes de saison vivent dans `lib/domain/rules.ts`, nulle part ailleurs.
- Le catalogue de cartes vit dans `lib/domain/catalog.ts`. Les actions sont celles des
  roues de la Summer Ligue ; chaque carte porte un **nom d'hiver** (`name`) et
  l'**intitulé de son action** (`subtitle`). Ajouter une carte, c'est ajouter une entrée
  là ; ajouter un genre d'effet, c'est aussi une branche dans `lib/services/effects.ts`,
  dans `impactMax()`, dans `momentDe()` et dans `resumeEffet()`.
- Les taux de rareté sont dans `RARITY_WEIGHTS_BASE` et dans `PACKS[].weights`.
  Toute table doit sommer **exactement** à 100 000 — un test le vérifie.
- **Une carte pèse ce que sa rareté autorise** : `IMPACT_PAR_RARETE`, de 6 points pour
  une commune à `CARD_IMPACT_CAP` (25 points) pour une légendaire, au pire cas. Quatre
  raretés : commune, rare, ultra rare, légendaire (peu commune et super rare ont été
  fondues dans commune et rare). Aucun malus parmi les communes. Un
  malus retire des points, il n'en donne jamais à l'attaquant, ne tombe que sur la
  prochaine game de sa cible, et ne supprime, ne vole ni ne copie jamais la game
  d'autrui. `tests/equilibre.test.ts` verrouille ces règles.
- La résolution des effets vit dans `lib/services/effects.ts`, et nulle part ailleurs.
  Chaque delta de points passe par `applyPoints`, qui le journalise dans `game.applied`.
  **Une game ne porte jamais deux cartes** : une carte ne tombe que sur une game encore
  sans carte (`gamesSansCarte`).
- Une carte se joue à l'un de trois moments (`momentDe`) : sur la prochaine game, sur
  une game déjà jouée, ou tout de suite. `regleCartesSansAttendre()` est appelé après
  chaque ouverture de booster et après chaque saisie de game.
- La streameuse n'est jamais bénéficiaire d'une carte : les tirages passent par
  `joueursEnLice()`.
- Une ouverture d'un booster de la ligue a **deux tirages** : la carte, puis — selon sa
  cible (`joueursTires`) — le ou les joueurs sur qui elle tombe. Le serveur fait les deux
  dans la même transaction ; l'écran et l'overlay ne font que les dérouler (`tirageDe`,
  `RailJoueurs`). Jamais de joueur choisi côté client.
- Les paliers de subs profitent à **tous les joueurs actifs** (boosters de la ligue,
  évènements) ; ils ne versent plus de flocons. Ne jamais ajouter de
  récompense individuelle : c'est l'invariant anti-pay-to-win, et il est testé.
- **Aucun avantage permanent ne se gagne en ouvrant des cartes.** Il n'y a ni familles,
  ni bonus de collection, ni plafond de réserve, ni taxe de vente : tout cela existait et
  a été retiré parce que cela faisait marquer davantage celui qui dépensait davantage.
  Le score d'une game ne dépend que de la game et des cartes jouées dessus. Seule
  exception, bornée : la carte « Game supplémentaire » ajoute un créneau de game, trois
  au plus par joueur et par saison (`CRENEAUX_BONUS`).
- **Les boosters se lisent par `resolvedBooster()`, jamais par `getBooster()`, dès qu'ils
  servent au jeu.** Le catalogue reste le défaut ; l'administration le recouvre. Débiter
  le prix réglé en tirant avec les taux du catalogue serait pire que de ne rien pouvoir
  régler — l'écran et le serveur raconteraient deux choses différentes.
- **Toute table de raretés passe par `verifieTable()`.** Somme exacte de 100 000 : c'est
  la plage dans laquelle `pickWeighted` tire. Une somme fausse rend les taux affichés
  mensongers sans que personne puisse s'en apercevoir.
- Deux rôles : **joueur** et **admin**. La streameuse et les modérateurs de sa chaîne sont
  admin ; l'espace s'appelle « Modération » à l'écran, `/admin` dans le code. Le garde
  compare les rangs, donc une route `joueur` accepte un admin. **Aucun admin n'agit sur
  son propre compte de joueur** (flocons, subs offerts, games, compteur de Boosters
  Perso) : les modérateurs jouent peut-être, et c'est vérifié route par route. Seule
  exception : ouvrir un booster qui lui revient, puisque le tirage est fait par le serveur.
- **Une session dure trente jours**, prolongée par le proxy à chaque visite
  (`lib/auth/jeton.ts`), six mois au plus. La prolongation ne touche jamais `iat` :
  c'est lui que confronte la révocation.
- **Twitch est la seule porte d'entrée**, et le rôle suit la chaîne à chaque connexion :
  la streameuse et ses modérateurs sont admin, les autres joueurs. Les rôles ne se
  choisissent pas à la main, et un joueur ne s'inscrit que par Twitch. Il n'y a ni mot
  de passe ni session sans joueur : ne pas en rouvrir.
- **Les flocons se donnent par codes cadeaux** (`lib/services/codes.ts`) : la modération
  fixe le montant et le nombre d'utilisations, chaque joueur tape le code une fois, et
  chaque utilisation est un `credit()` avec le code en référence — c'est le grand livre
  qui compte les utilisations. Plus d'attribution de flocons à la main.
- Les taux de rareté ne se règlent plus depuis le site : ce sont ceux du catalogue, et
  les réglages déjà en base restent lus par `resolvedBooster()`.
- **Les subs de Twitch** arrivent par EventSub (`/api/twitch/eventsub`), par les annonces
  du tchat (`channel.chat.notification`) — les seules qui disent si un sub est Prime —,
  et passent par `addSubs()`, comme la saisie de la modération. Un message ne compte
  qu'une fois : sa trace (`config.twitchVus`) s'écrit dans la même transaction que le
  compteur. **Ce qui compte se décide dans `gesteDuMessage()`, nulle part ailleurs** : un
  sub payé compte pour un, quel que soit son niveau — nouveau sub, resub partagé, sub
  offert — ; les subs Prime ne comptent pas. Un T3 vaut en plus un Booster Perso à qui
  le paie, mais Twitch ne donne de Booster Perso à personne : la modération règle à la
  main le compteur de chaque joueur (`ajusteBoostersPerso`), le registre et le journal
  lui disent ce qui est dû.
- Les duels se jouent entre joueurs : il n'y a plus de bot. `CAMP_BOT` ne sert plus
  qu'à afficher les anciens duels.
- Les overlays OBS (`/overlay/…`) lisent par `Store.fluxOverlay`, jamais par `read()` :
  ils interrogent le serveur toutes les deux secondes pendant un live.
- Les couleurs viennent des variables CSS de `app/globals.css`, jamais codées en dur.
- Avant de livrer : `npm run typecheck && npm test && npm run build`.

## Contexte

Le détail des protections et la liste de ce qui reste à faire avant la production sont
dans `docs/SECURITE.md`. Le lire avant de toucher à l'authentification, au stockage ou aux
flocons.
<!-- END:winter-ligue -->
