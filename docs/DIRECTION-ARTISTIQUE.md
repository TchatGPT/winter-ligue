# Direction artistique — les illustrations de cartes

Ce document explique comment produire les 24 illustrations, avec Gemini, Midjourney,
Kling ou n'importe quel générateur d'images. Il est écrit pour être suivi dans l'ordre.

---

## La règle qui gouverne tout

**Ne fais jamais générer une carte entière.** Uniquement l'illustration.

Trois raisons, et elles sont décisives :

1. **Le texte sort déformé.** Aucun générateur ne compose un bloc de règles lisible en
   français à 8 px. Le texte doit rester du vrai texte, sélectionnable et traduisible.
2. **Le cadre gondole.** Une bordure générée n'est jamais deux fois la même : épaisseur,
   arrondi, position du bandeau varient. Sur 24 cartes côte à côte, ça se voit.
3. **Ce qui fait qu'un set est beau, c'est justement sa constance.** Regarde une planche
   Pokémon : le cadre est rigoureusement identique d'une carte à l'autre, seule
   l'illustration change. C'est cette répétition qui donne l'impression de collection.

Ici, le cadre est en code — `components/TradingCard.tsx` plus la section « carte de
collection » de `app/globals.css`. Il est vectoriel, identique partout, et se décline
gratuitement sur les 24 cartes. Tu n'as qu'à fournir les images.

---

## Gabarit technique

| | |
|---|---|
| Format | **4:3 paysage** |
| Résolution de travail | 1600 × 1200 |
| Livraison | **1024 × 768**, WebP qualité 82 |
| Poids visé | moins de 90 Ko par carte |
| Nom du fichier | l'identifiant exact de la carte, ex. `nuit-polaire.webp` |
| Emplacement | `public/cartes/` |

Après avoir déposé des fichiers :

```bash
npm run cartes
```

Cette commande recense les visuels présents. Tant qu'une carte n'a pas le sien, elle
affiche son glyphe — tu peux donc livrer les 24 illustrations au fil de l'eau sans
jamais casser le site.

**Cadrage.** Le sujet doit tenir dans les **80 % centraux**. Les bords sont mangés par
l'arrondi de la fenêtre et par le liseré intérieur. Ne mets rien d'important dans les
coins.

---

## La bible de style

C'est le passage à copier tel quel dans **chaque** prompt. C'est lui qui fait que les 24
images se ressemblent — sans lui, tu obtiendras 24 belles images qui ne vont pas ensemble.

```
Digital painting, dramatic Arctic fantasy, cinematic key art.
Deep midnight-blue palette (#050f1d to #1c3450), glacial cyan highlights (#8fdcff),
one single warm accent light. Volumetric fog, rim lighting from behind the subject,
subtle aurora glow in the upper background. Painterly brushwork, visible texture,
no outlines, no cel shading. Shallow depth of field, background softly blurred.
Wide 4:3 landscape composition, subject centred, generous negative space at the edges.
No text, no logos, no watermark, no borders, no frame, no UI.
```

Trois choses à ne jamais changer d'une carte à l'autre : **la palette**, **la direction
de la lumière** (elle vient de derrière et légèrement à gauche), et **le niveau de
détail**. Ce sont les trois signaux qui font qu'un œil reconnaît un set.

---

## L'accent chaud par rareté

Le seul écart autorisé à la palette froide. Il se cale sur la couleur de rareté du cadre
et fait monter la température visuelle avec la valeur de la carte.

| Rareté | Accent à demander |
|---|---|
| C — Commune | aucun accent, tout en bleu-gris |
| PC — Peu commune | `pale cyan accent light` |
| R — Rare | `soft indigo-violet accent light` |
| SR — Super rare | `magenta-pink accent light` |
| UR — Ultra rare | `warm amber accent light, embers` |
| L — Légendaire | `golden light shafts, radiant highlight` |

---

## Les 24 sujets

Colle la bible de style, puis le sujet, puis l'accent de rareté correspondant.

### ❄ Glace Éternelle — protéger

| Fichier | Sujet à demander |
|---|---|
| `congere.webp` | A deep windblown snowdrift curling over a rock, sculpted by wind |
| `bouclier-givre.webp` | A translucent shield of thick frost, cracks glowing faintly from within |
| `gel-eternel.webp` | A soldier's silhouette frozen mid-stride inside a block of clear blue ice |
| `second-souffle.webp` | A figure rising from the snow, breath steaming, storm clearing behind |
| `rempart-polaire.webp` | A towering wall of glacial ice, battlements carved by wind, storm behind |
| `sanctuaire.webp` | A cathedral of blue ice pillars, utterly still, light filtering down |

