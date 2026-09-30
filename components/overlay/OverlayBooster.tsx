'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CardFrame } from '@/components/CardFrame';
import { RailPack, type CarteRailPack } from '@/components/RailPack';
import { Scene } from '@/components/overlay/Scene';
import { boosterDemo } from '@/components/overlay/demo';
import { useFluxOverlay } from '@/components/overlay/useFluxOverlay';
import { CARDS, RARITY_META } from '@/lib/domain/catalog';
import type { BoosterOverlay } from '@/lib/services/overlay';
import { COURBE_MESUREE } from '@/lib/spin/courbe';

/**
 * L'overlay des boosters : ce que le stream voit quand la streameuse en ouvre
 * un.
 *
 * Le booster surgit en trois dimensions, avec pour qui il s'ouvre ; il se
 * charge, éclate, et le rail du site se lance — le même, avec les mêmes
 * cartes. Il s'arrête sur la carte tirée par le serveur, qui reste à l'écran
 * quelques secondes, grande, avec son nom, son effet et sur qui elle tombe.
 *
 * Deux ouvertures rapprochées se jouent l'une après l'autre, jamais l'une
 * sur l'autre : la file est le seul état, et sa tête est ce qui se joue.
 */

type Phase = 'surgit' | 'charge' | 'eclate' | 'rail' | 'carte' | 'sort';

const DUREES: Record<Exclude<Phase, 'rail'>, number> = {
  surgit: 1400,
  charge: 1300,
  eclate: 550,
  carte: 7000,
  sort: 900,
};

const SUITE: Record<Exclude<Phase, 'rail'>, Phase | null> = {
  surgit: 'charge',
  charge: 'eclate',
  eclate: 'rail',
  carte: 'sort',
  sort: null,
};

/** Les éclats de neige de l'apparition : un angle, une portée, un retard. */
const ECLATS = Array.from({ length: 16 }, (_, i) => ({
  angle: (360 / 16) * i + (i % 2 ? 9 : -6),
  portee: 190 + ((i * 53) % 120),
  retard: (i % 4) * 40,
  taille: 6 + ((i * 7) % 7),
}));

export function OverlayBooster({
  cle,
  depart,
  demo = false,
  son = false,
}: {
  cle: string;
  depart: string;
  demo?: boolean;
  son?: boolean;
}) {
  const [file, setFile] = useState<BoosterOverlay[]>(() => (demo ? [boosterDemo(0)] : []));

  const surFlux = useCallback((_: unknown, nouveaux: { boosters: BoosterOverlay[] }) => {
    if (nouveaux.boosters.length) setFile((f) => [...f, ...nouveaux.boosters]);
  }, []);
  useFluxOverlay({ cle, depart, intervalle: 2000, actif: !demo, surFlux });

  // L'aperçu : une ouverture inventée dès que la scène se libère.
  useEffect(() => {
    if (!demo) return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      setFile((f) => (f.length ? f : [boosterDemo(n)]));
    }, 4000);
    return () => clearInterval(t);
  }, [demo]);

  const actuel = file[0] ?? null;
  const suivante = useCallback(() => setFile((f) => f.slice(1)), []);

  return (
    <Scene largeur={1920} hauteur={1080}>
      {actuel && <Ouverture key={actuel.id} booster={actuel} son={son} onFini={suivante} />}
    </Scene>
  );
}

/** Une ouverture, du surgissement à la sortie. Sa phase lui appartient. */
function Ouverture({ booster, son, onFini }: { booster: BoosterOverlay; son: boolean; onFini: () => void }) {
  const [phase, setPhase] = useState<Phase>('surgit');

  // Le temps de chaque phase ; le rail, lui, dit quand il a fini.
  useEffect(() => {
    if (phase === 'rail') return;
    const t = setTimeout(() => {
      const suite = SUITE[phase];
      if (suite) setPhase(suite);
      else onFini();
    }, DUREES[phase]);
    return () => clearTimeout(t);
  }, [phase, onFini]);

  const pool = useMemo<CarteRailPack[]>(
    () =>
      CARDS.filter((c) => c.packs.includes(booster.pack.id)).map((c) => ({
        cardId: c.id,
        name: c.name,
        rarity: c.rarity,
        glyph: c.glyph,
        description: c.description,
        power: c.power,
        nature: c.nature,
      })),
    [booster.pack.id],
  );

  return (
    <div className="ov-booster" data-phase={phase}>
      <header className="ov-bandeau">
        <span className="ov-bandeau-pack">{booster.pack.nom}</span>
        <span className="ov-bandeau-pour">
          pour <strong>{booster.pour}</strong>
        </span>
      </header>

      {(phase === 'surgit' || phase === 'charge' || phase === 'eclate') && (
        <div className="ov-sachet">
          <div className="ov-sachet-corps">
            <BoosterPack3D
              name={booster.pack.nom}
              cardCount={1}
              gradient={booster.pack.gradient}
              art={booster.pack.art}
              rarete={booster.pack.gemme}
              frozen={phase !== 'surgit'}
            />
          </div>
          <div className="ov-eclats" aria-hidden="true">
            {ECLATS.map((e, i) => (
              <i
                key={i}
                style={{
                  ['--angle' as string]: `${e.angle}deg`,
                  ['--portee' as string]: `${e.portee}px`,
                  ['--retard' as string]: `${e.retard}ms`,
                  ['--taille' as string]: `${e.taille}px`,
                }}
              />
            ))}
          </div>
          {phase === 'eclate' && <span className="ov-onde" aria-hidden="true" />}
        </div>
      )}

      {phase === 'rail' && (
        <div className="ov-rail">
          <RailPack
            pool={pool}
            poids={booster.pack.weights}
            gagnante={{
              cardId: booster.carte.cardId,
              name: booster.carte.name,
              rarity: booster.carte.rarity,
              glyph: booster.carte.glyph,
              description: booster.carte.description,
              power: booster.carte.power,
              nature: booster.carte.nature,
            }}
            duree={COURBE_MESUREE.duree}
            sourdine={!son}
            onFini={() => setPhase('carte')}
          />
        </div>
      )}

      {(phase === 'carte' || phase === 'sort') && <Revelation booster={booster} />}
    </div>
  );
}

/** La carte tirée, grande, avec ce qu'elle fait et sur qui elle tombe. */
function Revelation({ booster }: { booster: BoosterOverlay }) {
  const meta = RARITY_META[booster.carte.rarity] ?? RARITY_META.C;
  return (
    <div className="ov-revelation" style={{ ['--r' as string]: meta.color }}>
      <span className="ov-anneau" aria-hidden="true" />
      <div className="ov-carte">
        <CardFrame
          cardId={booster.carte.cardId}
          name={booster.carte.name}
          description={booster.carte.description}
          rarity={booster.carte.rarity}
          glyph={booster.carte.glyph}
          power={booster.carte.power}
          nature={booster.carte.nature}
        />
      </div>
      <div className="ov-legende glass">
        <span className="ov-legende-rarete">{meta.label}</span>
        <strong className="ov-legende-nom">{booster.carte.name}</strong>
        {booster.carte.action && <span className="ov-legende-action">{booster.carte.action}</span>}
        <span className="ov-legende-cible">
          {booster.carte.nature === 'malus' ? 'Tombe sur ' : 'Pour '}
          <strong>{booster.tombeSur}</strong>
        </span>
      </div>
    </div>
  );
}
