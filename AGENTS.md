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
- **Les saisons** (`SAISONS`, `parametresSaison`, décidé le 12/11/2026) : la saison en
  cours est en base (`config.numero`). **Saison 1, la Mini Ligue** (22 novembre → 4
  janvier) : 38 games, le Booster Finisseur à la 35ᵉ (`finisseurA`, `verifieFinisseur`),
  passé la 35ᵉ **une game par session** de 1 h 30 avec Lriaa (`prochaineGamePossible`,
  vérifié à la saisie), **pas de finale** (`finalistes: 0`). **Saison 2** (4 janvier →
  mi-mars) : 65 games — le Booster Finisseur à la 60ᵉ, puis cinq games, une par session
  (12/11/2026). L'accueil écrit la saison en cours et ses dates indicatives (`periode`).
  On change de saison par le panneau « Saison en cours » de Modération → Subs & saison
  — vers la suivante, ou en revenant à une d'avant pour la montrer, c'est la même remise
  à zéro —, réservé à `RESPONSABLES_SAISON` (Jex3_, son
  identifiant Twitch lu en base — le panneau n'existe que pour lui), après une fenêtre de
  confirmation, sans phrase à taper ni animation (12/11/2026). `nouvelleSaison` efface
  games, boosters,
  ouvertures, cartes, duels, évènements et codes, remet le compteur de subs et les
  flocons à zéro (par `adjust`, au grand livre), redonne trois Jokers, et règle la
  limite. Comptes, grand livre et journal restent ; le registre des subs ne compte que
  ce qui suit la remise à zéro (`config.remiseA`).
- Les constantes de saison vivent dans `lib/domain/rules.ts`, nulle part ailleurs.
- Le catalogue de cartes vit dans `lib/domain/catalog.ts`. Les actions sont celles des
  roues de la Summer Ligue ; chaque carte porte un **nom d'hiver** (`name`) et
  l'**intitulé de son action** (`subtitle`). Ajouter une carte, c'est ajouter une entrée
  là ; ajouter un genre d'effet, c'est aussi une branche dans `lib/services/effects.ts`,
  dans `impactMax()`, dans `momentDe()` et dans `resumeEffet()`.
- Le Booster Perso a ses propres cartes. Le Commu (16), le Folie (7) et le
  Finisseur (9) tirent **les actions des roues de la Summer Ligue, telles quelles**
  (décidé le 03/11/2026, sans les deux actions FloooZii), en cartes classées par
  rareté selon leur force : genre `roue` (`ActionRoue`), réglé dans `regleRoue`.
  Retouchées le 12/11/2026 : « Booster Commu tous les 20 subs » et « Meilleure game aux
  5 derniers » retirées ; la **Meilleure game ×1,5** ne se pose jamais sur une game qui a
  déjà un multiplicateur (Perso ou roues, `estMultipliee`, 13/11/2026) : elle prend la
  meilleure qui n'en a pas ; jamais une game figée ; la **Roulette
  russe se court comme un duel à six** (`CourseRoulette`, `ecritCourseRoulette`) — le
  perdant, seul à ne pas passer la ligne, est tiré à l'ouverture et mis **en tête des
  bénéficiaires**, que l'écran, l'overlay et la carte lisent ; la **Cryogénisation**
  (Folie, `fige_garde`) se garde et fige la meilleure game quand la modération la joue
  (`/api/admin/cartes/figer`, `joueFigeGarde`). **La pire game d'un joueur ne se fige
  jamais**, par aucune carte.
  Elles se règlent tout de suite, une fois la carte révélée, **une seule fois pour
  tous les joueurs tirés** (les cartes d'une même ouverture). **Prendre une game**
  — l'échanger, la copier, la figer : Neige Mêlée, Contre-Vent, Calque, les chaînes,
  le Troc, le Pacte, la Cryogénisation et les « fige » — vise toute game comptée
  **qui n'est pas figée** (`gamesPrenables`, décidé le 13/11/2026) : une carte déjà
  jouée dessus (un ×2, un bonus, un Pacte) ne la protège pas ; seules une carte qui
  fige (`estFigee`) et l'immunité du joueur le font.
  Les bonus qu'on pose sur sa propre game gardent « une game, une carte »
  (`gamesSansCarte`). Les games ne changent pas de main : leurs scores s'échangent
  (`applyPoints`), et un clone ou un vol de score arrive en points hors game. Leur
  tirage a ses cibles (`TROIS`, `SIX`, `DIX_PREMIERS`, `CINQ_DERNIERS`,
  `beneficiairesRoue`) et ignore la règle « pas de stock » : rien n'en reste en
  attente. Une game qu'elles ont touchée ne se corrige pas : elle se supprime. Les
  cartes retirées restent dans `tests/stubs/cartes-retirees.ts` : les tests y
  trouvent chaque genre d'effet (`avecCartesRetirees` ; `avecAnciensBoosters` pour
  les tirer d'un booster ; `avecBoostersDAvant` pour les règles qui ne visent que
  les cartes Winter). Une carte doit pouvoir sortir de chaque booster qui tire sa
  rareté — un test le vérifie. Un identifiant de carte retirée ne se réutilise
  jamais : la base y renvoie encore.
- Les taux de rareté sont dans `RARITY_WEIGHTS_BASE` et dans `PACKS[].weights`.
  Toute table doit sommer **exactement** à 100 000 — un test le vérifie.
- **Pas de plafond de points par rareté** (retiré le 12/10/2026, à la demande de
  l'organisation) : une carte pèse ce que dit son effet — la « Game ×2 » double une game,
  quelle qu'elle soit — et plus elle est rare, plus elle est forte (`power`, testé). Une
  game reste bornée par `GAME_LIMITS`. Quatre raretés : commune, rare, ultra rare,
  légendaire (peu commune et super rare ont été fondues dans commune et rare). Aucun
  malus parmi les communes. Un
  malus retire des points, il n'en donne jamais à l'attaquant, ne tombe que sur la
  prochaine game de sa cible, et ne supprime, ne vole ni ne copie jamais la game
  d'autrui. `tests/equilibre.test.ts` verrouille ces règles — pour les cartes Winter :
  celles de la Summer les lèvent (roulette, échange général, pire game à 0 qui frappe
  même une game déjà touchée), à la demande de l'organisation.
- La résolution des effets vit dans `lib/services/effects.ts`, et nulle part ailleurs.
  Chaque delta de points passe par `applyPoints`, qui le journalise dans `game.applied`.
  **Une game ne porte jamais deux cartes** : une carte ne tombe que sur une game encore
  sans carte (`gamesSansCarte`).
- Une carte se joue à l'un de quatre moments (`momentDe`) : sur la prochaine game, sur
  une game déjà jouée, tout de suite, ou **gardée** (`GARDEE`). `regleCartesSansAttendre()`
  est appelé après chaque ouverture de booster et après chaque saisie de game.
- **Pas de stock de cartes** (décidé le 13/10/2026) : un joueur n'a jamais plus d'une
  carte en attente (`carteQuiAttend` : prochaine game, ou game jouée à relever ; le Joker
  n'en est pas une). Tant qu'elle n'a pas joué, aucun booster ne s'ouvre pour lui — il
  reste dans la file (`CARTE_EN_ATTENTE`) — et le sort d'un booster de la ligue ne tombe
  pas sur lui ; si tout le monde en a une, le booster attend.
- **Rien ne se voit avant la carte** : une carte qui se règle tout de suite (flocons) ou
  sur une game jouée (Permafrost) ne se règle qu'une fois son ouverture révélée à l'écran
  — sinon le solde spoilerait l'ouverture. L'écran de qui ouvre la règle au moment où la
  carte apparaît (`/api/admin/packs/revelee`), l'annonce dans le tchat aussi
  (`annonceeA`). Rouvrir pour le même joueur la règle d'abord ; passé deux minutes, la
  page des boosters de la modération rattrape ce qui traîne. Une carte de flocons ne
  compte jamais comme carte en attente.
- **Les cartes gardées qui visent un joueur** se jouent toutes par la même fenêtre
  (`LancerVerglas`, `/api/admin/cartes/verglas`) : le Verglas du Perso et l'Éboulement
  du Finisseur (`malus_choisi`, −10 et −15), et le Troc des Neiges du Finisseur
  (`echange_cible`, `joueEchangeCible`) — la pire game libre du porteur et la meilleure
  de la cible échangent leur score ; une fois par joueur, sauf la revanche contre qui
  l'a visé (la trace `TROC_SUBI` retient qui, dans `paireId`) ; jamais sur un immunisé.
- **Le Verglas** (`kind: 'malus_choisi'`, ultra rare du Booster Perso, décidé par
  l'organisation le 13/10/2026) est la seule exception aux règles des malus : il sort d'un
  booster ouvert pour un joueur, qui le garde et **choisit sa victime**. La modération le
  joue depuis la fiche de la carte au classement (`/api/admin/cartes/verglas`,
  `joueVerglas`) : la victime perd 10 points (20 jusqu'au 02/11/2026) sur son **total**,
  tout de suite, hors de toute game (décidé le 19/10/2026) — son coup (`COUP_DE_VERGLAS`, hors de `CARDS`)
  s'inscrit chez elle, déjà réglé, avec ses points (`CarteEnAttente.points`), que
  `pointsHorsGame()` ajoute au total. L'immunité le pare. Jamais sur soi ; un membre de la
  modération peut jouer le Verglas qu'il garde (décidé le 02/11/2026).
- **Les points bonus** (`kind: 'bonus_total'`, décidé le 02/11/2026) : les cartes « +N pts
  bonus » ajoutent N points au **total**, tout de suite après leur révélation, hors de
  toute game (`CarteEnAttente.points`, comme le coup du Verglas). Le classement les écrit
  sous les points (« dont +N bonus », `totals.horsGame`), où ils sont déjà comptés.
- **Le Pacte du Givre** (`kind: 'echange_choisi'`, légendaire du Booster Perso, décidé le
  02/11/2026) est gardé, et ne se joue qu'à partir de la 15ᵉ game de son porteur. Il
  choisit une de ses games et une game d'un autre joueur, toutes deux pas figées ;
  la modération fait l'échange depuis la fiche de la carte au classement
  (`/api/admin/cartes/echange`, `joueEchangeChoisi`) : chaque game repart avec le score de
  l'autre. Sur la game de l'autre, une trace (`PACTE_SUBI`, hors de `CARDS`) dit d'où
  vient l'échange ; elle ne la fige pas : une game pactée se reprend derrière.
  L'immunité de celui qui y perdrait fait tomber l'échange. Les deux games ne se
  corrigent pas, et une game supprimée ne rend pas le Pacte.
- **Les tops** : une game se saisit Top 1, 2, 3, 6, 8, 10 ou « pas top » (`TOPS`). Seuls
  les Top 1 à 3 rapportent points et flocons ; Top 6, 8 et 10 servent aux cartes
  (« +10 si Top 8 »). Un Top N veut dire « fini dans les N premiers ».
- **Le Grand Dégel** (`kind: 'supprime_pire'`, légendaire du Booster Perso) passe la pire
  game encore sans carte du joueur — la sienne, jamais celle d'un autre : elle ne compte
  plus, son créneau est rendu, ses flocons restent. Comme une game annulée par un Joker,
  elle ne se rétablit pas.
- **Le Joker** (`kind: 'joker'`, Booster Perso) est gardé, jamais consommé de lui-même :
  à la saisie d'une game, la modération peut le servir (`joker: true`, vérifié par
  `jokerDe`). La game est alors passée (`skipped`) — ni points, ni flocons, ni carte
  active, qui attend la suivante — et le Joker consommé (`utiliseJoker`). Chaque joueur
  en reçoit trois à son inscription (`donneJokersDeDepart`, `JOKERS`, décidé le
  02/11/2026), et en garde cinq au plus : un sixième, tiré pendant qu'il en garde cinq,
  est consommé sans effet ; redescendu sous cinq, il peut remonter. Le classement les
  montre en une carte, avec leur nombre en pastille — comme toute carte gardée en
  plusieurs exemplaires (12/11/2026). Une game annulée par un Joker ne
  se rétablit pas.
- **Une game se corrige ou se supprime** depuis la fiche du joueur, par la modération
  (`CorrectionGame`, `PATCH` / `DELETE /api/games`, `lib/services/corrections.ts`) :
  corrigée, son score se réécrit, ses cartes de prochaine game se relisent
  (`recalculeCartesDeLaGame`) et ses flocons suivent — la différence passe au grand
  livre (`adjust`, référencée par la game) ; supprimée, ses flocons sont repris (jamais
  sous zéro) et sa carte est rendue (`rendCartesDeLaGame`), perdue si le joueur en a déjà
  une en attente. Une game qui porte un Clone kill ou un échange ne se corrige pas : elle
  se supprime, et se ressaisit.
- La streameuse n'est jamais bénéficiaire d'une carte : les tirages passent par
  `joueursEnLice()`.
- Une ouverture d'un booster de la ligue a **deux tirages** : la carte, puis — selon sa
  cible (`joueursTires`) — le ou les joueurs sur qui elle tombe. Le serveur fait les deux
  dans la même transaction ; l'écran et l'overlay ne font que les dérouler (`tirageDe`,
  `RailJoueurs`). Jamais de joueur choisi côté client.
  Deux ou trois joueurs tirés tournent **ensemble**, une bande chacun, empilées sous le
  même repère (12/11/2026). Puis, pour une carte des roues qui prend une game, un
  **troisième tirage** : le serveur choisit à l'ouverture la game, ou les games, que la
  carte touchera (`choisitGamesRoue`, `ouvertures.games`) — au sort sur un rail de
  games (`TirageGames`), ou désignées par la carte (sa pire, sa meilleure), posées sans
  rail ; un Finisseur ouvert pour un joueur ne déroule que ses games (`sansJoueurs`).
  **Flocon de Plus** (Commu) verse 100 flocons à chaque joueur en lice (12/11/2026 : elle
  ajoutait une game sup), par `credit`, l'ouverture en référence.
  `regleRoue` frappe ces games-là tant qu'elles le peuvent encore (`retenue`). Pas de
  tirage des games pour une carte qui tombe sur toute la ligue.
  À la révélation, **le compte rendu** (12/11/2026) : `regleRoue` écrit pour chaque
  joueur ce que la carte a fait à son total (`CarteEnAttente.bilan`), ses textes nomment
  la game touchée (« la game 7 »), et `/api/admin/packs/revelee` rend la vue réglée —
  qui gagne, qui perd, combien (`EffetVue`, `DestinCarte`). Une pire game rendue
  (Déneigement) compte comme un gain, pas une perte.
  Un échange au hasard (Neige Mêlée) reste **du hasard pur** (décidé le 12/11/2026) :
  deux joueurs, puis une game au sort chez chacun, toutes à chances égales ; qui y gagne
  suit les deux scores tirés. Dès les games connues, l'écran dit le verdict — qui gagne,
  qui perd, de combien (`Verdict`, `TirageGames`) — avant la carte.
- Les paliers de subs profitent à **tous les joueurs actifs** (boosters de la ligue,
  évènements). Seule l'**Avalanche** verse des flocons : la même somme
  (`AVALANCHE_FLOCONS`) à chaque joueur qui a au moins une game, tout de suite
  (`verseFloconsATous`, décidé le 02/11/2026). Ne jamais ajouter de
  récompense individuelle : c'est l'invariant anti-pay-to-win, et il est testé.
- **Le cadeau du jour** verse 40 ❄ par jour et, le septième jour d'affilée, met un
  Booster Perso en file au lieu de flocons (`boosterDuJour`, décidé le 02/11/2026) ;
  ce jour-là reste ouvert à solde plein. Il s'ouvre dès l'inscription, sans game.
- **Un Booster Perso s'achète 5 000 ❄** (`ACHAT_PERSO`, décidé le 02/11/2026), depuis le
  solde du menu (`AchatBooster`, `/api/achat-booster`, `acheteBoosterPerso`) : le prix
  passe au grand livre (`debit`, `ACHAT_BOOSTER`, la clé d'achat en référence — une même
  clé n'achète qu'une fois) et le booster est mis en file. Les flocons dépensés font
  baisser la chance : la fenêtre montre la chance avant et après, avant l'achat.
- **La page de test** (`/admin/test`, décidée le 02/11/2026) : un testeur de la ligue
  (`TESTEURS_CARTES`, son identifiant Twitch lu en base — ni un rôle, ni un pseudo qui se
  renomme) s'y donne la carte de son choix, d'un booster de son choix
  (`donneCarteDeTest`, `/api/admin/test/cartes`), et peut retirer la carte **de test**
  qui attend sa game (`retireCarteDeTest`) — jamais une carte d'un vrai booster.
  Exception à « aucun admin n'agit sur son propre compte », réservée à cette liste et à
  son propre compte. La carte est posée comme à une ouverture, déjà révélée (rien dans
  le tchat), marquée (`PREFIXE_OUVERTURE_TEST`) pour que l'overlay du live
  (`fluxOverlay`) ne la joue pas, et compte pour de vrai ; pas de stock, même là. Le
  journal garde chaque carte (`CARTE_TEST`). La même page ajoute ou retire les
  **données fictives** (12/11/2026, `lib/services/donneesFictives.ts`,
  `/api/admin/test/fictives`, ou `scripts/fictifs.ts`) : une ligue qui a déjà vécu, faite
  par les services du site — 24 joueurs `fictif-…`, leurs games, cartes consommées et
  Jokers servis, des subs et leurs paliers, des boosters ouverts et à ouvrir, des duels,
  des cartes actives et gardées. Les vrais joueurs sont mis de côté pendant la création
  (rien ne tombe sur eux) ; tout ce qui est fictif est marqué, et le retrait l'efface,
  subs du compteur compris. Le bouton remplit aussi la fiche du testeur qui l'appuie :
  des games marquées (`NOTE_FICTIVE`), dont le retrait reprend les flocons et rend les
  cartes. « Refaire à neuf » retire puis recrée. À retirer avant le
  lancement.
- **Une carte n'a aucune valeur en flocons** : elle ne s'achète, ne s'échange ni ne se
  revend — ni cote, ni marché, ni collection, ni exemplaires en réserve. Elle se joue sur
  une game, puis disparaît.
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
  son propre compte de joueur** (flocons, subs offerts) : les modérateurs jouent
  peut-être, et c'est vérifié route par route. Exceptions, décidées par l'organisation :
  ouvrir un booster qui lui revient, puisque le tirage est fait par le serveur ; saisir ou
  modifier ses propres games — le score se calcule sur le serveur, la capture fait foi ;
  régler son propre compteur de Boosters Perso ; et jouer le Verglas ou le Pacte du Givre
  qu'il garde (02/11/2026), sortis d'un tirage du serveur. Le journal garde qui a fait
  quoi.
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
  compteur. **Ce qui compte se décide dans `gesteDuMessage()`, nulle part ailleurs** : seuls
  comptent les subs offerts par paquets d'au moins cinq (chacun compte pour un) et les
  subs T3 (`compteSub`, décidé le 12/10/2026) ; un sub T1 ou T2 pris pour soi, un cadeau
  de moins de cinq subs et les Prime ne comptent pas. Le registre se relit avec la même
  règle. Un T3, et cinq subs offerts (cumulés sur la
  saison dans `subsOfferts`), valent en plus un Booster Perso à qui les paie : il est mis
  en file d'office s'il a un compte (`crediteBoostersPerso`), sinon à sa première
  connexion, d'après le registre (`rattacheCompteTwitch`). Payés par un non-inscrit, ils
  forment la réserve des **boosters cadeau** (`persoEnAttente`) que la modération redonne
  à des joueurs (`donneBoosterCadeau`, qui retient `donDe`) : le viewer dit à qui les
  donner, et la modération répartit les siens — de quel viewer, à quel joueur, combien
  (03/11/2026) ; s'il s'inscrit, il ne reçoit que ce qui n'a pas été redonné. Pour l'offrir à un autre,
  la modération fait − chez l'un et + chez l'autre, sous le pseudo dans le classement
  (`ajusteBoostersPerso`) ; plus de − / + dans Modération → Joueurs.
- Les duels se jouent entre joueurs : il n'y a plus de bot. `CAMP_BOT` ne sert plus
  qu'à afficher les anciens duels.
- **La fenêtre d'un duel ne se ferme qu'à la main** (décidé le 20/10/2026) : ni pendant
  la course — un duel ne se saute pas —, ni d'elle-même une fois le verdict tombé. Le
  solde du menu, rendu par le serveur, suit par `router.refresh()` dès la ligne
  d'arrivée (`marqueFini`), jamais avant : il trahirait l'issue.
- Les overlays OBS (`/overlay/…`) lisent par `Store.fluxOverlay`, jamais par `read()` :
  ils interrogent le serveur toutes les deux secondes pendant un live.
- **Les illustrations passent par `npm run cartes`** (`scripts/index-art.mjs`, lancé aussi
  avant chaque build) : l'index donne chaque image avec l'empreinte de son fichier
  (`?v=…`), ce qui permet de la garder un an en cache (`next.config.ts`), et fait les
  vignettes des cartes (200 et 480 px, `public/cartes/vignettes/`, à commiter avec
  l'illustration). Une carte affichée en petit passe sa largeur à `CardFrame`
  (`largeur`, au format `sizes`) : sans elle, c'est l'illustration entière de 1 000 px.
  `tests/illustrations.test.ts` vérifie l'index et les vignettes.
- **Un rail ne se relance jamais sur un rendu** : ses réglages sont les dépendances de
  sa course (`useSpinAnimation`), et un tableau neuf à chaque rendu la relançait depuis
  le début au premier `router.refresh()`. Valeurs stables seulement (`SANS_RELANCE`,
  `useMemo`, `useState`).
- **L'accueil déconnecté** (`components/Accueil.tsx`, 13/11/2026) tient sur un ordinateur en un
  seul écran, sans défiler (de 1024×620 à 2830×1400 : `scrollHeight <= innerHeight`) ; sur
  téléphone et tablette debout, il s'empile. Le calendrier (`CalendrierSaisons`) montre le compte
  à rebours et les deux saisons (Mini Ligue, puis Saison 2 qui repart de zéro) ; chaque booster
  est pris dans un bloc de glace (`BlocDeGlace`) qu'un clic fait éclater (`EclatBooster`) pour
  montrer **trois** de ses cartes, pas toutes ; chaque étape ouvre son détail (`EtapeAccueil`).
  Ses réglages selon la taille passent par `@media`, jamais par `@container` : le compte à rebours
  réévaluait les règles de conteneur chaque seconde et relançait les animations d'arrivée.
- Les couleurs viennent des variables CSS de `app/globals.css`, jamais codées en dur.
- Avant de livrer : `npm run typecheck && npm test && npm run build`.

## Contexte

Le détail des protections et la liste de ce qui reste à faire avant la production sont
dans `docs/SECURITE.md`. Le lire avant de toucher à l'authentification, au stockage ou aux
flocons.
<!-- END:winter-ligue -->
