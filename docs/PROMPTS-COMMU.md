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

Ces deux-là sont les plus belles du Commu : réalisme cinématique, échelle immense, accent doré.

### Glaciation — `trois-glacons.webp`
*3 joueurs figent leur meilleure game*

```
Legendary fantasy card illustration, epic cinematic realism, ultra detailed, breathtaking scale. The ice age arriving: an immense glacier several kilometres high pours over the highest mountain range on Earth like a frozen tsunami, a colossal wall of blue ice and snow rolling forward and swallowing the Himalayan peaks one by one. In the centre, a giant Everest-like summit is being engulfed, the ice wave crashing over its shoulders, its top still standing for a last instant. Clouds of frozen spray and ice dust exploding into the sky, frost racing across the valleys below. A low golden sun on the horizon, its rays piercing through the ice spray and lighting the crest of the glacier in molten gold. Aerial view, the whole world freezing. Deep blue, icy cyan and white palette with a dominant golden accent. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```

### Spectre des Neiges — `voleur-d-hiver.webp`
*Vol de score*

```
Legendary fantasy card illustration, epic cinematic realism, ultra detailed, explosive action, breathtaking scale. A colossal stone giant made of dark cracked rock, frost and snow, with thin glowing golden lava cracks running across its body and two small fierce golden eyes, rises behind a huge snowy Everest-like mountain and crushes its summit with one massive hand. The peak shatters under its grip: the whole top of the mountain explodes into a gigantic avalanche, huge blocks of rock and ice flying through the air, a roaring wave of snow pouring down every slope, billowing clouds of powder snow exploding outward at the base of the mountain, deep glowing golden fissures splitting the mountain from the summit down to its foot, golden sparks and ice shards bursting from the impact. The whole scene is in violent motion, nothing calm. Starry night sky with a vivid green aurora, dramatic rim light on the giant. Low angle, epic composition. Deep blue, icy white and dark grey palette with a strong golden accent. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```
