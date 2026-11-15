# Prompts — les illustrations du Booster Commu

Les quinze cartes du Booster Commu portent des noms de phénomènes d'hiver (14/11/2026) :
pas d'objets, des scènes. Chaque prompt se colle tel quel dans le générateur : le style,
le cadrage et l'accent de rareté y sont déjà.

## Déjà en ligne

Pluie Blanche, Premières Neiges, Vents Croisés, Tonnerre de Neige, Fonte des Neiges,
Réveil du Glacier, Halo Solaire, Inversion Polaire, Valse Boréale, Brouillard Givrant,
Mirage Polaire, Soleil Jumeau, Aurore Triomphale et Spectre des Neiges ont leur illustration (15/11/2026) : leurs prompts sont
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
Legendary fantasy card illustration, epic cinematic realism, ultra detailed, explosive, jaw-dropping. A whole mountain range in the background has turned into a tsunami: the snowy peaks rear up, bend forward and break like a colossal wave of rock, glacier ice and snow, kilometres high, violently overflowing onto a second mountain range in the foreground and flooding the valley between them. The wave of mountains crashes over the front peaks and buries them, its crest exploding into towering plumes of snow and ice, huge chunks of glacier and boulders flung through the air, an avalanche of ice pouring down into the valley, everything it touches freezing instantly into jagged blue ice, frost and cracks racing across the valley floor. The setting sun bursts through the spray behind the crest and lights it in molten gold. Violent, overwhelming, unforgettable, nothing calm, the mountain tsunami crashing over the other range as the clear focal point. Deep blue, glacier turquoise and white palette with a dominant golden accent. Portrait composition. No people, no text, no letters, no logo, no border, no frame, no UI.
```


