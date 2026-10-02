# Le rail d'ouverture — spécification

Ce fichier est la source des nombres. Le code les importe de `lib/spin/courbe.ts`
et de `lib/spin/bande.ts` ; ici on dit **d'où ils viennent**, ce qui est mesuré et
ce qui est déduit. Régler le ressenti, c'est bouger un nombre ici et son jumeau
là-bas — jamais retoucher le composant.

## 0. Le principe, et l'invariant qu'il sert

Le résultat est tiré **avant** l'animation, par le serveur, dans la même
transaction que le débit. `POST /api/shop` renvoie les cartes ; le rail ne fait
que les révéler. Rien de ce que le navigateur calcule ici n'a d'effet sur le
contenu du booster : la bande de leurres, la durée, le son sont de l'affichage.
C'est l'invariant n°1 de `AGENTS.md`, et c'est aussi ce qui rend l'interruption
inoffensive — recharger pendant le spin ne change pas une carte, la clé
d'idempotence renvoie exactement le même tirage.

## 1. Provenance des mesures

Vidéo `2026-08-31 13-08-56.mp4`, 1920×1080 à 60 i/s, 21 s, deux ouvertures
consécutives. Analyse image par image : suivi du décalage par corrélation sur une
colonne de pixels, déroulement de l'aliasing dû à la répétition des items, puis
énergie de changement image à image là où la corrélation devenait ambiguë.

La vidéo montre **cinq colonnes verticales**, et c'est la disposition retenue. Une
version couchée — N bandes horizontales empilées — a été construite puis
abandonnée : elle obligeait à réinventer une géométrie que la vidéo donnait déjà,
et à sept ou douze items visibles par bande elle ressemblait à un tapis roulant
plutôt qu'à une machine.

## 2. Le mouvement — mesuré

| grandeur             | valeur                              | statut               |
| -------------------- | ----------------------------------- | -------------------- |
| durée d'une course   | **6 800 ms** (1,8 s → 8,6 s)        | mesuré               |
| items parcourus      | **37** chez eux, **24** ici (§4)     | mesuré, puis transposé |
| vitesse de pointe    | **59,5 items/s**                    | mesuré sous plafond  |
| décélération         | somme de deux exponentielles        | ajusté sur la mesure |
| étalement des arrêts | **500 ms**, ordre tiré au sort      | mesuré               |

Les arrêts relevés sur la vidéo : **5,97 · 6,07 · 6,17 · 6,47 s**. Les rouleaux
partent donc ensemble — ils démarrent à l'image près — et se séparent en fin de
course, dans un ordre qui n'est pas celui des colonnes.

C'est la durée de chaque rouleau qui varie, jamais son départ. L'avancement étant
normalisé par la durée propre à chacun, un rouleau plus lent parcourt exactement
le même trajet : sa gagnante tombe au même endroit, il met simplement plus
longtemps à y arriver, et sa traîne s'allonge. Retarder les **départs**, ce qu'on
fait spontanément, produit l'inverse — cinq rouleaux qui s'ébranlent l'un après
l'autre puis s'arrêtent dans le même ordre, ce qui se lit comme une vague et non
comme cinq machines qui hésitent chacune pour soi.

Vitesse relevée sur leur rouleau, en items par seconde depuis le départ :

    +0,35 s → 35,0    +0,75 s → 14,4    +1,15 s → 7,7    +1,55 s → 5,3
    +2,15 s →  3,8    +2,75 s →  2,4    +3,55 s → 1,4    +4,35 s → 0,5

Une exponentielle simple se trompe de 45 % au milieu : la courbe réelle chute plus
vite au début et traîne plus longtemps à la fin qu'aucune exponentielle unique ne
le peut. La somme de deux la décrit — un lancer bref qui meurt, puis une glisse
longue, chacun parcourant à peu près la moitié du trajet :

    v(t) = 41·e^(−t/0,33) + 19·e^(−t/1,26)   items par seconde

