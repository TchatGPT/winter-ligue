'use client';

/**
 * L'arène du duel de flocons.
 *
 * Deux joueurs face à face. À chaque échange, leurs jauges de puissance se
 * remplissent ; la boule de neige part du lancer le plus fort, décrit sa
 * parabole et frappe l'autre, qui vacille ; la manche se coche. Une égalité se
 * rejoue. Au bout, le vainqueur rafle le pot.
 *
 * Tout est déjà décidé par le serveur : l'écran ne fait que rejouer les
 * lancers reçus, dans l'ordre. Rejouer, recharger ou fermer ne change rien.
 *
 * Le composant ne dessine que le contenu : c'est la fenêtre du salon qui lui
 * donne sa plaque, au centre de l'écran.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { maintenantAudio, programme } from '@/components/bruitage';
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

/** Un camp tel qu'on le montre avant que le serveur ait répondu. */
export interface CampApercu {
  pseudo: string;
  bot: boolean;
}

/** Les temps d'un échange, en millisecondes. */
const ARME = 220;
const CHARGE = 650;
const VOL = 520;
const PAUSE = 650;
const ECHANGE = ARME + CHARGE + VOL + PAUSE;

type Phase = 'arme' | 'charge' | 'vol' | 'impact';

export function initiale(camp: CampApercu): string {
  return camp.bot ? '🤖' : (camp.pseudo.trim()[0] ?? '?').toUpperCase();
}

/** Le combattant : son orbe, son nom, et les manches qu'il a gagnées. */
function Combattant({
  camp,
  gagnees,
  cible,
  touche = false,
  vainqueur = false,
  perdant = false,
  moi = false,
}: {
  camp: CampApercu;
  gagnees: number;
  cible: number;
  touche?: boolean;
  vainqueur?: boolean;
  perdant?: boolean;
  moi?: boolean;
}) {
  return (
    <div className="duel-combattant">
      <span
        className="orbe"
        data-touche={touche ? '' : undefined}
        data-vainqueur={vainqueur ? '' : undefined}
        data-perdant={perdant ? '' : undefined}
        aria-hidden="true"
      >
        {initiale(camp)}
      </span>
      <span className="mt-3 block max-w-full truncate font-display text-lg font-black tracking-wide text-ink uppercase sm:text-2xl">
        {camp.pseudo}
      </span>
      {/* La ligne existe des deux côtés : sans elle, les deux orbes ne seraient
          plus à la même hauteur. */}
      <span className={`text-[12px] font-bold text-muted ${moi ? '' : 'invisible'}`} aria-hidden={!moi}>
        toi
      </span>
      <span
        className="mt-2 flex gap-1.5"
        aria-label={`${gagnees} manche${gagnees > 1 ? 's' : ''} gagnée${gagnees > 1 ? 's' : ''} sur ${cible}`}
      >
        {Array.from({ length: cible }, (_, i) => (
          <span key={i} className="duel-pip" data-plein={i < gagnees ? '' : undefined} />
        ))}
      </span>
    </div>
  );
}

/** Deux jauges de puissance, l'une vers la droite, l'autre vers la gauche. */
function Jauges({ gauche, droite, vide }: { gauche: number | null; droite: number | null; vide: boolean }) {
  const largeur = (v: number | null) => `${v === null ? 0 : (v / PUISSANCE_MAX) * 100}%`;
  return (
    <>
      <div className="duel-jauge" data-cote="gauche" data-vide={vide ? '' : undefined}>
        <span style={{ width: largeur(gauche) }} />
        <em>{gauche ?? '—'}</em>
      </div>
      <div className="duel-vs">VS</div>
      <div className="duel-jauge" data-cote="droite" data-vide={vide ? '' : undefined}>
        <span style={{ width: largeur(droite) }} />
        <em>{droite ?? '—'}</em>
      </div>
    </>
  );
}

/** L'enjeu, en tête de l'arène. */
function Enjeu({ mise, manches }: { mise: number; manches: number }) {
  return (
    // Les marges latérales dégagent la croix de fermeture, en haut à droite :
    // sur un téléphone, le titre passait dessous.
    <header className="flex flex-col items-center px-11 text-center">
      <p className="eyebrow">
        Duel de flocons · au meilleur des {manches} manche{manches > 1 ? 's' : ''}
      </p>
      <p className="arene-pot">
        {flakes(mise * 2)} <span className="text-ice">❄</span>
      </p>
      <p className="mt-1 font-display text-[12px] font-bold tracking-[0.2em] text-muted uppercase">
        En jeu · {flakes(mise)} ❄ chacun
      </p>
    </header>
  );
}

