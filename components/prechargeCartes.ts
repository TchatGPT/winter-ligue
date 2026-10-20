import { cardArt, cardVignettes } from '@/lib/domain/catalog';

/**
 * Les illustrations des cartes, chargées et décodées avant qu'on en ait besoin.
 *
 * Le rail d'un booster affiche toutes les cartes du pack d'un coup, au moment
 * où il démarre. Sans préchargement, le navigateur les téléchargeait et les
 * décodait à cet instant précis : des cases vides qui se remplissaient en pleine
 * course, et un démarrage haché sur téléphone. Ici, elles sont prêtes avant le
 * premier clic, à la taille où le rail les montre (même `srcset`, même `sizes` :
 * le navigateur choisit la même image, et la retrouve en mémoire).
 *
 * La carte tirée, elle, se révèle en grand après le rail : son illustration
 * entière se charge dès que le serveur l'a tirée, pendant que le rail tourne.
 */

/** Les images demandées, gardées en vie : sans référence, leur décodage pourrait être jeté. */
const gardees = new Map<string, HTMLImageElement>();

function charge(cle: string, regle: (img: HTMLImageElement) => void): void {
  if (gardees.has(cle) || typeof Image === 'undefined') return;
  const img = new Image();
  img.decoding = 'async';
  regle(img);
  gardees.set(cle, img);
  // Décodée d'avance : le rail n'a plus qu'à la poser.
  img.decode().catch(() => undefined);
}

/** Quand le navigateur a le temps : jamais au détriment de la page qui s'affiche. */
function auCalme(f: () => void): void {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(f, { timeout: 2500 });
  else setTimeout(f, 1200);
}

/** Les illustrations des cartes d'un rail, à la largeur où il les affiche (`sizes`). */
export function prechargeRail(cardIds: readonly string[], largeur: string): void {
  auCalme(() => {
    for (const id of new Set(cardIds)) {
      const art = cardArt(id);
      if (!art) continue;
      const vignettes = cardVignettes(id);
      charge(`rail:${id}:${largeur}`, (img) => {
        if (vignettes) {
          img.sizes = largeur;
          img.srcset = vignettes.srcset;
        }
        img.src = vignettes ? vignettes.moyenne : art;
      });
    }
  });
}

/** L'illustration entière d'une carte : celle de la révélation, qui suit le rail. */
export function prechargeGrande(cardId: string): void {
  const art = cardArt(cardId);
  if (art) charge(`grande:${cardId}`, (img) => (img.src = art));
}
