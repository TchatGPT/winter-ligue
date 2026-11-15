'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CardFrame } from '@/components/CardFrame';
import { EmblemeRarete } from '@/components/EmblemeRarete';
import { RailJoueurs } from '@/components/RailJoueurs';
import { LARGEUR_RAIL, RailPack, type CarteRailPack } from '@/components/RailPack';
import { prechargeGrande, prechargeRail } from '@/components/prechargeCartes';
import { Scene } from '@/components/overlay/Scene';
import { SnowCap } from '@/components/SnowCap';
import { boosterDemo } from '@/components/overlay/demo';
import { useFluxOverlay } from '@/components/overlay/useFluxOverlay';
import { CARDS, RARITY_META } from '@/lib/domain/catalog';
import type { BoosterOverlay } from '@/lib/services/overlay';
import { COURBE_MESUREE } from '@/lib/spin/courbe';
import { CourseRoulette } from '@/components/CourseRoulette';
import { questionDesGames, TirageGames } from '@/components/TirageGames';

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

/**
 * L'ouverture rendue dans Blender (15/11/2026) : le booster monte, sa bande se
 * déchire et s'envole, et quatre vraies cartes du booster sortent de
 * l'ouverture en éventail. Une vidéo à fond transparent (VP9 avec alpha), de la
 * durée des quatre premières phases. Seuls les boosters que joue l'overlay en
 * ont une : sans elle, le sachet en CSS reprend sa place.
 */
const VIDEOS_OUVERTURE: Partial<Record<string, string>> = {
  perso: '/boosters/ouverture-perso.webm',
  finisseur: '/boosters/ouverture-finisseur.webm',
};

/**
 * Les cinq cartes sur lesquelles la vidéo s'arrête, de gauche à droite : ce
 * sont les cinq premières cartes visibles du rail, posées à la même place
 * (mesurée sur le plateau de 1920 × 1080). Le rail les reprend telles quelles
 * et part de là : on ne voit pas le passage de la vidéo au site. À changer
 * avec la vidéo — `scratchpad/blender/ouverture/rendu.sh`.
 */
