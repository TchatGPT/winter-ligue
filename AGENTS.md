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
   **La base est gardée en mémoire par chaque serveur** (18/11/2026, `baseAJour`) et ne se
   recharge que si sa révision a bougé : un déclencheur sur chaque table que lit
   `chargeBase` avance `revision_base` à toute écriture, d'où qu'elle vienne
   (`SQL_REVISION`). Une table qu'on ajoute à `chargeBase` reçoit le sien d'office ; une
   écriture qui ne passerait pas par une table chargée ne serait pas vue. Chaque rendu
   reçoit sa copie (`structuredClone`) ; les overlays lisent toujours en direct
   (`fluxOverlay`).
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
  janvier) : 33 games, le Booster Finisseur à la 30ᵉ (`finisseurA`, `verifieFinisseur` ;
  38 et 35 jusqu'au 15/11/2026), passé la 30ᵉ **une game par session** de 1 h 30 avec Lriaa (`prochaineGamePossible`,
  vérifié à la saisie), **pas de finale** (`finalistes: 0`). **Saison 2** (4 janvier →
  mi-mars) : 65 games — le Booster Finisseur à la 60ᵉ, puis cinq games, une par session
  (12/11/2026). L'accueil écrit la saison en cours et ses dates indicatives (`periode`).
  On change de saison par le panneau « Saison en cours » de Modération → Saison
  — vers la suivante, ou en revenant à une d'avant pour la montrer, c'est la même remise
  à zéro —, réservé à `RESPONSABLES_SAISON` (Jex3_, son
  identifiant Twitch lu en base — le panneau n'existe que pour lui), après une fenêtre de
  confirmation, sans phrase à taper ni animation (12/11/2026). `nouvelleSaison` efface
  games, boosters,
  ouvertures, cartes, duels, évènements et codes, remet le compteur de subs et les
  flocons à zéro (par `adjust`, au grand livre), redonne trois Jokers, et règle la
  limite. Comptes, grand livre et journal restent ; le registre des subs ne compte que
  ce qui suit la remise à zéro (`config.remiseA`).
- **Modération → Saison** (18/11/2026, ex-« Subs & saison ») : le bilan de la saison en image
  (`VisuelBilan`, chiffres de `bilanSaison`) — la carte du champion sur l'illustration de
  l'Aurore Triomphale, le reste du top 6 (ou les finalistes), les chiffres de la ligue, ses
  distinctions, et les boosters en 3D du rendu de l'accueil (`public/bilan/boosters-3d.webp`) —,
  à copier pour Discord ou à télécharger ; et le changement de saison. Le compteur de subs à
  la main, la limite de games, la sauvegarde et le branchement Twitch n'y sont plus (le bandeau
  du tableau de bord mène droit au branchement, si Twitch se débranchait).
- Les constantes de saison vivent dans `lib/domain/rules.ts`, nulle part ailleurs.
- **Le solde maximum de flocons suit la saison** (18/11/2026, `ParametresSaison.soldeMax`,
  `soldeMaxDe`) : **30 000 en Mini Ligue, 50 000 en saison 2** ; ce que rapportent les games ne
  change pas. Les paliers de chance s'y ramènent (`paliersChance` : ×4 au solde maximum), et
  tout ce qui parle de « solde plein » le lit — crédit et ajustement (`credit`, `adjust`), duels
  fermés, cadeau du jour, codes cadeaux, règles, fiche, menu. `SOLDE_MAX_ABSOLU` ne sert qu'aux
  bornes des formulaires et à la lecture de la base.
- **Au palier du Finisseur** (30ᵉ game en saison 1, 60ᵉ en saison 2), les Boosters Perso
  d'un joueur s'ouvrent en Boosters Finisseur — il n'ouvre plus de Perso ; repassé sous le
  palier, ce sont de nouveau des Perso (`packEffectif`, `auPalierFinisseur`, 15/11/2026).
  Le dû garde son type : l'ouverture décide.
- Le catalogue de cartes vit dans `lib/domain/catalog.ts`. Les actions sont celles des
  roues de la Summer Ligue ; chaque carte porte un **nom d'hiver** (`name`) et
  l'**intitulé de son action** (`subtitle`). Ajouter une carte, c'est ajouter une entrée
  là ; ajouter un genre d'effet, c'est aussi une branche dans `lib/services/effects.ts`,
  dans `impactMax()`, dans `momentDe()` et dans `resumeEffet()`.