### 🌪 Tempête — amplifier

| Fichier | Sujet à demander |
|---|---|
| `rafale.webp` | Loose snow lifting off a ridge in a sharp gust, delicate spindrift |
| `vent-du-nord.webp` | A hard crosswind bending a line of frozen pines, snow streaking sideways |
| `percee.webp` | A breach torn through a wall of snow, tracks driving straight through it |
| `blizzard.webp` | A whiteout, dense driving snow, a faint silhouette barely visible within |
| `sang-froid.webp` | A lone figure standing perfectly still as the storm rages around them |
| `nuit-polaire.webp` | Total polar night, a black sun eclipse over an ice field, violent wind |

### 🌌 Aurore Boréale — économie

| Fichier | Sujet à demander |
|---|---|
| `etincelle.webp` | A single spark of cold light suspended above snow, tiny and precise |
| `etoile-polaire.webp` | The pole star burning bright above a frozen horizon, clear night |
| `pluie-de-flocons.webp` | Thousands of snowflakes falling lit from below, like slow rain of light |
| `manne.webp` | Light pouring from a rift in the aurora onto the snow, abundant and warm |
| `mecene.webp` | An ornate ice-carved chest open on a frozen shore, glowing from inside |
| `aurore-boreale.webp` | An overwhelming aurora filling the whole sky, the landscape lit by it |

### 🎁 Solstice — interaction

| Fichier | Sujet à demander |
|---|---|
| `boule-de-neige.webp` | A snowball rolling downhill, gathering mass, trail carved behind it |
| `givre-mordant.webp` | Frost creeping fast across a dark surface, sharp needle crystals |
| `contre-courant.webp` | Two opposing gusts of snow colliding head-on, one cancelling the other |
| `traineau-perce.webp` | A wrecked wooden sled abandoned in deep snow, runner snapped |
| `tempete-de-verglas.webp` | An ice storm, everything glazed and cracking, branches breaking |
| `grand-froid.webp` | A merciless deep freeze, a lone figure lost in a white void |

---

## Les sachets de booster

**Ici la règle des cartes s'inverse : la planche est composée entière**, sertissages et
filet compris. Ce n'est pas une incohérence, c'est la même logique appliquée à un objet
différent.

Une carte est un gabarit répété 24 fois : son cadre doit être en code pour rester
rigoureusement identique, sinon la planche de collection part en morceaux. Un sachet
n'existe qu'en **quatre** exemplaires, jamais côte à côte, et son décor est solidaire de
sa découpe — le sceau de rareté se pose dans un creux de l'illustration, le filet suit le
bord du film. Découper ça en deux couches coûterait plus que ça ne rapporte.

Le code ne construit **aucune géométrie**. Il ne fait que :

- présenter la planche sur un plan qu'on peut orienter à la souris, avec de l'inertie ;
- poser un verso en mylar brossé, comme un vrai sachet dont seul le recto est imprimé ;
- faire glisser un reflet discret pendant la rotation — c'est la seule chose qu'une
  image fixe ne peut pas faire toute seule ;
- porter l'ombre au sol.

Une version antérieure montait six faces en CSS 3D et plaquait l'illustration sur la
face avant. Ça se lisait pour ce que c'était : un bloc à épaisseur constante, avec une
arête vive au sommet et une image collée dessus. Un vrai sachet n'a pas d'arête en
haut — il y est soudé à plat. **Ne réintroduis pas de boîte** : le bombement, les plis
et les sertissages appartiennent à la planche, où ils rendent bien mieux que des
dégradés CSS.

Tant qu'aucune planche n'est fournie, un sachet dessiné prend le relais — aurore, massif
enneigé, lac, refuge éclairé, avec ses propres soudures, son cadre ciselé et ses textes.
Il tient la route et permet de livrer les quatre sachets au fil de l'eau, mais un SVG
écrit à la main n'atteindra jamais une illustration peinte. Compare `givre` aux trois
autres, l'écart est net.

### Gabarit

| | |
|---|---|
| Format | **vertical, ratio 1:1,774** — celui d'un booster du commerce (67 × 117 mm) |
| Résolution | 760 × 1348 |
| Livraison | JPEG qualité 90 ou WebP 84, moins de 250 Ko |
| Nom du fichier | l'identifiant du booster : `givre`, `blizzard`, `aurore`, `solstice` |
| Emplacement | `public/boosters/` |

Puis `npm run cartes` pour rafraîchir l'index.