const CARTES_DE_FIN: Partial<Record<string, string[]>> = {
  perso: ['chocolat-chaud', 'souffle-polaire', 'ouragan-blanc', 'vortex-polaire', 'bonhomme-de-neige'],
  finisseur: ['sommet-atteint', 'drapeau-plante', 'troc-des-neiges', 'statue-de-givre', 'soudure-de-glace'],
};

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
    if (!nouveaux.boosters.length) return;
    // La carte tirée se révèle en grand après le rail : son illustration se
    // charge dès l'arrivée du booster, pendant qu'il surgit.
    for (const b of nouveaux.boosters) prechargeGrande(b.carte.cardId);
    setFile((f) => [...f, ...nouveaux.boosters]);
  }, []);

  // Les cartes des rails, prêtes avant le premier booster du live.
  useEffect(() => {
    prechargeRail(
      CARDS.filter((c) => c.packs.length > 0).map((c) => c.id),
      LARGEUR_RAIL,
    );
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

  // Les vidéos d'ouverture se chargent dès l'arrivée de l'overlay : la
  // première ouverture du live ne doit pas attendre son fichier.
  useEffect(() => {
    const garde = Object.values(VIDEOS_OUVERTURE).map((src) => {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.src = src!;
      v.load();
      return v;
    });
    return () => garde.forEach((v) => v.removeAttribute('src'));
  }, []);

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
  const video = VIDEOS_OUVERTURE[booster.pack.id];
  useEffect(() => {
    if (phase === 'rail' || phase === 'joueurs') return;
    // Avec la vidéo, c'est sa fin qui lance le rail (elle peut démarrer en
    // retard, le temps de se charger) ; un filet de sécurité s'il ne vient pas.
    if (video && (phase === 'surgit' || phase === 'charge' || phase === 'dechire' || phase === 'eclate')) {
      if (phase !== 'surgit') return;
      const filet = setTimeout(() => setPhase('rail'), 15000);
      return () => clearTimeout(filet);
    }
    const t = setTimeout(() => {
      const suite = SUITE[phase];
      if (suite) setPhase(suite);
      else onFini();
    }, DUREES[phase]);
    return () => clearTimeout(t);
  }, [phase, onFini, video]);

  const cartesDeFin = useMemo(
    () =>
      (VIDEOS_OUVERTURE[booster.pack.id] ? (CARTES_DE_FIN[booster.pack.id] ?? []) : [])
        .map((id) => CARDS.find((c) => c.id === id))
        .filter((c) => c !== undefined)
        .map((c) => ({ cardId: c.id, name: c.name, rarity: c.rarity, glyph: c.glyph, description: c.description, power: c.power, nature: c.nature })),
    [booster.pack.id],
  );

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
      {/* Le bandeau : une plaque du site, sa neige, la gemme du booster, puis
          pour qui il s'ouvre — sur une ligne. */}
      <header
        className="ov-bandeau"
        style={{ ['--teinte' as string]: (RARITY_META[booster.pack.gemme] ?? RARITY_META.C).color }}
      >
        <SnowCap radius="28px" seed={`ov-bandeau-${booster.pack.id}`} epaisseur={12} />
        <EmblemeRarete rarity={booster.pack.gemme} className="ov-bandeau-embleme" />
        <span className="ov-bandeau-pack">{booster.pack.nom}</span>
        <span className="ov-bandeau-sep" aria-hidden="true" />
        <span className="ov-bandeau-pour">
          pour <strong>{booster.pour}</strong>
        </span>
      </header>

      {VIDEOS_OUVERTURE[booster.pack.id] &&
        (phase === 'surgit' || phase === 'charge' || phase === 'dechire' || phase === 'eclate' || phase === 'rail') && (
          // Elle reste sous le rail le temps qu'il se peigne, puis s'efface.
          <video
            className="ov-ouverture"
            src={VIDEOS_OUVERTURE[booster.pack.id]}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => setPhase((p) => (p === 'rail' ? p : 'rail'))}
            onError={() => setPhase((p) => (p === 'rail' ? p : 'rail'))}
          />
        )}

      {!VIDEOS_OUVERTURE[booster.pack.id] &&
        (phase === 'surgit' || phase === 'charge' || phase === 'dechire' || phase === 'eclate') && (
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
        <div className={`ov-rail rail-dans-scene${VIDEOS_OUVERTURE[booster.pack.id] ? ' ov-rail-relais' : ''}`}>
          <RailPack
            pool={pool}
            entree={cartesDeFin}
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
 * tirés au sort — une bande par joueur, toutes ensemble —, puis le troisième :
 * les games qu'elle touche (`TirageGames`).
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
  // Les joueurs d'abord, tous ensemble ; puis les games que la carte touche.
  // Un booster ouvert pour un joueur n'a que ses games à dérouler.
  const [etape, setEtape] = useState<'joueurs' | 'games'>(tirage.sansJoueurs ? 'games' : 'joueurs');
  const apresJoueurs = () => (tirage.games ? setEtape('games') : onFini());
  const meta = RARITY_META[booster.carte.rarity] ?? RARITY_META.C;
  const n = tirage.gagnants.length;
  return (
    <div className="ov-rail rail-dans-scene">
      <div className="ov-tirage-titre">
        <span className="ov-tirage-carte" style={{ color: meta.color }}>
          {booster.carte.name}
        </span>
        <span className="ov-tirage-question">
          {etape === 'games' && tirage.games
            ? questionDesGames(tirage.games)
            : tirage.course
              ? 'Qui ne passera pas la ligne ?'
              : n > 1
                ? `Sur quels ${n === 2 ? 'deux' : n === 3 ? 'trois' : n} joueurs ?`
                : 'Sur qui tombe-t-elle ?'}
        </span>
      </div>
      {etape === 'games' && tirage.games ? (
        <div className="ov-games">
          <TirageGames games={tirage.games} sourdine={!son} onFini={onFini} />
        </div>
      ) : tirage.course ? (
        <div className="ov-course">
          <CourseRoulette pseudos={tirage.gagnants} graine={booster.id} sourdine={!son} onFini={apresJoueurs} />
        </div>
      ) : (
        <RailJoueurs joueurs={tirage.joueurs} gagnants={tirage.gagnants} sourdine={!son} onFini={apresJoueurs} />
      )}
    </div>
  );
}

/**
 * La carte tirée, grande, dans la fumée de sa rareté — celle des boosters du
 * site, qui dérive lentement derrière elle —, et à côté, sur une plaque du
 * site : sa rareté, son nom, ce qu'elle fait et sur qui elle tombe.
 */
function Revelation({ booster }: { booster: BoosterOverlay }) {
  const meta = RARITY_META[booster.carte.rarity] ?? RARITY_META.C;
  return (
    <div className="ov-revelation" data-rarete={booster.carte.rarity} style={{ ['--r' as string]: meta.color }}>
      <div className="ov-carte-zone">
        <div className="ov-fumee" aria-hidden="true">
          <span className="fumee-nappe fumee-nappe-1" />
          <span className="fumee-nappe fumee-nappe-2" />
          <span className="fumee-nappe fumee-nappe-3" />
        </div>
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
      </div>
      <div className="ov-legende glass">
        <SnowCap radius="30px" seed={`ov-legende-${booster.carte.cardId}`} epaisseur={14} />
        <p className="ov-legende-rarete">
          <EmblemeRarete rarity={booster.carte.rarity} className="ov-legende-embleme" />
          {booster.carte.rarity === 'L' ? '★ Légendaire ★' : meta.label}
        </p>
        <strong className="ov-legende-nom">{booster.carte.name}</strong>
        {booster.carte.action && <span className="ov-legende-action">{booster.carte.action}</span>}
        <p className="ov-legende-cible">
          <span>{booster.carte.nature === 'malus' ? 'Tombe sur' : 'Pour'}</span>
          <strong>{booster.tombeSur}</strong>
        </p>
      </div>
    </div>
  );
}