**Le plafond de 60 items/s n'est pas négociable.** L'ajustement libre donnait
145 items/s au départ, meilleure erreur et résultat inutilisable : le premier
point mesuré est à +0,35 s, tout ce qui précède était de l'extrapolation, et c'est
elle qui pilote la demi-seconde la plus visible. Six images consécutives extraites
au moment le plus rapide tranchent : les objets y sont nets et décalés d'environ
**un item par image**, donc soixante par seconde. L'erreur d'ajustement passe de
11 % à 15 % — un peu moins bon, mais qui décrit ce qu'on voit.

Dans le code (`lib/spin/courbe.ts`) la courbe est écrite en **distance** plutôt
qu'en vitesse, parce que l'intégrale d'un `e^(−t/τ)` est un `τ·(1 − e^(−t/τ))` et
que `part` se lit alors comme « la distance que ce terme parcourt à lui seul » :

    ELAN   = { part: 13,53 items ; tau:  330 ms }
    GLISSE = { part: 23,83 items ; tau: 1260 ms }

L'avancement est normalisé par sa valeur à 6 800 ms, sans quoi une exponentielle
n'arrive jamais et la gagnante ne tomberait pas pile sous le repère.

## 3. Le son — mesuré

Six échantillons dans `public/sons/`. Durées décodées :

| fichier                 | durée   | rôle                     |
| ----------------------- | ------- | ------------------------ |
| `box-opening-spin-tick` | 0,132 s | une dent du cliquet      |
| `common`                | 0,784 s | le claquement d'un arrêt |
| `spin-bait`             | 5,747 s | la montée du défilement  |
| `rare`                  | 5,642 s | la fête, rare et +       |
| `ultra_rare`            | 3,762 s | la fête, ultra rare      |
| `legendary`             | 3,762 s | la fête, légendaire      |

Le cliquet ne porte que **40 ms de son utile**, suivies de 92 ms de silence
numérique : c'est ce qui détermine à partir de quelle cadence les dents se
recouvrent, et à 60 items/s elles se recouvrent — d'où le grondement du départ,
qui se résout peu à peu en clics distincts puis isolés.

Niveaux, mesurés après décodage (RMS pondéré des 20 % de fenêtres les plus fortes,
ce qui ignore les silences de tête et de queue) :

| fichier      | crête      | corps      | écart au plus fort |
| ------------ | ---------- | ---------- | ------------------ |
| `tick`       | −21,6 dBFS | −36,8 dBFS | −11,9 dB           |
| `common`     | −16,7      | −33,6      | −8,7               |
| `spin-bait`  | −20,9      | −31,5      | −6,6               |
| `rare`       | −9,4       | −26,5      | −1,6               |
| `legendary`  | −9,9       | −25,2      | −0,3               |
| `ultra_rare` | −6,3       | −24,9      | 0                  |

Les six s'étalent sur douze décibels. Un réglage posé au jugé par rôle — cliquet
discret, fanfare forte — allait donc dans le mauvais sens : il baissait encore le
fichier déjà le plus faible. Chaque gain est le produit d'une **normalisation**
vers `ultra_rare` et d'un **écart de rôle** en décibels, seule partie discutable :
cliquet −8 dB parce qu'il revient trente-sept fois et doit être la texture et non
le sujet, appât −6, claquement −4, fanfares 0.

### Ce que la Web Audio change par rapport à Howler

Howler ne sait pas programmer un son pour un instant futur : il joue « maintenant ».
Le cliquet réclame le contraire — on connaît à l'avance les trente-sept instants,
et les poser tous d'un coup sur l'horloge audio les rend **échantillon-précis**,
là où un déclenchement en `requestAnimationFrame` les quantifie à l'image et
ajoute la gigue du fil principal. C'est la seule raison du changement, et elle
suffit : Howler n'est plus importé nulle part.

Le calage des deux horloges passe par `AudioContext.getOutputTimestamp()`, qui
donne le couple (temps audio, temps `performance.now()`) du même échantillon. On y
ramène le `startTime` de l'animation, et les deux mondes partagent alors une
origine commune au lieu d'être recalés à la louche.