- Le Booster Perso a ses propres cartes. Le Commu (14), le Folie (7) et le
  Finisseur (9) tirent **les actions des roues de la Summer Ligue, telles quelles**
  (décidé le 03/11/2026, sans les deux actions FloooZii), en cartes classées par
  rareté selon leur force : genre `roue` (`ActionRoue`), réglé dans `regleRoue`.
  Retouchées le 12/11/2026 : « Booster Commu tous les 20 subs » et « Meilleure game aux
  5 derniers » retirées ; le 17/11/2026, la Valse Boréale retirée, le **Tonnerre de
  Neige** passé en ultra rare, ×2 pour deux joueurs, et la **Morsure du Froid** (÷2) sur deux
  joueurs tirés, sa game tirée à l’ouverture ; **Premières Neiges** (+3 par game de moins
  de 5 kills) ne compte, comme l’Aurore Triomphale, que les games jouées depuis sa dernière
  sortie : une petite game ne rapporte qu’une fois ; la **Meilleure game ×1,5** ne se pose jamais sur une game qui a
  déjà un multiplicateur (Perso ou roues, `estMultipliee`, 13/11/2026) : elle prend la
  meilleure qui n'en a pas ; jamais une game figée ; le **Duel de
  Glace** (ex-Roulette russe, renommé le 15/11/2026) **se court comme un duel à six** (`CourseRoulette`, `ecritCourseRoulette`) — le
  perdant, seul à ne pas passer la ligne, est tiré à l'ouverture et mis **en tête des
  bénéficiaires**, que l'écran, l'overlay et la carte lisent ; la **Cryogénisation**
  (Folie, `fige_garde`) se garde et fige la meilleure game quand la modération la joue
  (`/api/admin/cartes/figer`, `joueFigeGarde`). **La pire game d'un joueur ne se fige
  jamais**, par aucune carte.
  Elles se règlent tout de suite, une fois la carte révélée, **une seule fois pour
  tous les joueurs tirés** (les cartes d'une même ouverture). **Prendre une game**
  — l'échanger, la copier, la figer : Vents Croisés, Inversion Polaire, Soleil Jumeau, les chaînes,
  le Troc, le Pacte, la Cryogénisation et les « fige » — vise toute game comptée
  **qui n'est pas figée** (`gamesPrenables`, décidé le 13/11/2026) : une carte déjà
  jouée dessus (un ×2, un bonus, un Pacte) ne la protège pas ; seules une carte qui
  fige (`estFigee`) et l'immunité du joueur le font.
  Les bonus qu'on pose sur sa propre game gardent « une game, une carte »
  (`gamesSansCarte`). Les **multiplicateurs des roues** (Tonnerre de Neige, Réveil du
  Glacier) prennent toute game qui marque, même déjà touchée par un bonus, sauf une
  game figée ou déjà multipliée (`gamesAMultiplier`, 15/11/2026). Les **échanges font changer les games de main** (16/11/2026, `transfereGame`) :
  kills, top, score et cartes posées partent avec la game, qui garde la trace de son passage
  (`de`, `vers` dans `applied`, « game passée de X à Y » sur la fiche) ; ses flocons restent à
  qui l'a jouée, une game transférée ne se corrige ni ne se supprime, et la règle d'une game
  par session se compte sur les games jouées (`origineDe`). Un clone ou un vol de score
  arrive en points hors game. Leur
  tirage a ses cibles (`TROIS`, `SIX`, `DIX_PREMIERS`, `CINQ_DERNIERS`,
  `beneficiairesRoue`) et ignore la règle « pas de stock » : rien n'en reste en
  attente. Sans assez de joueurs avec une game, elle s'ouvre quand même et ne tombe sur
  personne (« sans effet », 17/11/2026) : le booster ne reste pas bloqué. Une game qu'elles ont touchée ne se corrige pas : elle se supprime. Les
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
  de la cible échangent leur score ; autant de fois qu'il a de Trocs, sur qui il veut —
  reprendre une game à qui la lui a prise compris, sauf figée entre-temps (17/11/2026 ; la
  trace `TROC_SUBI` retient qui, dans `paireId`) ; jamais sur un immunisé.
- **Le tirage d'une carte des roues ne tombe jamais sur un immunisé** quand son immunité
  la parerait — échanges, Soleil Jumeau, Morsure du Froid, Duel de Glace
  (`PAREES_PAR_L_IMMUNITE`, 17/11/2026) : elle ne ferait rien.
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
  02/11/2026) — et trois Boosters Perso de bienvenue, mis en file
  (`BOOSTERS_DE_BIENVENUE`, `RAISON_BIENVENUE`, 15/11/2026 ; pas la streameuse, pas les
  joueurs fictifs) —, et en garde cinq au plus : un sixième, tiré pendant qu'il en garde cinq,
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
  games (`TirageGames`), ou désignées par la carte (sa pire, sa meilleure), sans écran
  à elles : on passe droit à la carte et à son compte rendu (`gamesARouler`, 17/11/2026) ;
  un Finisseur ouvert pour un joueur ne déroule que ses games (`sansJoueurs`).
  **Pluie Blanche** (Commu) verse 100 flocons à chaque joueur en lice (12/11/2026 : elle
  ajoutait une game sup), par `credit`, l'ouverture en référence.
  `regleRoue` frappe ces games-là tant qu'elles le peuvent encore (`retenue`). Pas de
  tirage des games pour une carte qui tombe sur toute la ligue.
  À la révélation, **le compte rendu** (12/11/2026) : `regleRoue` écrit pour chaque
  joueur ce que la carte a fait à son total (`CarteEnAttente.bilan`), ses textes nomment
  la game touchée (« la game 7 »), et `/api/admin/packs/revelee` rend la vue réglée —
  qui gagne, qui perd, combien (`EffetVue`, `DestinCarte`). Une pire game rendue
  (Fonte des Neiges) compte comme un gain, pas une perte.
  Un échange au hasard (Vents Croisés) reste **du hasard pur** (décidé le 12/11/2026) :
  deux joueurs, puis une game au sort chez chacun, toutes à chances égales ; qui y gagne
  suit les deux scores tirés. Les games tirées, l'écran passe droit à la carte et à son
  compte rendu : plus de verdict sous le rail (17/11/2026).