/**
 * L'arène avant la réponse du serveur : les deux camps en place, les jauges
 * vides. Elle s'ouvre au clic, sans attendre le réseau — l'attente se voit
 * comme une mise en place, pas comme un écran figé.
 */
export function ArenePreparation({
  gauche,
  droite,
  mise,
  manches,
  moi,
}: {
  gauche: CampApercu;
  droite: CampApercu;
  mise: number;
  manches: number;
  /** De quel côté se tient le joueur : à gauche s'il lance le duel, à droite s'il en relève un. */
  moi: 'gauche' | 'droite';
}) {
  const cible = manchesAGagner(manches);
  return (
    <div className="arene" aria-live="polite" aria-busy="true">
      <Enjeu mise={mise} manches={manches} />
      <div className="duel-scene mt-7">
        <Combattant camp={gauche} gagnees={0} cible={cible} moi={moi === 'gauche'} />
        <div className="duel-piste" aria-hidden="true">
          <Jauges gauche={null} droite={null} vide />
        </div>
        <Combattant camp={droite} gagnees={0} cible={cible} moi={moi === 'droite'} />
      </div>
      <p className="mt-7 min-h-[76px] text-center font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
        {droite.bot ? 'Le Bot fait sa boule de neige…' : 'Les deux camps se mettent en place…'}
      </p>
      {/* La place du relevé, gardée : la fenêtre ne grandit pas quand le duel commence. */}
      <div className="mt-4 min-h-[34px]" />
    </div>
  );
}