## 4. La géométrie — des cartes, pas des jetons

Ce qui défile est une **carte**, illustration et nom compris. C'est le point où
l'on cesse de copier EmpireDrop : eux vendent des baskets et des téléphones, et un
disque avec la photo du produit suffit. Ici on ouvre un booster, et un pictogramme
qui passe ne dit pas qu'on gagne une carte.

La feuille de style calcule tout, en requêtes de conteneur sur `.rail-scene` ; le
moteur ne fait que **mesurer le résultat** — le pas est l'écart réel entre deux
tuiles, la fenêtre est la hauteur réelle du bandeau.

C'était l'inverse, et cela coûtait deux choses. La feuille avait besoin de valeurs
par défaut pour le temps d'avant, et elles étaient fausses : on voyait à
l'ouverture, l'espace d'un battement, des cadres empilés à 120 px les uns des
autres au lieu de 305. Et deux sources décrivaient la même géométrie — elles ont
déjà divergé une fois, et le rail s'arrêtait alors deux tuiles à côté du repère.

    largeur d'une colonne   colonne = largeur du bandeau / N
    largeur d'une carte     0,74 × colonne, bornée à [92 ; 232] px
    hauteur d'une carte     largeur ÷ (1514/2231)   — le rapport du cadre peint
    pas vertical            hauteur de carte + 28
    hauteur du bandeau      1,6 × pas

Dans la colonne de contenu du site, large de 1 272 px, cinq rouleaux donnent des
colonnes de 254 px, des cartes de 188 sur 277, un pas de 305 et une fenêtre de 488.
Une carte pleine au centre, ses deux voisines tranchées par le bord, et 66 px de
fond visible entre deux colonnes — les cartes semblaient collées à 0,84.

### Pourquoi le trajet n'est plus de 37 items

Copier les 37 items mesurés serait une faute dès que la taille des tuiles change.
Ce qui gouverne la lisibilité n'est pas le nombre d'items par seconde mais le
nombre de **hauteurs de fenêtre** par seconde : entre deux images, le contenu ne
doit pas changer entièrement, sinon ce n'est plus du mouvement mais un
stroboscope — et cela se lit à la fois comme du hachage et comme de la vitesse
excessive.

|                                | EmpireDrop | ici     |
| ------------------------------ | ---------- | ------- |
| items visibles dans la fenêtre | 2,4        | 1,6     |
| items parcourus                | 37         | **24**  |
| trajet, en hauteurs de fenêtre | 15,4       | 15,0    |
| pointe, en fenêtres par seconde | 25,0      | 24,1    |

Les deux dernières lignes sont les invariants ; les deux premières en découlent.
Une carte fait deux fois et demie la hauteur d'un jeton : garder 37 items
multiplierait la vitesse en pixels d'autant, et le rail deviendrait illisible.
`PARCOURS` est donc **dérivé** de `VISIBLES` dans `lib/spin/courbe.ts`, et deux
tests verrouillent les deux invariants.

### Le rouleau

    MARGE         = 3 tuiles de part et d'autre
    RANG_GAGNANT  = 24 + 3 = 27
    TUILES        = 27 + 3 + 1 = 31

Pas de recyclage par modulo : un seul rouleau long, translaté d'un bloc par une
seule animation. Le recyclage économise des tuiles mais impose de replacer chaque
carte à chaque image en JavaScript, ce qui interdit le compositeur.

### Ce qui défile est le cadre peint — et une estimation à corriger

Les rouleaux portent `CardFrame`, le même objet que la liste des cartes et la fiche :
fleuron, volutes, fenêtre d'illustration, bandeau de texte, rareté.
Une carte simplifiée ne ressemblait à rien de ce que le joueur connaît.

