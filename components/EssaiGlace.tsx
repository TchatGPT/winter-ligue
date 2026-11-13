'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { IconTwitch } from '@/components/icons';
import { RARITY_META, cartesDuPack } from '@/lib/domain/catalog';
import type { CardDefinition, Rarity } from '@/lib/domain/types';

/**
 * Le prototype du booster pris dans la glace (13/11/2026), sur une page
 * d'essai cachée : rien n'y mène depuis le site.
 *
 * La glace est rendue dans Blender (Cycles) : un vrai bloc qui réfracte, du
 * givre, des bulles et des plans de fracture, des grains de givre qui
 * dérivent autour. Deux vidéos au même cadrage, avec transparence (WebM VP9) :
 *  - la boucle, le bloc intact qui scintille ;
 *  - l'éclat, deux coups qui fendent la glace, puis les morceaux — découpés
 *    dans le bloc — qui partent et retombent.
 * La boucle tourne ; un clic lance l'éclat par-dessus, au même endroit. Quand
 * les morceaux sont partis, trois cartes du booster jaillissent et se
 * retournent : un aperçu, pas tout le contenu.
 */

const ORDRE: Rarity[] = ['L', 'UR', 'R', 'C'];

/** Trois cartes du booster, une par rareté, la plus rare au centre. */
function apercu(): CardDefinition[] {
  const cartes = cartesDuPack('perso');
  const choisies: CardDefinition[] = [];
  for (const r of ORDRE) {
    const de = cartes.filter((c) => c.rarity === r);
    if (de.length && choisies.length < 3) choisies.push(de[Math.floor(Math.random() * de.length)]);
  }
  return [choisies[1], choisies[0], choisies[2]].filter(Boolean);
}

type Phase = 'glace' | 'eclat' | 'cartes';

export function EssaiGlace({ entree }: { entree: string }) {
  const [phase, setPhase] = useState<Phase>('glace');
  const [cartes, setCartes] = useState<CardDefinition[]>([]);
  const eclat = useRef<HTMLVideoElement>(null);
  const boucle = useRef<HTMLVideoElement>(null);

  // Les cartes jaillissent quand les morceaux sont partis, avant la fin de la vidéo.
  useEffect(() => {
    const v = eclat.current;
    if (!v || phase !== 'eclat') return;
    const suit = () => {
      if (v.currentTime >= 1.45) setPhase('cartes');
    };
    v.addEventListener('timeupdate', suit);
    v.addEventListener('ended', () => setPhase('cartes'), { once: true });
    return () => v.removeEventListener('timeupdate', suit);
  }, [phase]);

  const brise = () => {
    if (phase !== 'glace') return;
    setCartes(apercu());
    const v = eclat.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play();
    setPhase('eclat');
  };

  const rejoue = () => {
    const v = eclat.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    void boucle.current?.play();
    setPhase('glace');
  };

  return (
    <div className="essai" data-phase={phase}>
      <p className="essai-sur">Prototype · Booster Perso</p>
      <div className="essai-scene">
        <button type="button" className="essai-bloc" onClick={brise} aria-label="Briser la glace du Booster Perso">
          <video
            ref={boucle}
            className="essai-video essai-boucle"
            src="/glace/perso-boucle.webm"
            poster="/glace/perso-fixe.webp"
            autoPlay
            loop
            muted
            playsInline
          />
          <video
            ref={eclat}
            className="essai-video essai-eclat"
            src="/glace/perso-eclat.webm"
            preload="auto"
            muted
            playsInline
          />
        </button>

        <ul className="essai-cartes" aria-label="Trois cartes du Booster Perso">
          {cartes.map((c, i) => (
            <li key={c.id} style={{ ['--o' as string]: i - 1, ['--i' as string]: i } as CSSProperties}>
              <span className="essai-carte">
                <span className="essai-carte-dos" aria-hidden="true" />
                <span className="essai-carte-face">
                  <CardFrame
                    cardId={c.id}
                    name={c.name}
                    rarity={c.rarity}
                    glyph={c.glyph}
                    nature={c.nature}
                    largeur="(min-width: 640px) 260px, 140px"
                  />
                  <span className="essai-carte-reflet" aria-hidden="true" />
                </span>
              </span>
              <span
                className="essai-rarete"
                style={{ ['--r' as string]: `var(--r-${c.rarity.toLowerCase()})` } as CSSProperties}
              >
                {RARITY_META[c.rarity].label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="essai-indice">{phase === 'glace' ? 'Clique sur le bloc pour briser la glace' : ' '}</p>
      <div className="essai-fin">
        <a href={entree} className="btn btn-twitch no-underline">
          <IconTwitch className="h-5 w-5" />
          Rejoindre avec Twitch
        </a>
        <button type="button" className="btn" onClick={rejoue}>
          Refaire geler
        </button>
      </div>
    </div>
  );
}
