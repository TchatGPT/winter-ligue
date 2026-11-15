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
Stylized digital painting for a fantasy trading card game, illustrated, not photographic, hand-painted look, bold clean shapes, vibrant colours, strong contrast, legendary card art. The world freezing solid in a single instant: a colossal wave of ice frozen at the very moment it crashes over a mountain range, towering jagged spires of crystal-clear blue ice bursting out of the ground in every direction, frost spreading across the whole scene like shattered glass, three blazing golden lights locked forever inside the heart of the ice. Radiant golden light shafts exploding from the centre, golden sparks and ice shards suspended in mid-air, a vivid green and gold aurora roaring across the sky. Overwhelming, breathtaking, ultra frozen, epic scale, the frozen wave and its golden heart as the clear focal point. Deep blue and icy cyan palette with a dominant golden accent. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```

### Spectre des Neiges — `voleur-d-hiver.webp`
*Vol de score*

```
Stylized digital painting for a fantasy trading card game, illustrated, not photographic, hand-painted look, bold clean shapes, vibrant colours, strong contrast, legendary card art. A huge ghost made entirely of ice, frozen vapour and drifting mist, its translucent hooded body of frost and fog coiling like a serpent around a lone snowy mountain peak from base to summit, its long icy arms and trailing wisps wrapping the mountain, its glowing eyes cold and mysterious, a blazing golden light clutched in its misty hand as it steals it from the summit, golden sparks scattering in its wake. Night sky with soft aurora, radiant golden light shafts. Mysterious and majestic, not horror, the ghost spiralling around the mountain as the clear focal point. Deep blue and icy white palette with a dominant golden accent. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```