Deux versions antérieures de ce fichier l'avaient écarté, au motif que `CardArt`
serait « un vecteur d'une centaine de tracés » et que 230 scènes feraient sauter le
démarrage. **C'était faux, et le compte est simple à refaire :** les vingt-quatre
scènes de `components/CardArt.tsx` totalisent 182 balises SVG, soit environ huit
par scène. Le cadre, lui, est **une seule image WebP** — `public/cadres/glace.webp`
— partagée par toutes les tuiles : un décodage, puis autant de rendus de la même
source, colorés par rareté d'une rotation de teinte. Trente et une cartes par
rouleau, cinq rouleaux, font quelque deux mille cinq cents balises, ce qu'une page
porte couramment.

Ce qui coûtait vraiment est neutralisé dans le rouleau, et seulement là :
`.cadre` pose une ombre portée et deux transitions par carte — justes pour une
grille qu'on survole, ruineuses à cent cinquante-cinq exemplaires, autant de passes
de flou hors écran à rastériser avant la première image. `.rail-carte .cadre`
les annule. Le halo par carte n'est posé que sur les trois raretés hautes, et il
ne bat pas.

### Le halo de la colonne, allumé par la rareté qui passe

Une rare qui approche doit se voir avant d'être lue. La colonne s'allume donc à
la couleur de la carte qui franchit le repère — et les instants viennent de la
**même inversion de courbe** que les dents du cliquet, si bien que le halo
s'allume pile sur le clic qu'on entend, sans qu'aucune boucle ne surveille la
position.

Deux garde-fous, tous deux dans `useSpinAnimation.ts` :

- `HALO_RANG = 2` — rare et au-dessus seulement. Un halo à chaque commune n'est
  plus un signal, c'est un clignotant.
- `HALO_ECART = 140 ms` — rien tant que deux franchissements sont plus serrés que
  ça. Au départ une carte passe toutes les vingt-cinq millisecondes : allumer à
  chacune donnerait un stroboscope coloré. Le halo n'a de sens qu'en fin de
  course, quand on a le temps de le voir.

Il en résulte une poignée de minuteries par rouleau, contre une écriture par image
si l'on suivait la position.

## 5. Les choix, et pourquoi ils vont contre le conseil reçu

- **Pas de flou de mouvement.** Essayé deux fois, écarté deux fois, et pour deux
  raisons différentes. La première fois pour cause de hachage — mais ce
  diagnostic-là visait un `filter` *animé* sur les enfants du rail, qui force le
  re-tramage de la couche à chaque image. La seconde après l'avoir vu tourner,
  fixe et donc peu coûteux : une carte floue n'est plus une carte, et depuis que
  les rouleaux montrent de vraies cartes, ce qui défile mérite d'être lisible.
  `FLOU` dans `useSpinAnimation.ts` vaut 0 ; une valeur non nulle le rétablit.
- **Pas de décalage aléatoire à l'arrivée.** ±35 % du pas est crédible sur un jeton
  rond sous un curseur fin. Sous un repère qui traverse le bandeau, une carte qui
  dépasse se lit comme un arrêt raté, pas comme du naturel. L'arrêt tombe au
  centre — et le hasard, on l'a mis dans l'étalement des arrêts, où il est mesuré.
- **La courbe mesurée, pas un `easeOutQuart` ni une `cubic-bezier`.** Une Bézier
  cubique ne peut décrire qu'un seul régime, alors que la courbe en a deux — un
  lancer bref qui meurt, puis une glisse longue — et une exponentielle unique se
  trompe déjà de 45 % au milieu. La somme de deux s'inverse par bissection en une
  soixantaine d'itérations, hors rendu, une fois par ouverture : la
  pré-programmation échantillon-précise des dents marche exactement pareil.
- **Pas de `requestAnimationFrame`, ni pour l'image ni pour le son.** Le mouvement
  est une animation WAAPI sur `transform`, donc sur le compositeur, donc sans une
  ligne de JavaScript par image. Le cliquet est programmé d'avance sur l'horloge
  audio. Une boucle qui déplacerait le rouleau et guetterait les franchissements
  ferait les deux moins bien : elle quantifierait chaque dent à l'image — 16,7 ms
  de pas — et lui ajouterait la gigue du fil principal, précisément occupé
  ailleurs au moment le plus dense.

