'use client';

import { useCallback, useEffect, useState } from 'react';
import { prechargeSons, reveilleSon } from '@/components/bruitage';
import { SpinReel, type CarteRail } from '@/components/SpinReel';
import { RarityChip } from '@/components/ui';
import { CARDS } from '@/lib/domain/catalog';
import { RARITY_WEIGHTS_BASE } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import {
  COURBES,
  COURBES_ORDRE,
  dureeDe,
  MODE_LIBELLE,
  MODES,
  MODES_ORDRE,
  type Mode,
  type NomCourbe,
} from '@/lib/spin/courbe';

const RARETES: Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

const POOL: CarteRail[] = CARDS.map((c) => ({
  cardId: c.id,
  name: c.name,
  rarity: c.rarity,
  glyph: c.glyph,
  description: c.description,
  power: c.power,
  nature: c.nature,
}));

/** Une carte au hasard dans un palier — n'importe laquelle si le palier est vide. */
function carteDe(rarity: Rarity): CarteRail {
  const lot = POOL.filter((c) => c.rarity === rarity);
  const source = lot.length ? lot : POOL;
  return source[Math.floor(Math.random() * source.length)];
}

/**
 * Le banc : on choisit ce que le serveur aurait tiré, et on relance.
 *
 * Ce qu'on vient y régler, dans l'ordre où ça se voit : l'allure au démarrage,
 * la longueur de la traîne, la densité du cliquet, le moment où l'appât résout,
 * et la lisibilité de l'arrêt. Chacun a son nombre, et chaque nombre a sa place
 * — `lib/spin/courbe.ts` pour le mouvement, `components/useSpinAnimation.ts`
 * pour la mise en scène, `components/bruitage.ts` pour les niveaux.
 */
export function RailBanc() {
  // Trois : c'est ce que donne tout booster depuis que les sachets ont une
  // taille unique. Le curseur sert à vérifier que le rail tient quand même à
  // une, deux, quatre ou cinq colonnes.
  const [bandes, setBandes] = useState(3);
  const [rarete, setRarete] = useState<Rarity>('L');
  const [mode, setMode] = useState<Mode>('normal');
  const [nomCourbe, setNomCourbe] = useState<NomCourbe>('mesuree');
  const [essai, setEssai] = useState(0);
  const [relance, setRelance] = useState(false);
  const [gagnantes, setGagnantes] = useState<CarteRail[] | null>(null);

  useEffect(() => {
    void prechargeSons();
  }, []);

  /** Tire N gagnantes, la meilleure au milieu, et remonte le rail. */
  const lance = useCallback(
    (combien: number, palier: Rarity) => {
      reveilleSon();
      // La meilleure carte au milieu, pour vérifier que la fanfare tombe bien à
      // l'arrêt de sa colonne et non à celui de la dernière.
      const milieu = Math.floor(combien / 2);
      setGagnantes(
        Array.from({ length: combien }, (_, i) => carteDe(i === milieu ? palier : 'C')),
      );
      setEssai((n) => n + 1);
    },
    [],
  );

  /*
   * `?auto=1` lance sans clic, `?auto=turbo` lance dans l'allure nommée.
   *
   * C'est ce qui permet de vérifier le rail **sans le regarder** : un Chromium
   * sans interface, une capture, et l'on sait si les jetons sont sous le repère.
   *
   * Un avertissement au passage, appris à la dure : le temps virtuel de
   * `--virtual-time-budget` avance les minuteries mais **pas** la ligne de temps
   * des animations. Une course de 6,8 s ne se termine donc jamais dans une
   * capture, et l'on croit à tort que le rail est figé ; `?auto=immediat` sert
   * précisément à observer l'arrivée.
   *
   * Le lancement passe par une minuterie plutôt que par un appel direct : un
   * `setState` posé à même le corps d'un effet déclenche une cascade de rendus,
   * et React le signale à juste titre.
   */
  useEffect(() => {
    const demande = new URLSearchParams(location.search).get('auto');
    if (demande === null) return;
    const depart = setTimeout(() => {
      if (demande in MODES) setMode(demande as Mode);
      // ?relance=1 force le jeton, pour pouvoir le capturer sans cliquer.
      if (new URLSearchParams(location.search).has('relance')) setRelance(true);
      const n = Number(new URLSearchParams(location.search).get('bandes'));
      lance(Number.isInteger(n) && n >= 1 && n <= 5 ? n : 3, 'L');
    }, 0);
    return () => clearTimeout(depart);
  }, [lance]);

  return (
    <div className="space-y-6">
      <div className="glass flex flex-wrap items-center gap-4 px-4 py-3">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Bandes
          <input
            type="range"
            min={1}
            max={5}
            value={bandes}
            onChange={(e) => setBandes(Number(e.target.value))}
          />
          <span className="num text-frost">{bandes}</span>
        </label>

        <div className="flex items-center gap-1.5">
          {RARETES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarete(r)}
              style={{ opacity: r === rarete ? 1 : 0.4 }}
              aria-pressed={r === rarete}
            >
              <RarityChip rarity={r} />
            </button>
          ))}
        </div>

        <div className="rail-allure" style={{ opacity: 1 }}>
          {MODES_ORDRE.map((m) => (
            <button
              key={m}
              type="button"
              className={m === mode ? 'rail-allure-actif' : undefined}
              onClick={() => setMode(m)}
              aria-pressed={m === mode}
            >
              {MODE_LIBELLE[m]}
            </button>
          ))}
        </div>

        {/* Les deux dépouillements de la même vidéo ne donnent pas la même
            courbe, et aucun argument écrit ne tranchera : ça se regarde. */}
        <div className="rail-allure" style={{ opacity: 1 }}>
          {COURBES_ORDRE.map((c) => (
            <button
              key={c}
              type="button"
              className={c === nomCourbe ? 'rail-allure-actif' : undefined}
              onClick={() => setNomCourbe(c)}
              aria-pressed={c === nomCourbe}
            >
              {COURBES[c].nom}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={relance}
            onChange={(e) => setRelance(e.target.checked)}
          />
          Winter Spin
        </label>

        <button className="btn btn-ice" onClick={() => lance(bandes, rarete)}>
          Lancer
        </button>
      </div>

      <div className="glass relative overflow-hidden px-4 py-8">
        {gagnantes ? (
          <SpinReel
            // La clé force un remontage : on veut une bande neuve et une course
            // neuve à chaque essai, pas une animation relancée sur l'ancienne.
            key={essai}
            pool={POOL}
            poids={RARITY_WEIGHTS_BASE}
            gagnantes={gagnantes}
            // Le banc force la relance pour pouvoir la regarder : en jeu, elle
            // vient du serveur et tombe une fois sur mille deux cent cinquante.
            relances={gagnantes.map((_, i) => relance && i === Math.floor(gagnantes.length / 2))}
            duree={dureeDe(COURBES[nomCourbe], mode)}
            courbe={COURBES[nomCourbe]}
            onFini={() => {}}
          />
        ) : (
          <p className="py-16 text-center text-[13px] text-faint">
            Choisis une rareté et lance. Rien n’est acheté, rien n’est débité : la
            gagnante est posée à la main, comme le serveur l’aurait fait.
          </p>
        )}
      </div>
    </div>
  );
}
