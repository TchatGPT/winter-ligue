'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CardFrame } from '@/components/CardFrame';
import { CarteInclinable } from '@/components/CarteInclinable';
import { SnowCap } from '@/components/SnowCap';
import { EmblemeRarete } from '@/components/EmblemeRarete';
import { rarityMeta } from '@/components/ui';
import { memeTexte } from '@/lib/domain/texte';
import type { Rarity } from '@/lib/domain/types';

export interface CarteFiche {
  cardId: string;
  nom: string;
  /** L'intitulé de l'action : « Multiplicateur game », « Joker »… */
  action?: string;
  rarity: string;
  glyph: string;
  description: string;
  /** L'effet en trois mots. */
  resume?: string;
  nature?: 'bonus' | 'malus';
  power?: number;
}

const rienAEcouter = () => () => {};

/**
 * La fiche d'une carte, en grand, par-dessus la page.
 *
 * Rien d'autre que la carte et ce qu'elle fait : pas de défausse, pas
 * d'action. On l'ouvre depuis une vignette — le classement, un
 * profil — pour lire la carte à sa taille, et on la referme d'un clic à côté
 * ou d'Échap.
 *
 * Elle est rendue dans un portail vers `<body>` : le classement porte un
 * `backdrop-filter`, qui fait de lui le bloc de référence d'un élément fixe.
 * Sans le portail, le voile ne couvrait que le classement, et la fiche se
 * centrait dans son cadre au lieu de l'écran.
 */
export function FicheCarte({
  carte,
  legende,
  details = [],
  action,
  aside,
  onClose,
}: {
  carte: CarteFiche;
  /** Une ligne sous la description : « Carte active de Cristal », par exemple. */
  legende?: React.ReactNode;
  /** Des précisions, une par ligne : « Quand → Prochaine game », « Au plus → 25 pts ». */
  details?: { libelle: string; valeur: string }[];
  /** Une action sous la légende : jouer un Verglas, pour la modération. */
  action?: React.ReactNode;
  /**
   * Une liste à côté de la fiche — les déblocages de la carte : sa propre
   * colonne sur un grand écran, qui défile seule ; dessous ailleurs.
   */
  aside?: React.ReactNode;
  onClose: () => void;
}) {
  // `document.body` n'existe pas au rendu serveur.
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );

  // Échap pour fermer, et la page dessous ne défile plus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = precedent;
    };
  }, [onClose]);

  const meta = rarityMeta(carte.rarity);
  if (!navigateur) return null;

  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-label={carte.nom} onClick={onClose}>
      <div
        className={`fenetre-carte fiche-carte glass glass-reflet relative${aside ? ' fiche-carte-large' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SnowCap radius="var(--r-lg)" seed={`fiche-${carte.cardId}`} epaisseur={14} />
        <button
          type="button"
          className="btn btn-sm absolute top-3 right-3 z-10 sm:top-4 sm:right-4"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>

        {/* Sans barre de défilement : la carte qui penche et son halo débordent de
            quelques pixels, et le faisaient apparaître pour rien. Sur un petit
            écran, on fait défiler quand même, au doigt. */}
        <div className="fiche-carte-corps min-h-0 overflow-y-auto px-5 pt-14 pb-6 sm:px-8 sm:pt-9">
          <div className="fiche-carte-grille">
            {/* Sur un téléphone, la carte laisse la place de lire sa description
                sans défiler ; sur un ordinateur, elle prend la hauteur de l'écran. */}
            <div className="fiche-carte-visuel reveal relative shrink-0">
              {meta.holo && (
                <span
                  className="reveal-halo"
                  style={{ ['--r' as string]: meta.color }}
                  aria-hidden="true"
                />
              )}
              {/* La carte se penche sous le pointeur, l'illustration en profondeur. */}
              <CarteInclinable>
                <CardFrame
                  cardId={carte.cardId}
                  name={carte.nom}
                  description={carte.description}
                  rarity={carte.rarity}
                  glyph={carte.glyph}
                  nature={carte.nature}
                />
              </CarteInclinable>
            </div>

            {/* Ce que dit la carte, dans l'ordre où on le cherche : sa rareté, son
                nom, ce qu'elle fait en deux mots, puis en clair, puis quand. */}
            <div className="fiche-infos-cadre">
              <div className="fiche-colonnes">
                <div className="fiche-infos" style={{ ['--r' as string]: meta.color }}>
                  <span className="fiche-rarete">
                    <EmblemeRarete rarity={meta.code as Rarity} className="fiche-rarete-gemme" />
                    {meta.label}
                  </span>
                  <h2 className="fiche-nom">{carte.nom}</h2>
                  {carte.action && <p className="fiche-action">{carte.action}</p>}
                  <p className="fiche-desc">{carte.description}</p>
                  {(details.length > 0 || (carte.resume && !memeTexte(carte.resume, carte.action))) && (
                    <dl className="fiche-details">
                      {details.map((d) => (
                        <div key={d.libelle}>
                          <dt>{d.libelle}</dt>
                          <dd>{d.valeur}</dd>
                        </div>
                      ))}
                      {carte.resume && details.length === 0 && !memeTexte(carte.resume, carte.action) && (
                        <div>
                          <dt>En bref</dt>
                          <dd className="num">{carte.resume}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {legende && <p className="fiche-legende">{legende}</p>}
                  {action && <div className="fiche-action-zone">{action}</div>}
                </div>
                {aside && <div className="fiche-aside">{aside}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