Deux choix de mise en scène, discutables et donc écrits ici :

- **L'appât se joue toujours**, calé sur sa **fin** et non sur son début, pour
  résoudre pile au dernier claquement. Ne le déclencher que sur une rareté haute
  donnerait l'anticipation au prix de la surprise : le joueur saurait avant la fin
  de l'animation qu'il a gagné quelque chose. `APPAT_TOUJOURS` dans
  `components/useSpinAnimation.ts` inverse ce choix en une ligne.
- **Un seul rouleau émet le cliquet** : celui qui s'arrête en dernier. Les cinq
  sont identiques pendant six secondes sur six et demie, donc cinq cliquets
  superposés ne feraient pas un mécanisme plus riche — ils gaspilleraient des voix
  sur exactement le même son. Prendre le plus long garde le cliquet vivant jusqu'au
  dernier arrêt au lieu de le couper pendant que deux rouleaux tournent encore.
  Chaque rouleau garde en revanche son claquement d'arrêt, qui est l'évènement
  qu'on voit, et c'est lui qui fait des cinq arrêts cinq moments.

### La fin de course ne dépend d'aucune promesse d'animation

`Animation.finished` est le meilleur signal pour poser une bande à l'arrêt : il
tombe à l'image près. C'est un mauvais signal pour **changer d'écran**. S'il
n'arrive pas — annulation, onglet en arrière-plan, animation remplacée — le joueur
reste devant un rail immobile sans jamais voir ses cartes, et rien ne le rattrape.
C'est arrivé.

L'autorité est donc une minuterie posée à `amorce + max(durées) + 250 ms`, calculée
depuis des durées qu'on a soi-même fixées. `finished` ne fait qu'arriver plus tôt
quand tout va bien, et le passage à la révélation est verrouillé par un drapeau
pour ne se produire qu'une fois.

Dans la même veine : `Animation.ready` est **rejetée** quand l'animation est
annulée avant d'avoir démarré — au démontage, et à chaque montage double du mode
strict. Sans `catch`, le rejet remonte en `unhandledRejection`, avec un libellé
trompeur : « AbortError: The user aborted a request », qui est le message standard
d'une annulation et n'a rien à voir avec une requête réseau. Le journal de
développement en comptait deux cent dix-huit.

### Aucun trait net dans le bandeau

Les lueurs de rareté passent par `drop-shadow` sur la carte et par des ombres
intérieures floues sur la colonne — jamais par un liseré d'un pixel.

Une `box-shadow` dessine le **rectangle englobant** : sur une carte à angles ornés,
elle traçait un cadre bleu qui n'appartenait à rien, et un liseré par colonne
faisait une grille de rectangles en travers du bandeau. `drop-shadow` suit la
silhouette réellement peinte, volutes comprises.

## 5 bis. Le jeton Winter Spin

Un emplacement d'effet peut tomber sur un **jeton** au lieu d'une carte. Il est
alors rejoué sur-le-champ, avec une table qui favorise fortement l'ultra rare et
la légendaire. La colonne correspondante s'arrête sur le jeton, marque une pause,
puis repart.

### Ce n'est pas une carte

Le joueur ne le garde pas, il n'a pas d'effet en jeu. C'est un résultat d'emplacement, consommé dans
l'instant. D'où son absence du catalogue et de `applyEffect()` : ajouter une
entrée là-bas aurait cassé les quatre cartes par palier, et surtout aurait laissé
croire qu'on peut le posséder.

### Les deux nombres, dans `lib/domain/rules.ts`

| grandeur   | valeur                                    | pourquoi                              |
| ---------- | ----------------------------------------- | ------------------------------------- |
| `chance`   | **80 / 100 000** par emplacement d'effet   | un Givre sur 1 250, un Everest sur 420 |
| `weights`  | R 15 % · SR 25 % · UR 40 % · L 20 %       | 60 % d'ultra rare ou de légendaire     |

