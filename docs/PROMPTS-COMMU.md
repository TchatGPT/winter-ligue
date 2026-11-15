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

Ces deux-là suivent le style du Pacte du Givre (Booster Perso) : glace taillée transparente,
veines dorées comme de la lave, aurore et ciel étoilé.

### Glaciation — `trois-glacons.webp`
*3 joueurs figent leur meilleure game*

```
Legendary fantasy card illustration, cinematic, ultra detailed, polished 3D render look, crystal-clear ice. A whole snowy mountain peak, like Everest, trapped and frozen in time inside a colossal block of faceted transparent ice, the mountain perfectly visible through the clear crystal, the ice block standing on a frozen plain, its facets sharp and glittering, thick frost and snow crusting its top edges, long icicles hanging from it. Bright golden glowing veins like molten gold running through the cracks of the ice and around the trapped mountain, warm golden light glowing from inside the block. Starry night sky with a vivid green and violet aurora borealis behind it. The frozen mountain in its block of ice as the single clear focal point, majestic and breathtaking. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```

### Spectre des Neiges — `voleur-d-hiver.webp`
*Vol de score*

```
Legendary fantasy card illustration, cinematic, ultra detailed, polished 3D render look, crystal-clear ice. A giant ghost made entirely of faceted transparent ice, a hooded spectre with no face, only two glowing golden eyes in the dark of its icy hood, bright golden veins like molten lava glowing through the cracks of its crystal body, frost and snow crusting its shoulders, icicles dripping from its arms. It wraps its icy body around a snowy mountain peak as if hugging it, one huge crystal ice hand pressed down on the summit and crushing it, the top of the mountain cracking and breaking apart, chunks of rock, snow and ice tumbling down the slopes. The ghost is only a little taller than the mountain. Starry night sky with a vivid green and violet aurora borealis. Majestic, powerful, mysterious, not horror. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```
