# Prompts — les illustrations du Booster Commu

Les quinze cartes du Booster Commu portent des noms de phénomènes d'hiver (14/11/2026) :
pas d'objets, des scènes. Chaque prompt se colle tel quel dans le générateur : le style,
le cadrage et l'accent de rareté y sont déjà.

## Déjà en ligne

Pluie Blanche, Premières Neiges, Vents Croisés, Tonnerre de Neige, Fonte des Neiges,
Réveil du Glacier, Halo Solaire, Inversion Polaire, Valse Boréale, Brouillard Givrant,
Mirage Polaire, Soleil Jumeau et Aurore Triomphale ont leur illustration (15/11/2026) : leurs prompts sont
retirés d'ici.
Les images arrivent en 1536 × 2720 ; elles sont recadrées en 1000 × 1189, au centre sauf si le sujet touche le haut
(Inversion Polaire : son sommet).

## Gabarit

| | |
|---|---|
| Format | **portrait 5:6**, comme les cartes du Booster Perso |
| Livraison | **1000 × 1189**, WebP |
| Nom du fichier | l'identifiant de la carte (après le titre), dans `public/cartes/` |
| Ensuite | `npm run cartes` (index et vignettes), puis commiter l'image et ses vignettes |

Le sujet tient dans les 80 % centraux : les bords sont mangés par le cadre.

Le style est celui des cartes du Booster Perso : une **peinture de jeu de cartes**, illustrée et colorée,
jamais une photo. Chaque prompt commence par la même phrase de style : ne pas la retirer.

## L'accent par rareté

Le même que pour le Booster Perso, calé sur la couleur du cadre :

| Rareté | Lumière |
|---|---|
| Commune | lumière naturelle d'hiver, bleu-gris, aucune magie |
| Rare | paillettes et lueur **violet lavande** |
| Ultra rare | lueur **ambre orangée**, braises, plus de drame |
| Légendaire | **or**, rayons de lumière, aurore boréale, épique |

---

## Légendaires

### Glaciation — `trois-glacons.webp`
*3 joueurs figent leur meilleure game*

```
Stylized digital painting for a fantasy trading card game, illustrated, not photographic, vibrant colours, soft painterly shading, clean readable shapes, epic cinematic winter landscape key art. An ice age descending on the world: a colossal wall of glacier advancing across the land, three blazing golden lights captured and preserved forever inside its clear ice, radiant golden light shafts piercing the frozen sky, golden sparks suspended in the air, a vivid green aurora borealis overhead. Deep blue palette with a dominant golden accent. One clear focal point in the centre, shallow depth of field, generous space around the edges. Portrait 5:6 composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```

### Spectre des Neiges — `voleur-d-hiver.webp`
*Vol de score*

```
Stylized digital painting for a fantasy trading card game, illustrated, not photographic, vibrant colours, soft painterly shading, clean readable shapes, epic cinematic winter landscape key art. A ghostly hooded spectre made of swirling snow and blizzard rising above a frozen summit at night, its translucent hand tearing a blazing golden light out of the mountain top and carrying it away, a trail of golden sparks behind it, a vivid aurora borealis in the sky, radiant golden light shafts. Deep blue palette with a dominant golden accent. One clear focal point in the centre, dynamic, mysterious rather than horror, shallow depth of field, generous space around the edges. Portrait 5:6 composition. No text, no letters, no logo, no border, no frame, no UI.
```