- Les paliers de subs profitent à **tous les joueurs actifs** (boosters de la ligue,
  évènements). Seule l'**Avalanche** verse des flocons : la même somme
  (`AVALANCHE_FLOCONS`) à chaque joueur du classement (`joueursEnLice`), **même sans game**
  (27/11/2026 ; il en fallait une avant), tout de suite (`verseFloconsATous`, décidé le 02/11/2026). Ne jamais ajouter de
  récompense individuelle : c'est l'invariant anti-pay-to-win, et il est testé.
- **Le cadeau du jour** verse 40 ❄ par jour et, le septième jour d'affilée, met un
  Booster Perso en file au lieu de flocons (`boosterDuJour`, décidé le 02/11/2026) ;
  ce jour-là reste ouvert à solde plein. Il s'ouvre dès l'inscription, sans game.
- **Un Booster Perso s'achète 5 000 ❄** (`ACHAT_PERSO`, décidé le 02/11/2026), depuis le
  solde du menu (`AchatBooster`, `/api/achat-booster`, `acheteBoosterPerso`) : le prix
  passe au grand livre (`debit`, `ACHAT_BOOSTER`, la clé d'achat en référence — une même
  clé n'achète qu'une fois) et le booster est mis en file. Les flocons dépensés font
  baisser la chance : la fenêtre montre la chance avant et après, avant l'achat.
- **Plus de page de test** (retirée au lancement, le 21/11/2026) : ni « Test des cartes », ni
  données fictives sur le site, ni testeurs. `lib/services/donneesFictives.ts` ne sert plus qu'aux
  tests (une ligue qui a vécu, en mémoire) ; `PREFIXE_OUVERTURE_TEST` reste lu par l'overlay et le
  tchat, pour les ouvertures d'avant.
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
- **Rester connecté sur mobile** (17/11/2026) : la connexion d'un joueur ne force plus l'accord
  Twitch (`force_verify` réservé au branchement de la chaîne) ; le proxy ne prolonge jamais la
  session sur `/api/auth/…` ; dans le navigateur d'une appli (Twitch, Discord, Instagram…), un
  bandeau propose d'ouvrir le site dans Safari ou Chrome (`NavigateurIntegre`).
- **Twitch est la seule porte d'entrée**, et le rôle suit la chaîne à chaque connexion :
  la streameuse et ses modérateurs sont admin, les autres joueurs. Les rôles ne se
  choisissent pas à la main, et un joueur ne s'inscrit que par Twitch. Il n'y a ni mot
  de passe ni session sans joueur : ne pas en rouvrir.