export function BatailleArene({
  bataille,
  moiId,
  anime,
  onFini,
}: {
  bataille: BatailleVueClient;
  moiId: string | null;
  /** Rejouer le duel lancer par lancer, ou montrer d'emblée le résultat. */
  anime: boolean;
  /** Appelé quand le dernier lancer est tombé. */
  onFini?: () => void;
}) {
  const b = bataille;
  const hote = b.camps[0];
  const adversaire = b.camps[1];
  const cible = manchesAGagner(b.manches);
  const total = b.echanges.length;

  /** L'échange en cours, et où il en est. `etape === total` : tout est joué. */
  const [etape, setEtape] = useState(() => (anime ? 0 : total));
  const [phase, setPhase] = useState<Phase>('arme');
  const fini = etape >= total;

  // Le rappel de fin change à chaque rendu du parent : on garde le dernier,
  // sans relancer les minuteries pour autant.
  const rappel = useRef(onFini);
  useEffect(() => {
    rappel.current = onFini;
  }, [onFini]);

  const vainqueurHote = b.vainqueurId === hote?.id;
  const jeGagne = moiId !== null && b.vainqueurId === moiId;

  useEffect(() => {
    if (fini) return;
    const courant = b.echanges[etape];
    const t1 = setTimeout(() => setPhase('charge'), ARME);
    const t2 = setTimeout(() => setPhase('vol'), ARME + CHARGE);
    const t3 = setTimeout(() => {
      setPhase('impact');
      // Le choc, sur l'horloge audio : une boule qui touche, ou deux qui se croisent.
      const maintenant = maintenantAudio();
      if (maintenant !== null && courant) programme('commun', maintenant, gagnantEchange(courant) ? 0.55 : 0.35);
    }, ARME + CHARGE + VOL);
    const t4 = setTimeout(() => {
      setPhase('arme');
      setEtape((e) => e + 1);
      if (etape + 1 >= total) {
        const maintenant = maintenantAudio();
        if (jeGagne && maintenant !== null) programme('rare', maintenant, 0.5);
        rappel.current?.();
      }
    }, ECHANGE);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [etape, fini, total, b.echanges, jeGagne]);

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

  if (!hote || !adversaire) return null;

  const courant = fini ? b.echanges[total - 1] : b.echanges[etape];
  const gagnantCourant = courant ? gagnantEchange(courant) : null;
  const jauges = !fini && phase === 'arme' ? null : courant;
  const nomVainqueur = vainqueurHote ? hote.pseudo : adversaire.pseudo;
  const botGagne = adversaire.bot && !vainqueurHote;
  const jeJoue = moiId !== null && b.camps.some((c) => c.id === moiId);

  /*
   * Un duel dont on n'a que l'issue : joué aux cartes, avant le duel de
   * flocons, ou dont les lancers n'ont pas été conservés. Il n'y a rien à
   * rejouer — on dit qui a gagné, et quoi.
   */
  if (b.ancien || total === 0) {
    return (
      <div className="arene px-11 py-4 text-center">
        <p className="eyebrow">{b.ancien ? 'Ancien duel' : 'Duel sans relevé'}</p>
        <p className="mt-3 font-display text-2xl font-black text-ink uppercase">
          {b.ancien ? `${hote.pseudo} ${hote.manches} – ${adversaire.manches} ${adversaire.pseudo}` : `${hote.pseudo} – ${adversaire.pseudo}`}
        </p>
        <p className="mt-2 text-[15px] text-ink-2">
          {b.ancien ? 'Joué aux cartes, avant le duel de flocons.' : 'Les lancers de ce duel n’ont pas été conservés.'}{' '}
          {botGagne ? `Le Bot a gardé la mise de ${flakes(b.mise)} ❄.` : `${nomVainqueur} a raflé ${flakes(b.mise * 2)} ❄.`}
        </p>
      </div>
    );
  }

  return (
    <div className="arene" aria-live="polite">
      <Enjeu mise={b.mise} manches={b.manches} />

      {/* ---- La scène ---- */}
      <div className="duel-scene mt-7">
        <Combattant
          camp={hote}
          gagnees={score.hote}
          cible={cible}
          touche={!fini && phase === 'impact' && gagnantCourant === 'adversaire'}
          vainqueur={fini && vainqueurHote}
          perdant={fini && !vainqueurHote}
          moi={hote.id === moiId}
        />

        <div className="duel-piste" aria-hidden="true">
          <Jauges
            gauche={jauges ? jauges.hote : null}
            droite={jauges ? jauges.adversaire : null}
            vide={!fini && phase === 'arme'}
          />

          {/* La boule : du plus fort vers l'autre. Deux boules qui se croisent
              pour une égalité. */}
          {!fini && phase === 'vol' && gagnantCourant && (
            <span
              key={`b-${etape}`}
              className="duel-boule"
              data-vers={gagnantCourant === 'hote' ? 'droite' : 'gauche'}
            >
              <i />
            </span>
          )}
          {!fini && phase === 'vol' && !gagnantCourant && (
            <>
              <span key={`e1-${etape}`} className="duel-boule" data-vers="milieu-g">
                <i />
              </span>
              <span key={`e2-${etape}`} className="duel-boule" data-vers="milieu-d">
                <i />
              </span>
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
          gagnees={score.adversaire}
          cible={cible}
          touche={!fini && phase === 'impact' && gagnantCourant === 'hote'}
          vainqueur={fini && !vainqueurHote}
          perdant={fini && vainqueurHote}
          moi={adversaire.id === moiId}
        />
      </div>

      {/* ---- Ce qui se passe ---- */}
      <div className="mt-7 min-h-[76px] text-center">
        {!fini ? (
          <p className="font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
            {phase === 'arme' || phase === 'charge'
              ? `Échange ${etape + 1} — ils arment…`
              : gagnantCourant === null
                ? 'Égalité ! On relance.'
                : phase === 'vol'
                  ? `${gagnantCourant === 'hote' ? hote.pseudo : adversaire.pseudo} lance !`
                  : `${gagnantCourant === 'hote' ? hote.pseudo : adversaire.pseudo} touche !`}
          </p>
        ) : (
          <div className="duel-verdict">
            <p
              className={`font-display text-3xl font-black tracking-wide uppercase sm:text-4xl ${
                jeJoue && !jeGagne ? 'text-ink' : 'text-aurora'
              }`}
            >
              {jeGagne
                ? `Tu rafles ${flakes(b.mise * 2)} ❄`
                : botGagne
                  ? 'Le Bot garde la mise'
                  : `${nomVainqueur} rafle ${flakes(b.mise * 2)} ❄`}
            </p>
            <p className="mt-1 text-[15px] text-ink-2">
              {score.hote} – {score.adversaire} en {total} échange{total > 1 ? 's' : ''}
              {jeGagne ? ` · +${flakes(b.mise)} ❄ net` : jeJoue ? ` · −${flakes(b.mise)} ❄, la revanche t’attend` : ''}
            </p>
          </div>
        )}
      </div>

      {/* ---- Le relevé, échange par échange ---- */}
      <ol className="mt-4 flex min-h-[34px] flex-wrap justify-center gap-1.5" aria-label="Les lancers">
        {joues.map((e, i) => {
          const g = gagnantEchange(e);
          return (
            <li key={i} className="duel-releve">
              <span className="text-faint">#{i + 1}</span>
              <span className={g === 'hote' ? 'text-aurora' : 'text-muted'}>{e.hote}</span>
              <span className="text-faint">{g === null ? '=' : '·'}</span>
              <span className={g === 'adversaire' ? 'text-aurora' : 'text-muted'}>{e.adversaire}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
