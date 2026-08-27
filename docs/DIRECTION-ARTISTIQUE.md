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

### ❄ Glace Éternelle — défense, verrouillage

| Fichier | Sujet à demander |
|---|---|
| `flocon-protecteur.webp` | A single oversized snowflake crystal floating, catching light like cut glass |
| `bouclier-givre.webp` | A translucent shield of thick frost, cracks glowing faintly from within |
| `gel-eternel.webp` | A soldier's silhouette frozen mid-stride inside a block of clear blue ice |
| `banquise.webp` | A vast fractured ice floe under a low sun, deep crevasse in the foreground |
| `rempart-polaire.webp` | A towering wall of glacial ice, battlements carved by wind, storm behind |
| `hiver-sans-fin.webp` | A whole valley entombed in ice, everything frozen still, endless white |

### 🌪 Tempête — multiplicateurs

| Fichier | Sujet à demander |
|---|---|
| `brise-glacee.webp` | Loose snow lifting off a ridge in a gentle gust, delicate spindrift |
| `vent-du-nord.webp` | A hard crosswind bending a line of frozen pines, snow streaking sideways |
| `blizzard.webp` | A whiteout, dense driving snow, a faint silhouette barely visible within |
| `oeil-du-cyclone.webp` | The calm eye of a polar storm seen from inside, wall of cloud all around |
| `tempete-blanche.webp` | A catastrophic snow squall tearing across a plain, debris in the air |
| `nuit-polaire.webp` | Total polar night, a black sun eclipse over an ice field, violent wind |

### 🌌 Aurore Boréale — points et flocons

| Fichier | Sujet à demander |
|---|---|
| `etincelle.webp` | A single spark of cold light suspended above snow, tiny and precise |
| `etoile-polaire.webp` | The pole star burning bright above a frozen horizon, clear night |
| `pluie-de-flocons.webp` | Thousands of snowflakes falling lit from below, like slow rain of light |
| `couronne-polaire.webp` | A crown of ice crystals hovering, refracting an aurora behind it |
| `voile-daurore.webp` | Sweeping curtains of aurora over a glacier, reflected on the ice |
| `aurore-boreale.webp` | An overwhelming aurora filling the whole sky, the landscape lit by it |

### 🎁 Solstice — chaos et malus

| Fichier | Sujet à demander |
|---|---|
| `boule-de-neige.webp` | A snowball rolling downhill, gathering mass, trail carved behind it |
| `givre-mordant.webp` | Frost creeping fast across a dark surface, sharp needle crystals |
| `traineau-perce.webp` | A wrecked wooden sled abandoned in deep snow, runner snapped |
| `vol-de-traineau.webp` | A sled speeding away through a night forest, cargo spilling behind |
| `tempete-de-verglas.webp` | An ice storm, everything glazed and cracking, branches breaking |
| `grand-froid.webp` | A merciless deep freeze, a lone figure lost in a white void |

---

## Ce que les autres outils apportent — et où ils s'arrêtent

**Générateurs d'images (Gemini, Midjourney, Firefly).** C'est l'outil qu'il te faut, et
le seul indispensable. Génère 4 variantes par carte, garde la meilleure, et **compare-les
toutes ensemble avant de valider** — une image qui semble superbe seule peut trancher
avec les 23 autres.

**Générateurs 3D (Kling, Meshy, Tripo).** Inutiles ici. Le maillage qu'ils produisent est
trop désordonné pour un rendu propre, et de toute façon le sachet est une boîte : sa
géométrie est déjà écrite dans `components/BoosterPack3D.tsx`, avec ses six vraies faces.
Si un jour tu veux habiller le sachet, ce dont tu as besoin est une **texture**, pas un
modèle — génère une image verticale 5:7,4 et on la posera sur les faces.

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
