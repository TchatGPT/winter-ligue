'use client';

import { useEffect, useRef, useState } from 'react';
import { aUneIllustration, CardArt } from '@/components/CardArt';
import { RarityIcon } from '@/components/RarityIcon';
import { bruitDeCran } from '@/components/bruitage';
import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

export interface CarteTirage {
  cardId: string;
  name: string;
  rarity: string;
  glyph: string;
}

/** Largeur d'une carte du rail, gouttière comprise. */
const PAS = 132;

/** Combien de cartes défilent avant la gagnante. */
const AVANT = 54;

/** Combien restent après elle, pour que le rail ne s'arrête pas sur le vide. */
const APRES = 8;

/** Durée du défilement, en millisecondes. */
const DUREE = 5200;
const DUREE_REDUITE = 1400;

/**
 * L'amortissement.
 *
 * Une puissance cinquième : le rail part très vite et rampe longtemps sur la
 * fin. C'est ce profil qui fait le suspense — avec un amortissement doux, on
 * devine la carte gagnante trois secondes avant l'arrêt, et il ne se passe plus
 * rien.
 */
const amorti = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * Le carrousel de tirage.
 *
 * Un rail de cartes défile vers la gauche, ralentit, et s'arrête sur la carte
 * gagnante sous un repère fixe. C'est la mise en scène des sites d'ouverture de
 * caisses, et elle marche pour une raison précise : le résultat est déjà connu
 * du serveur, mais le **rythme** de sa révélation est rendu au joueur.
 *
 * Rien n'est tiré ici. La carte gagnante arrive en propriété, décidée par le
 * serveur au moment de l'achat ; le rail ne fait que la mettre en scène. Les
 * cartes qui défilent autour sont des leurres pris dans le catalogue, et elles
 * n'ont aucune existence dans la partie.
 *
 * ## Le défilement est piloté en JavaScript, pas en CSS
 *
 * Ce n'est pas un caprice. Il faut connaître, à chaque image, quelle carte passe
 * sous le repère — pour émettre le cran sonore. Une animation CSS ne le dit pas :
 * il faudrait relire la matrice de transformation à chaque image, ce qui force
 * un recalcul de style. En intégrant l'amortissement nous-mêmes, la position est
 * connue exactement, et le cran tombe au bon moment.
 */
export function Tirage({
  cartes,
  gagnante,
  onFini,
}: {
  /** Le catalogue, pour peupler le rail de leurres. */
  cartes: CarteTirage[];
  gagnante: CarteTirage;
  onFini: () => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLDivElement>(null);

  // Le rappel vit dans une ref tenue à jour par un effet : le défilement dure
  // cinq secondes et ne doit pas être relancé parce que le parent s'est rendu
  // à nouveau entre-temps.
  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  /*
   * Le rail, construit une seule fois.
   *
   * Un état à initialisation paresseuse plutôt qu'une ref remplie au rendu :
   * les leurres sont tirés au hasard, et les recalculer à chaque rendu ferait
   * sauter la bande en plein défilement.
   */
  const [bande] = useState<CarteTirage[]>(() => {
    const pioche = cartes.length ? cartes : [gagnante];
    const items: CarteTirage[] = [];
    for (let i = 0; i < AVANT + 1 + APRES; i += 1) {
      items.push(pioche[Math.floor(Math.random() * pioche.length)]);
    }
    items[AVANT] = gagnante;
    return items;
  });

  useEffect(() => {
    const el = rail.current;
    const boite = cadre.current;
    if (!el || !boite) return;

    const reduit =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duree = reduit ? DUREE_REDUITE : DUREE;

    /*
     * L'arrivée est décalée dans la carte, jamais pile au centre.
     *
     * Un rail qui s'immobilise exactement sur l'axe se lit comme une grille qui
     * se replace, pas comme un objet lancé qui s'arrête. Le décalage reste dans
     * le tiers central pour que la carte gagnante soit sans ambiguïté celle du
     * repère.
     */
    const dedans = (Math.random() - 0.5) * PAS * 0.34;
    const cible = AVANT * PAS + PAS / 2 - boite.clientWidth / 2 + dedans;

    let debut = 0;
    let dernier = -1;
    let dernierCran = 0;
    let trame = 0;

    const image = (temps: number) => {
      if (!debut) debut = temps;
      const t = Math.min(1, (temps - debut) / duree);
      const x = amorti(t) * cible;
      el.style.transform = `translate3d(${-x.toFixed(1)}px, 0, 0)`;

      // La carte sous le repère, et le cran qui l'accompagne. Il est étranglé à
      // 45 ms : au lancement, les cartes défilent plus vite que ça, et les crans
      // se fondraient en un bourdonnement.
      const index = Math.round((x + boite.clientWidth / 2 - PAS / 2) / PAS);
      if (index !== dernier) {
        dernier = index;
        if (temps - dernierCran > 45) {
          dernierCran = temps;
          bruitDeCran();
        }
      }

      if (t < 1) {
        trame = requestAnimationFrame(image);
        return;
      }
      boite.dataset.arrete = 'true';
      fini.current();
    };

    trame = requestAnimationFrame(image);
    return () => cancelAnimationFrame(trame);
  }, []);

  return (
    <div className="tirage" ref={cadre} data-arrete="false">
      {/* Le repère : c'est lui qui fait la loi, le rail ne fait que passer
          dessous. Il est posé au-dessus des cartes et ne bouge jamais. */}
      <span className="tirage-repere" aria-hidden="true" />

      <div className="tirage-rail" ref={rail}>
        {bande.map((c, i) => {
          const meta = RARITY_META[c.rarity as Rarity] ?? RARITY_META.C;
          return (
            <div
              key={`${c.cardId}-${i}`}
              className="tirage-carte"
              style={{
                ['--r' as string]: meta.color,
                ['--d' as string]: meta.deep,
              }}
              aria-hidden={i !== AVANT}
            >
              {aUneIllustration(c.cardId) ? (
                <CardArt cardId={c.cardId} className="tirage-vecteur" />
              ) : (
                <span className="tirage-glyphe">{c.glyph}</span>
              )}
              <span className="tirage-gemme">
                <RarityIcon rarity={c.rarity} taille={16} />
              </span>
            </div>
          );
        })}
      </div>

      {/* Les deux fondus latéraux : sans eux, les cartes apparaissent et
          disparaissent d'un coup au bord du cadre, et le rail cesse d'avoir
          l'air de continuer au-delà. */}
      <span className="tirage-voile tirage-voile-gauche" aria-hidden="true" />
      <span className="tirage-voile tirage-voile-droite" aria-hidden="true" />
    </div>
  );
}
