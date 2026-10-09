'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CardFrame } from '@/components/CardFrame';
import { RailJoueurs } from '@/components/RailJoueurs';
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
 * charge, son haut se déchire et s'envole, la lumière sort de l'ouverture, il
 * éclate, et le rail du site se lance — le même, avec les mêmes cartes. Il
 * s'arrête sur la carte tirée par le serveur. Si elle tombe sur des joueurs
 * tirés au sort, le second tirage suit : un rail de joueurs par joueur tiré.
 * Puis la carte reste à l'écran quelques secondes, grande, avec son nom, son
 * effet et sur qui elle tombe.
 *
 * Deux ouvertures rapprochées se jouent l'une après l'autre, jamais l'une
 * sur l'autre : la file est le seul état, et sa tête est ce qui se joue.
 *
 * Quand la carte est révélée, l'overlay demande son annonce dans le tchat
 * (`/api/overlay/annonce`) : le message tombe au moment où le stream la voit.
 * Jamais en aperçu.
 */

type Phase = 'surgit' | 'charge' | 'dechire' | 'eclate' | 'rail' | 'joueurs' | 'carte' | 'sort';

/** Les phases qui finissent d'elles-mêmes : les deux rails disent quand ils ont fini. */
type PhaseMinutee = Exclude<Phase, 'rail' | 'joueurs'>;

const DUREES: Record<PhaseMinutee, number> = {
  surgit: 1400,
  charge: 1300,
  dechire: 1000,
  eclate: 550,
  carte: 7000,
  sort: 900,
};

const SUITE: Record<PhaseMinutee, Phase | null> = {
  surgit: 'charge',
  charge: 'dechire',
  dechire: 'eclate',
  eclate: 'rail',
  carte: 'sort',
  sort: null,
};

/**
 * La ligne de déchirure, en pourcentages de la planche : juste sous le
 * sertissage du haut, en dents de scie, et penchée comme lui — la planche est
 * peinte de trois quarts, son bord haut monte vers la droite (de 10,8 % à
 * 7,6 % de la hauteur). Le haut et le corps en sont les deux côtés.
 */
const DENTS = Array.from({ length: 27 }, (_, i) => {
  const x = (i / 26) * 100;
  const y = 10.8 - 3.2 * (x / 100) + (i % 2 ? 0.9 : -0.6);
  return `${x.toFixed(1)}% ${y.toFixed(2)}%`;
});
const DECOUPE_HAUT = `polygon(0% 0%, 100% 0%, ${[...DENTS].reverse().join(', ')})`;
const DECOUPE_CORPS = `polygon(${DENTS.join(', ')}, 100% 100%, 0% 100%)`;

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
  const annonce = useCallback(
    (ouvertureId: string) => {
      if (demo) return;
      void fetch('/api/overlay/annonce', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cle, ouvertureId }),
      }).catch(() => undefined);
    },
    [cle, demo],
  );

  return (
    <Scene largeur={1920} hauteur={1080}>
      {actuel && (
        <Ouverture key={actuel.id} booster={actuel} son={son} onRevelee={() => annonce(actuel.id)} onFini={suivante} />
      )}
    </Scene>
  );
}

/** Une ouverture, du surgissement à la sortie. Sa phase lui appartient. */
function Ouverture({
  booster,
  son,
  onRevelee,
  onFini,
}: {
  booster: BoosterOverlay;
  son: boolean;
  /** La carte est révélée : l'ouverture est finie, elle peut s'annoncer. */
  onRevelee: () => void;
  onFini: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('surgit');

  // Une seule fois, à l'entrée dans la phase de la carte.
  const revelee = useRef(onRevelee);
  useEffect(() => {
    revelee.current = onRevelee;
  });
  useEffect(() => {
    if (phase === 'carte') revelee.current();
  }, [phase]);

  // Le temps de chaque phase ; le rail, lui, dit quand il a fini.
  useEffect(() => {
    if (phase === 'rail' || phase === 'joueurs') return;
    const t = setTimeout(() => {
      const suite = SUITE[phase];
      if (suite) setPhase(suite);
      else onFini();
    }, DUREES[phase]);
    return () => clearTimeout(t);
  }, [phase, onFini]);

  /** Le haut du sachet est arraché : il le reste jusqu'à l'éclat. */
  const dechire = phase === 'dechire' || phase === 'eclate';

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

      {(phase === 'surgit' || phase === 'charge' || phase === 'dechire' || phase === 'eclate') && (
        <div className="ov-sachet">
          <div className="ov-sachet-corps">
            {/* Le sachet reste le même élément du début à la fin ; à la
                déchirure, il perd son haut, et une copie découpée de ce haut
                s'en arrache par-dessus. */}
            <div className="ov-morceau" style={dechire ? { clipPath: DECOUPE_CORPS } : undefined}>
              <BoosterPack3D
                name={booster.pack.nom}
                cardCount={1}
                gradient={booster.pack.gradient}
                art={booster.pack.art}
                rarete={booster.pack.gemme}
                frozen={phase !== 'surgit'}
              />
            </div>
            {dechire && (
              <>
                <span
                  className="ov-faisceau"
                  style={{ ['--lueur' as string]: (RARITY_META[booster.pack.gemme] ?? RARITY_META.C).color }}
                  aria-hidden="true"
                />
                <div className="ov-morceau ov-morceau-haut" style={{ clipPath: DECOUPE_HAUT }} aria-hidden="true">
                  <BoosterPack3D
                    name={booster.pack.nom}
                    cardCount={1}
                    gradient={booster.pack.gradient}
                    art={booster.pack.art}
                    rarete={booster.pack.gemme}
                    frozen
                  />
                </div>
              </>
            )}
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
        <div className="ov-rail rail-dans-scene">
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
            onFini={() => setPhase(booster.tirage?.gagnants.length ? 'joueurs' : 'carte')}
          />
        </div>
      )}

      {phase === 'joueurs' && booster.tirage && (
        <TirageJoueurs booster={booster} tirage={booster.tirage} son={son} onFini={() => setPhase('carte')} />
      )}

      {(phase === 'carte' || phase === 'sort') && <Revelation booster={booster} />}
    </div>
  );
}

/**
 * Le second tirage : sur qui tombe la carte, quand elle tombe sur des joueurs
 * tirés au sort. Un rail par joueur tiré, l'un après l'autre.
 */
function TirageJoueurs({
  booster,
  tirage,
  son,
  onFini,
}: {
  booster: BoosterOverlay;
  tirage: NonNullable<BoosterOverlay['tirage']>;
  son: boolean;
  onFini: () => void;
}) {
  const [rang, setRang] = useState(0);
  const meta = RARITY_META[booster.carte.rarity] ?? RARITY_META.C;
  const n = tirage.gagnants.length;
  return (
    <div className="ov-rail rail-dans-scene">
      <div className="ov-tirage-titre">
        <span className="ov-tirage-carte" style={{ color: meta.color }}>
          {booster.carte.name}
        </span>
        <span className="ov-tirage-question">
          {n > 1 ? (rang === 0 ? 'Premier joueur' : 'Second joueur') : 'Sur qui tombe-t-elle ?'}
        </span>
      </div>
      <RailJoueurs
        key={rang}
        joueurs={tirage.joueurs}
        gagnant={tirage.gagnants[rang]}
        sourdine={!son}
        onFini={() => (rang + 1 < n ? setRang(rang + 1) : onFini())}
      />
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