**Cadrage — c'est le point qui compte le plus.** Le fichier ne doit contenir **que le
sachet**, détouré, bord à bord : sertissage haut sur la toute première ligne de pixels,
sertissage bas sur la dernière, et rien sur les côtés. Le fichier est affiché tel quel,
étiré au cadre : tout fond laissé autour s'imprimerait sur le sachet, et toute marge le
ferait paraître plus petit qu'il ne devrait.

Un générateur pose presque toujours le sachet sur un fond blanc. Recadre-le au plus
juste **à l'intérieur** de sa ligne la plus étroite — sur la planche `givre`, les
sertissages étaient 9 px plus étroits que le corps, et s'arrêter au corps laissait un
liseré blanc visible en haut et en bas.

Next convertit et redimensionne à la volée : un JPEG propre suffit, il sera servi en
WebP.

### Le prompt

```
A complete vertical trading card booster pack, product shot, ratio 1:1.75,
filling the entire frame edge to edge with no background and no margin.

Glossy silver mylar foil packaging. A finely serrated crimped seal runs across
the very top and the very bottom of the pack, bright metallic, horizontally
ribbed. Between them, a full-bleed painted illustration framed by a thin white
keyline.

The illustration: <SUJET>

Bottom right of the illustration, a small round embossed gold foil seal
reading <RARETE>.

Painted digital art, cold desaturated winter palette, cinematic, high detail.
No other text anywhere on the pack.
```

### La variante par booster

Garde la structure, change le sujet et le sceau — c'est ce qui distingue les quatre
sachets tout en gardant la gamme cohérente :

| Booster | Sujet | Sceau |
|---|---|---|
| `givre` | ✅ **fait** — un tireur d'élite en tenue de camouflage neige, à plat ventre dans la poudreuse, sa section avançant derrière lui dans la tempête | `COMMON` |
| `blizzard` | une escouade progressant contre un vent de face, la neige rayant l'image à l'horizontale, silhouettes à peine lisibles | `RARE` |
| `aurore` | une aurore boréale verte et violette au-dessus d'un lac gelé, un observateur seul de dos sur la rive | `SUPER RARE` |
| `solstice` | un opérateur au sommet d'une crête au soleil rasant, l'ombre longue, la lumière dorée sur les névés | `ULTRA RARE` |

Le sujet de `givre` est là comme étalon : c'est la planche de référence, les trois autres
doivent tenir à côté d'elle — même palette froide, même niveau de détail, même traitement
du sertissage.

---

## Ce que les autres outils apportent — et où ils s'arrêtent

**Générateurs d'images (Gemini, Midjourney, Firefly).** C'est l'outil qu'il te faut, et
le seul indispensable. Génère 4 variantes par carte, garde la meilleure, et **compare-les
toutes ensemble avant de valider** — une image qui semble superbe seule peut trancher
avec les 23 autres.

**Générateurs 3D (Kling, Meshy, Tripo).** Inutiles ici. Le maillage qu'ils produisent est
trop désordonné pour un rendu propre, et de toute façon le sachet est une boîte : sa
géométrie est déjà écrite dans `components/BoosterPack3D.tsx`, avec ses six vraies faces.
Ce dont tu as besoin, c'est une **illustration plate** au gabarit ci-dessus — le volume,
les plis et les sertissages sont déjà là.

**Générateurs vidéo (Seedance, Kling vidéo).** Excellents pour un **trailer de saison ou
un habillage de stream**, à garder hors du site. En revanche, ne les utilise pas pour
l'ouverture de booster : une vidéo est toujours la même, alors que l'ouverture doit
montrer *les cartes réellement tirées*. C'est pour ça qu'elle est animée en temps réel.

---

## Ce que le cadre fait déjà pour toi

Inutile de le demander au générateur, c'est en place :

- **Le foil.** Chaque rareté a son traitement — vernis satiné, holographique linéaire,
  trame croisée, paillettes cosmiques, or animé. Il réagit à la position du pointeur,
  parce qu'un vrai holographique change de couleur selon l'angle de vue.
- **L'inclinaison.** La carte bascule sous le curseur, avec un reflet qui suit le doigt.
- **Le grain de carton**, qui casse l'aplat numérique.
- **La numérotation** `12/24` en pied de carte, et le sigle de rareté en cartouche.

Le foil passe **sous** les blocs de texte, jamais par-dessus : c'est ce que fait une
vraie carte brillante, où le texte est imprimé sur le vernis. Une version antérieure le
posait au-dessus et la carte devenait illisible.

---

## Faire une planche de contrôle

Le meilleur moyen de juger la cohérence du set :

```bash
npm run dev
```

puis ouvre `/boosters` et regarde le catalogue complet, les 24 vignettes côte à côte.
Si une illustration attire l'œil pour une autre raison que sa rareté, elle est à refaire.