La chance est tirée **avant** la rareté et séparément d'elle. C'est ce qui permet
de la régler sans toucher aux tables de raretés, qui doivent sommer exactement à
100 000 : y glisser le jeton aurait obligé à retirer son poids à une rareté, et le
taux affiché sous le sachet serait devenu faux.

**Une seule relance.** Le second tirage ne peut pas retomber sur le jeton : une
chaîne sans borne serait invérifiable, et l'attente à l'écran aussi.

L'effet sur le taux global de légendaires est négligeable — 0,08 % × 20 % —
précisément parce que le jeton est rare. La carte obtenue reste soumise à
`CARD_IMPACT_CAP` comme toutes les autres, donc l'invariant anti-pay-to-win tient.

### Le seul endroit où l'affichage s'écarte des taux

Le jeton est semé en **leurre** dans toute bande, à raison d'une tuile sur
vingt-cinq — soit une ou deux par colonne, sans rapport avec sa vraie probabilité.
C'est assumé et c'est le seul cas : un appât qu'on ne voit jamais n'appâte
personne, et le voir passer sans s'arrêter dessus est ce qui fait qu'on le
reconnaît le jour où il s'arrête. Il ne porte sur aucune rareté — les cartes,
elles, restent tirées aux vrais taux du booster.

Jamais dans les trois cases qui précèdent un arrêt : un jeton qui frôle le repère
juste avant la carte gagnée ferait croire à une relance manquée.

### La mise en scène : une animation, deux actes

La colonne rejouée porte **une seule bande**, longue de `RANG_RELANCE + MARGE + 1`,
avec le jeton au rang 27 et la vraie gagnante au rang 51. Une seule animation la
parcourt, en trois temps : la première course, un palier immobile de 900 ms, la
seconde course.

Découper en deux animations enchaînées aurait demandé de guetter la fin de la
première pour lancer la seconde — donc de remettre une promesse au milieu du
chemin, ce qui a déjà valu un écran figé. Le palier n'est pas décoratif non plus :
sans lui, l'interpolation linéaire ferait glisser le rouleau pendant toute la
pause au lieu de l'immobiliser.

Le cliquet, le halo et les claquements suivent : le second acte rejoue les mêmes
franchissements, décalés du premier acte et de la pause.

### Le jeton n'est pas une carte, et cela doit se voir

Le logo, sa fumée, et **rien d'autre** : ni cadre, ni bordure, ni coins arrondis,
ni bandeau de texte. Le fond reprend exactement celui du bandeau, si bien que le
jeton n'a aucun contour — il flotte au milieu de cartes encadrées, et c'est cette
rupture qui le fait reconnaître d'un coup d'œil.

Deux versions ont été essayées et défaites avant celle-là. Une boîte sombre
cerclée d'un liseré se lisait comme un cadre qui n'aurait pas chargé. Un vrai
cadre peint, ensuite, le rangeait parmi les cartes — même silhouette, même
bandeau — alors que tout son intérêt est de ne pas en être une : on ne le gagne
pas, on ne le garde pas, il rejoue l'emplacement et disparaît.

Le fond sombre n'est pas décoratif pour autant : `mix-blend-mode: screen` a besoin
de quelque chose à traverser, et sans lui le noir du logo resterait noir.

Il emprunte le **rang** d'une légendaire — c'est ce qui lui vaut le halo de
colonne quand il passe sous le repère — mais sa teinte est celle de son blason,
pas l'or des légendaires : un halo doré autour d'un logo de glace ne va nulle
part.

Le fichier du logo est à **`public/winter-spin.webp`**. Vérifié en lisant son en-tête
VP8L : 896 × 1200, **sans canal alpha** — son fond est un noir opaque, et posé tel
quel il faisait un rectangle noir au milieu du jeton.

Il n'est pas retouché pour autant. `mix-blend-mode: screen` règle exactement ça :
le mélange par écran laisse passer le fond partout où le logo est noir et
n'altère pas les zones claires. Sur fond sombre, le résultat est celui qu'aurait
donné une vraie transparence — et il est même meilleur, puisque la fumée passe
aussi à travers les parties sombres du blason, ce qu'un détourage aurait bouché.

