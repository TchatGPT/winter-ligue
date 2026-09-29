'use client';

/**
 * L'arène du duel de flocons.
 *
 * Deux joueurs face à face. À chaque échange, leurs jauges de puissance se
 * remplissent ; la boule de neige part du lancer le plus fort et frappe
 * l'autre, qui vacille ; la manche se coche. Une égalité se rejoue. Au bout,
 * le vainqueur rafle le pot.
 *
 * Tout est déjà décidé par le serveur : l'écran ne fait que rejouer les
 * lancers reçus, dans l'ordre. Rejouer, recharger ou fermer ne change rien.
 */

import { useEffect, useMemo, useState } from 'react';
import { SnowCap } from '@/components/SnowCap';
import { flakes } from '@/components/ui';
import { gagnantEchange, manchesAGagner, PUISSANCE_MAX, type Echange } from '@/lib/domain/bataille';

export interface CampVueClient {
  id: string;
  pseudo: string;
  bot: boolean;
  manches: number;
}

/** La vue d'un duel, telle que le serveur l'envoie. */
export interface BatailleVueClient {
  id: string;
  manches: number;
  mise: number;
  statut: 'ATTENTE' | 'TERMINEE' | 'ANNULEE';
  hoteId: string;
  camps: CampVueClient[];
  echanges: Echange[];
  ancien: boolean;
  vainqueurId: string | null;
  creeeA: string;
  resolueA: string | null;
}

/** Les temps d'un échange, en millisecondes. */
const CHARGE = 700;
const VOL = 520;
const PAUSE = 650;
const ECHANGE = CHARGE + VOL + PAUSE;

type Phase = 'charge' | 'vol' | 'impact';

/** Le combattant : son orbe, son nom, et les manches qu'il a gagnées. */
function Combattant({
  camp,
  cote,
  gagnees,
  cible,
  touche,
  vainqueur,
  perdant,
  moi,
}: {
  camp: CampVueClient;
  cote: 'gauche' | 'droite';
  gagnees: number;
  cible: number;
  touche: boolean;
  vainqueur: boolean;
  perdant: boolean;
  moi: boolean;
}) {
  return (
    <div className={`duel-combattant ${cote === 'droite' ? 'items-end text-right' : 'items-start text-left'}`}>
      <span
        className="duel-orbe"
        data-touche={touche ? '' : undefined}
        data-vainqueur={vainqueur ? '' : undefined}
        data-perdant={perdant ? '' : undefined}
        aria-hidden="true"
      >
        {camp.bot ? '🤖' : (camp.pseudo[0] ?? '?').toUpperCase()}
      </span>
      <span className="mt-3 block max-w-full truncate font-display text-xl font-black tracking-wide text-ink uppercase sm:text-2xl">
        {camp.pseudo}
        {moi && <span className="ml-1.5 align-middle text-[12px] font-bold text-muted normal-case">(toi)</span>}
      </span>
      <span className="mt-2 flex gap-1.5" aria-label={`${gagnees} manche${gagnees > 1 ? 's' : ''} gagnée${gagnees > 1 ? 's' : ''}`}>
        {Array.from({ length: cible }, (_, i) => (
          <span key={i} className="duel-pip" data-plein={i < gagnees ? '' : undefined} />
        ))}
      </span>
    </div>
  );
}