- **Le pseudo en jeu** (identifiant Activision), **sans le « #1234567 »** que les captures ne
  montrent pas (`sansSuffixeActivision`, retiré par le schéma), se donne à l'inscription (`InscriptionWarzone`),
  qui demande de le garder toute la ligue et de jouer sur son propre compte ; s'il en change,
  le joueur le met à jour lui-même sur sa fiche (`PseudoActivision`, `PATCH /api/me`,
  17/11/2026) — jamais un pseudo déjà pris, et le journal garde l'ancien et le nouveau
  (`ACTIVISION_CHANGE`). La modération peut toujours le corriger.
- **« Ne joue pas »** (17/11/2026, `horsLigue`, `/api/admin/joueurs/hors-ligue`) : dans Modération →
  Joueurs, une case que la modération coche pour un compte connecté qui ne joue pas — jamais
  cochée par défaut. Il quitte le classement, les tirages (`joueursEnLice`), la saisie et la file
  des boosters ; ses Boosters Perso non ouverts, **sauf ceux de bienvenue** (25/11/2026,
  `boostersADonner`), forment une réserve de boosters cadeau
  (`reserveHorsLigue`, source `joueur:<id>`) que le tableau de bord donne comme ceux d'un viewer
  (`donneBoosterCadeau` les fait changer de main). Décoché, il revient avec ce qui n'a pas été donné.
- **Le mode visiteur** (16/11/2026, `lib/auth/visiteur.ts`) : sous « M'inscrire avec Twitch »,
  l'accueil propose « Entrer en mode visiteur » (`/api/visiteur`), qui pose un cookie
  `wl_visiteur` — **pas une session** : il ne désigne personne et ne porte aucun rôle. Les pages
  de lecture (`/`, `/boosters`, `/duels`, `/joueurs/[slug]`, `/regles`) passent par
  `exigeLecteur()` : un joueur, ou un visiteur, qui voit tout sans rien pouvoir faire (ni
  modération, ni solde, ni duel ; le menu lui propose de s'inscrire, ou de revenir à
  l'accueil). Seul `GET /api/affrontements` se lit aussi en visiteur ; toute route qui écrit
  exige toujours une session. La déconnexion efface aussi le cookie.
- **Les flocons se donnent par codes cadeaux** (`lib/services/codes.ts`) : la modération
  fixe le montant et le nombre d'utilisations, chaque joueur tape le code une fois, et
  chaque utilisation est un `credit()` avec le code en référence — c'est le grand livre
  qui compte les utilisations. Plus d'attribution de flocons à la main. Le modo qui crée un code
  s'en sert aussi, une fois, s'il joue (23/11/2026) ; jamais la streameuse ni un compte « ne joue pas ».
- **La saisie par capture** (`lib/services/reconnaissance.ts`) : le modèle recopie les en-têtes et
  les nombres de chaque ligne, sans rien décider ; les kills se calculent ici (`killsDeLaLigne`,
  23/11/2026) — **ÉLIM./ASSIST. moins ASSIST.**, contrôlés par la colonne ÉLIM. : un écart, et
  l'écran de saisie le signale. Le modèle prenait ÉLIM./ASSIST. pour les kills.
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
  (03/11/2026) ; s'il s'inscrit, il ne reçoit que ce qui n'a pas été redonné. Les cadeaux
  **anonymes** y vont aussi (18/11/2026) : tous ensemble, un donateur « Anonyme »
  (`DONATEUR_ANONYME`, `donateurDe`), même règle — cinq subs offerts d'un coup, ou un T3. Pour l'offrir à un autre,
  la modération fait − chez l'un et + chez l'autre, sous le pseudo dans le classement
  (`ajusteBoostersPerso`) ; plus de − / + dans Modération → Joueurs.
- Les duels se jouent entre joueurs : il n'y a plus de bot. `CAMP_BOT` ne sert plus
  qu'à afficher les anciens duels.
- **Un duel joué pendant l'absence** (17/11/2026) : présent sur la page (lue il y a moins de
  `PRESENCE_MS`), on voit la course en direct ; sinon — page fermée, onglet caché, retour sur
  `/duels` —, une fenêtre dit « Pendant ton absence », gagné ou perdu et combien, et propose
  « Voir le replay » ou « Passer » (`etat: 'absence'`). Un onglet caché ne sonde pas.
- **La fenêtre d'un duel ne se ferme qu'à la main** (décidé le 20/10/2026) : ni pendant
  la course — un duel ne se saute pas —, ni d'elle-même une fois le verdict tombé. Le
  solde du menu, rendu par le serveur, suit par `router.refresh()` dès la ligne
  d'arrivée (`marqueFini`), jamais avant : il trahirait l'issue.