Le logo reste une **image de fond** plutôt qu'une balise : si le fichier venait à
manquer, rien n'est peint et le titre en repli reprend sa place, sans erreur ni
icône cassée.

Derrière lui, deux nappes de fumée bleue dérivent en sens contraires, sur des
durées premières entre elles — 9 s et 13 s — si bien que la figure ne se répète
qu'au bout de deux minutes, donc jamais pendant une ouverture. Elles n'animent que
`transform` et `opacity`, les deux seules propriétés que le compositeur interpole
sans re-tramer la couche : un flou qui respire aurait été plus court à écrire et
aurait fait hacher le rail, comme la première fois. Ici le flou est **dans le
dégradé**, une fois pour toutes, et seul le mouvement est animé.

## 6. Modes

| mode     | durée    |
| -------- | -------- |
| normal   | 6 800 ms |
| rapide   | 3 000 ms |
| turbo    | 1 400 ms |
| immédiat | 0 ms     |

Le barème temporel est simplement comprimé : la forme de la courbe ne change pas,
donc le ressenti non plus. L'étranglement du cliquet à 15 ms fait le reste — en
turbo il jette les deux tiers des dents au lieu de mitrailler.

Le défaut est **normal, pour tout le monde**. `prefers-reduced-motion` n'est pas
consulté, et c'est un écart assumé par rapport à l'usage.

Il l'a été, et c'était une erreur. Mesuré sur la machine de développement, sans
rien forcer :

    matchMedia('(prefers-reduced-motion: reduce)').matches  →  true

Windows annonce « animations réduites » dès que les effets d'animation du système
sont coupés — `HKCU\Control Panel\Desktop\WindowMetrics\MinAnimate` à zéro. C'est
le défaut de plusieurs distributions allégées taillées pour le jeu, et un réglage
que beaucoup de joueurs font eux-mêmes pour gagner des images par seconde. Sur ces
machines, le signal ne dit pas « le mouvement me gêne », il dit « je veux que
Windows soit rapide ».

Conséquence concrète : l'ouverture se terminait avant d'avoir commencé pour une
part importante du public visé, alors que tous les autres sites du genre — qui
n'implémentent pas ce signal — leur montraient bien l'animation. Le seul site
cassé était le nôtre.

L'accessibilité devient donc **explicite** au lieu d'être devinée : le sélecteur
propose « Immédiat », et ce choix est retenu d'une visite à l'autre. Qui a besoin
d'un écran sans mouvement le dit une fois. La feuille de style garde par ailleurs
sa requête de média, qui retire le sursaut de la carte à l'arrivée — une
concession qui ne coûte rien à personne.

Le son a son propre interrupteur, lui aussi retenu.

## 7. Ce qui n'a pas d'échantillon

Le conseil mentionne un `whoosh` de départ. Aucun fichier ne le porte, et rien
n'est synthétisé ici depuis que les sinus sont tombés : un enregistrement porte
des transitoires qu'aucune somme de sinus filtrés n'approche. À déposer dans
`public/sons/` sous le nom `whoosh.mp3` le jour où il existe, puis à ajouter dans
`SONS` et à programmer à `t0`.

## 8. Où vit quoi

| fichier                           | rôle                                              |
| --------------------------------- | ------------------------------------------------- |
| `lib/spin/courbe.ts`              | la courbe, son inverse, les images-clés, les dents |
| `lib/spin/bande.ts`               | la bande de leurres et la place de la gagnante     |
| `components/bruitage.ts`          | Web Audio : décodage, programmation, réglage       |
| `components/allure.ts`            | l'allure retenue, et le défaut de mouvement réduit |
| `components/useSpinAnimation.ts`  | le moteur : mesure, WAAPI, calage du son           |
| `components/SpinReel.tsx`         | le rendu, et rien d'autre                          |
| `tests/spin.test.ts`              | ce qui verrouille les deux modules purs            |
| `app/dev/rail/`                   | banc de réglage, hors production                   |
