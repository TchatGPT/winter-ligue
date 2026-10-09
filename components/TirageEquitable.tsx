'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Medaille } from '@/components/EmblemePalier';
import { NAV_ICONS } from '@/components/icons';
import { SnowCap } from '@/components/SnowCap';
import type { PackDefinition } from '@/lib/domain/types';

const rienAEcouter = () => () => {};

/**
 * Le badge « Tirage équitable », sous le nom d'un booster, et la fenêtre qu'il
 * ouvre : trois phrases — rien n'est truqué, le tirage est enregistré avant
 * l'animation, et ce que la chance y change.
 *
 * Ce n'est pas un tirage « provably fair » au sens des sites de caisses — une
 * graine publiée que chacun recalcule — et la fenêtre ne le prétend pas : elle
 * dit ce qui est vrai. Le tirage se fait sur le serveur
 * (`lib/domain/rng.ts`, `crypto.randomInt`), aux taux affichés, avant
 * l'animation ; personne ne choisit ; chaque ouverture est au journal ; et les
 * tests mesurent le tirage réel (`tests/tirage.test.ts`).
 */
export function TirageEquitable({ pack }: { pack: PackDefinition }) {
  const [ouvert, setOuvert] = useState(false);
  const Bouclier = NAV_ICONS.shield;
  return (
    <>
      <button type="button" className="equitable-badge" onClick={() => setOuvert(true)}>
        <Bouclier className="equitable-badge-icone" />
        Tirage équitable
        <span aria-hidden="true">›</span>
      </button>
      {ouvert && <FenetreEquitable pack={pack} onClose={() => setOuvert(false)} />}
    </>
  );
}

function FenetreEquitable({ pack, onClose }: { pack: PackDefinition; onClose: () => void }) {
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
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
  if (!navigateur) return null;

  const pourUnJoueur = pack.portee === 'JOUEUR';
  const Bouclier = NAV_ICONS.shield;

  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-label="Tirage équitable" onClick={onClose}>
      <div className="fenetre-carte equitable glass glass-reflet relative" onClick={(e) => e.stopPropagation()}>
        <SnowCap radius="var(--r-lg)" seed="tirage-equitable" epaisseur={14} />
        <button type="button" className="btn btn-sm absolute top-4 right-4 z-10" onClick={onClose} aria-label="Fermer">
          ✕
        </button>

        <div className="equitable-corps">
          <header className="equitable-tete">
            <Medaille teinte="var(--aurora)" id="equitable" className="equitable-medaille">
              <Bouclier className="medaille-icone" />
            </Medaille>
            <div>
              <p className="eyebrow">{pack.name}</p>
              <h2 className="equitable-titre">Tirage équitable</h2>
            </div>
          </header>

          <ul className="equitable-points">
            <li>
              <b>Rien n’est truqué.</b> La carte est tirée au hasard par le serveur. Personne ne la choisit, ni Lriaa ni
              la modération.
            </li>
            <li>
              <b>Enregistré avant l’animation.</b> Le tirage est stocké dès l’ouverture : l’animation ne fait que le
              montrer.
            </li>
            <li>
              {pourUnJoueur ? (
                <>
                  <b>Ton multiplicateur de chance</b> augmente tes chances d’avoir une carte rare.
                </>
              ) : (
                <>
                  <b>La chance ne compte pas sur ce booster.</b> Tout le monde a les mêmes chances, quel que soit son
                  multiplicateur.
                </>
              )}
            </li>
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