- Les overlays OBS (`/overlay/…`) lisent par `Store.fluxOverlay`, jamais par `read()` :
  ils interrogent le serveur toutes les deux secondes pendant un live.
  L'overlay des boosters ne joue que le Perso et le Finisseur : le Commu et le Folie,
  la streameuse les ouvre elle-même à l'écran (`HORS_OVERLAY`, 15/11/2026) — écartés dès
  la lecture (`fluxOverlay`), sinon cinq d'affilée remplissaient le lot et bloquaient la suite.
  L'ouverture, sur le site comme sur l'overlay, va à `ALLURE_OUVERTURE` (`melangeRail.ts`,
  17/11/2026) : vidéo plus rapide, mélange en trois passes, rail en 70 % du temps ; le repère
  du rail est fait de deux flèches de glace qui pincent la carte à l'arrêt.
  Il n'y a plus d'overlay des duels (16/11/2026) : le compteur de subs (`OverlaySubs`) annonce
  un duel lancé, ou un palier franchi, par une ligne au-dessus de lui.
  **Modération → Alertes** (16/11/2026, `config.alertes`, `alertesDe`) coupe, pour tester
  pendant un live, le message du tchat des boosters — l'overlay OBS n'y est pas soumis. Les
  cartes se règlent quand même : seul le message est coupé.
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
- **L'accueil déconnecté** (`components/Accueil.tsx`, refait le 16/11/2026) tient en un seul écran,
  sans défiler, sur un ordinateur (de 1024×620 à 2560×1267 : `scrollHeight <= innerHeight`) comme
  sur un téléphone debout. Il s'ouvre, **à chaque visite**, sur une vidéo rendue dans Blender (EEVEE,
  `scratchpad/display/display4.py`, neige et ciel de Poly Haven) **qui couvre tout l'écran**, pied
  de page compris (`.acc-calque`, plateau en `cover`) : une display de boosters (sans neige dessus,
  sans cadre blanc) tombe dans un champ de neige, s'y enfonce et se renverse un peu ; son couvercle
  saute, des boosters — de vrais sachets épais — et des mottes de neige sont éjectés (corps rigides
  simulés, puis enregistrés), y laissent leur empreinte ; les quatre de la ligue se relèvent
  ensemble et vont prendre leur pose. Deux cadrages (`PAYSAGE` 16:9, `PORTRAIT` 1:2,
  `REQUETE_PORTRAIT`). La vidéo porte trois images (la scène, les quatre boosters, leur
  transparence) qu'un shader WebGL assemble (`ecranBrume`) : dès qu'ils se relèvent, un brouillard
  monte **sous eux** (`BRUME`, `avanceeBrume`), couvre la scène, puis se dissipe sur la page. À la
  dernière image, les vraies images des boosters prennent le relais au pixel près (`places`,
  `placeEnVariables` : à changer avec la vidéo). Pendant la vidéo, « Passer l'animation » (`.acc-passer`, en bas au milieu) l'arrête : les boosters et la page arrivent tout de suite. Une fois tout posé, « Revoir l'animation »
  (`.acc-revoir`) la relance. La page apparaît : au milieu, le nom, une phrase, l'entrée Twitch et le compte à rebours
  (`CalendrierSaisons compact`) ; en bas, six tuiles de verre coloré pour les règles, en carrousel
  (`CarrouselTuiles` : une au milieu, ses voisines en arc qui s'effacent dans le fond ; on glisse, à la
  molette, ou par les points cliquables au-dessus), un peu sous le pied de page. La vidéo se joue même si le système demande moins
  d'animations (Windows le dit quand ses effets sont coupés) ; sans WebGL ou si la lecture est
  refusée, tout arrive tout de suite. Ses réglages selon la taille passent par `@media`, jamais par
  `@container` : le compte à rebours réévaluait les règles de conteneur chaque seconde et relançait
  les animations d'arrivée.
- Les couleurs viennent des variables CSS de `app/globals.css`, jamais codées en dur.
- Avant de livrer : `npm run typecheck && npm test && npm run build`.

## Contexte

Le détail des protections et la liste de ce qui reste à faire avant la production sont
dans `docs/SECURITE.md`. Le lire avant de toucher à l'authentification, au stockage ou aux
flocons.
<!-- END:winter-ligue -->