export function BatailleArene({
  bataille,
  moiId,
  anime,
}: {
  bataille: BatailleVueClient;
  moiId: string | null;
  /** Rejouer le duel lancer par lancer, ou montrer d'emblée le résultat. */
  anime: boolean;
}) {
  const b = bataille;
  const hote = b.camps[0];
  const adversaire = b.camps[1];
  const cible = manchesAGagner(b.manches);
  const total = b.echanges.length;

  /** L'échange en cours, et où il en est. `etape === total` : tout est joué. */
  const [etape, setEtape] = useState(() => (anime ? 0 : total));
  const [phase, setPhase] = useState<Phase>('charge');
  const fini = etape >= total;

  useEffect(() => {
    if (fini) return;
    const t1 = setTimeout(() => setPhase('vol'), CHARGE);
    const t2 = setTimeout(() => setPhase('impact'), CHARGE + VOL);
    const t3 = setTimeout(() => {
      setPhase('charge');
      setEtape((e) => e + 1);
    }, ECHANGE);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [etape, fini]);

  /** Les échanges déjà comptés à l'écran. */
  const joues = useMemo(() => {
    const n = fini ? total : phase === 'impact' ? etape + 1 : etape;
    return b.echanges.slice(0, n);
  }, [b.echanges, etape, phase, fini, total]);

  const score = useMemo(() => {
    const s = { hote: 0, adversaire: 0 };
    for (const e of joues) {
      const g = gagnantEchange(e);
      if (g) s[g] += 1;
    }
    return s;
  }, [joues]);

  const courant = fini ? b.echanges[total - 1] : b.echanges[etape];
  const gagnantCourant = courant ? gagnantEchange(courant) : null;
  const jauges = !fini && phase === 'charge' ? null : courant;

  const vainqueurHote = b.vainqueurId === hote?.id;
  const nomVainqueur = vainqueurHote ? hote?.pseudo : adversaire?.pseudo;
  const botGagne = adversaire?.bot && !vainqueurHote;

  if (!hote || !adversaire) return null;

  /* Un duel d'avant la réforme : joué aux cartes, on n'en a que l'issue. */
  if (b.ancien) {
    return (
      <section className="glass glass-reflet relative overflow-hidden p-6 text-center">
        <SnowCap radius="var(--r-lg)" seed={`arene-${b.id}`} epaisseur={16} />
        <p className="eyebrow">Ancien duel</p>
        <p className="mt-3 font-display text-2xl font-black text-ink uppercase">
          {hote.pseudo} {hote.manches} – {adversaire.manches} {adversaire.pseudo}
        </p>
        <p className="mt-2 text-[15px] text-ink-2">
          Joué aux cartes, avant le duel de flocons. {nomVainqueur} a raflé {flakes(b.mise * 2)} ❄.
        </p>
      </section>
    );
  }

  return (
    <section className="glass glass-reflet relative overflow-hidden px-4 py-7 sm:px-8" aria-live="polite">
      <SnowCap radius="var(--r-lg)" seed={`arene-${b.id}`} epaisseur={18} />

      {/* ---- L'enjeu ---- */}
      <header className="relative flex flex-col items-center text-center">
        <p className="eyebrow">Duel de flocons · au meilleur des {b.manches} manche{b.manches > 1 ? 's' : ''}</p>
        <p className="mt-2 font-display text-5xl leading-none font-black text-ink tabular-nums sm:text-6xl">
          {flakes(b.mise * 2)} <span className="text-ice">❄</span>
        </p>
        <p className="mt-1 font-display text-[12px] font-bold tracking-[0.2em] text-faint uppercase">
          En jeu · {flakes(b.mise)} ❄ chacun
        </p>
      </header>

      {/* ---- La scène ---- */}
      <div className="duel-scene relative mt-8">
        <Combattant
          camp={hote}
          cote="gauche"
          gagnees={score.hote}
          cible={cible}
          touche={!fini && phase === 'impact' && gagnantCourant === 'adversaire'}
          vainqueur={fini && vainqueurHote}
          perdant={fini && !vainqueurHote}
          moi={hote.id === moiId}
        />

        <div className="duel-piste" aria-hidden="true">
          {/* Les jauges de puissance, l'une vers la droite, l'autre vers la gauche. */}
          <div className="duel-jauge" data-cote="gauche">
            <span style={{ width: `${jauges ? (jauges.hote / PUISSANCE_MAX) * 100 : 0}%` }} />
            <em>{jauges ? jauges.hote : '—'}</em>
          </div>
          <div className="duel-vs">VS</div>
          <div className="duel-jauge" data-cote="droite">
            <span style={{ width: `${jauges ? (jauges.adversaire / PUISSANCE_MAX) * 100 : 0}%` }} />
            <em>{jauges ? jauges.adversaire : '—'}</em>
          </div>

          {/* La boule de neige : du plus fort vers l'autre. Deux boules qui se
              croisent pour une égalité. */}
          {!fini && phase === 'vol' && gagnantCourant && (
            <span key={`b-${etape}`} className="duel-boule" data-vers={gagnantCourant === 'hote' ? 'droite' : 'gauche'} />
          )}
          {!fini && phase === 'vol' && !gagnantCourant && (
            <>
              <span key={`e1-${etape}`} className="duel-boule" data-vers="milieu-g" />
              <span key={`e2-${etape}`} className="duel-boule" data-vers="milieu-d" />
            </>
          )}
          {!fini && phase === 'impact' && (
            <span
              key={`i-${etape}`}
              className="duel-eclat"
              data-cote={gagnantCourant === 'hote' ? 'droite' : gagnantCourant === 'adversaire' ? 'gauche' : 'milieu'}
            />
          )}
        </div>

        <Combattant
          camp={adversaire}
          cote="droite"
          gagnees={score.adversaire}
          cible={cible}
          touche={!fini && phase === 'impact' && gagnantCourant === 'hote'}
          vainqueur={fini && !vainqueurHote}
          perdant={fini && vainqueurHote}
          moi={adversaire.id === moiId}
        />
      </div>

      {/* ---- Ce qui se passe ---- */}
      <div className="relative mt-6 min-h-[64px] text-center">
        {!fini ? (
          <p className="font-display text-lg font-black tracking-wide text-ink uppercase">
            {phase === 'charge'
              ? `Échange ${etape + 1} — ils arment…`
              : gagnantCourant === null
                ? 'Égalité ! On relance.'
                : `${gagnantCourant === 'hote' ? hote.pseudo : adversaire.pseudo} touche !`}
          </p>
        ) : (
          <div className="duel-verdict">
            <p className="font-display text-3xl font-black tracking-wide uppercase sm:text-4xl">
              {botGagne ? 'Le Bot garde la mise' : `${nomVainqueur} rafle ${flakes(b.mise * 2)} ❄`}
            </p>
            <p className="mt-1 text-[15px] text-ink-2">
              {score.hote} – {score.adversaire} en {total} échange{total > 1 ? 's' : ''}
              {b.vainqueurId === moiId ? ' · bien joué !' : moiId && b.camps.some((c) => c.id === moiId) ? ' · la revanche t’attend.' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ---- Le relevé, échange par échange ---- */}
      {joues.length > 0 && (
        <ol className="relative mx-auto mt-5 grid max-w-md gap-1.5">
          {joues.map((e, i) => {
            const g = gagnantEchange(e);
            return (
              <li key={i} className="duel-releve" data-gagnant={g ?? 'egalite'}>
                <span className="text-faint">#{i + 1}</span>
                <span className={g === 'hote' ? 'text-aurora' : 'text-muted'}>{e.hote}</span>
                <span className="text-faint">{g === null ? 'égalité' : g === 'hote' ? '◀' : '▶'}</span>
                <span className={g === 'adversaire' ? 'text-aurora' : 'text-muted'}>{e.adversaire}</span>
              </li>
            );
          })}
        </ol>
      )}

      {fini && anime && total > 0 && (
        <div className="relative mt-5 flex justify-center">
          <button type="button" className="btn btn-sm" onClick={() => setEtape(0)}>
            Revoir le duel
          </button>
        </div>
      )}
    </section>
  );
}
