'use client';

/**
 * L'arène du duel : une course de boules de neige.
 *
 * Deux pères Noël, un par couloir, poussent chacun une boule qui grossit en
 * roulant. Elle passe les obstacles en tressautant — jusqu'à celui de trop.
 * Le premier qui tombe a perdu ; l'autre file jusqu'à la ligne et rafle le pot.
 *
 * Tout est déjà décidé par le serveur. La course (`lib/domain/course.ts`) ne
 * fait que raconter un résultat acquis, sans le trahir : les deux couloirs se
 * ressemblent, la tête change de camp, et c'est une fois sur deux celui qui
 * menait qui tombe. Recharger ou fermer ne change rien.
 *
 * L'animation tourne hors de React : une boucle d'images écrit l'avancée dans
 * des variables CSS du couloir. Soixante rendus par seconde pour déplacer deux
 * boules, ce serait cher payé.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  demarreRoulement,
  sonBosse,
  sonDefaite,
  sonDepart,
  sonFracas,
  sonGrelots,
  type Roulement,
} from '@/components/sonsDuel';
import { flakes } from '@/components/ui';
import type { Camp, Echange } from '@/lib/domain/bataille';
import { avancee, ecritCourse, meneur, type Course, type GenreObstacle } from '@/lib/domain/course';

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

export function initiale(camp: CampApercu): string {
  return camp.bot ? '🤖' : (camp.pseudo.trim()[0] ?? '?').toUpperCase();
}

/** La durée de la course, du départ à la ligne. */
const DUREE = 7600;
/** Après la chute, le vainqueur finit plus vite : on sait, inutile de traîner. */
const HATE = 1.9;
/** De part et d'autre d'un obstacle, la fenêtre où la boule tressaute. */
const AVANT_BOSSE = 0.012;
const APRES_BOSSE = 0.05;

const CAMPS: Camp[] = ['hote', 'adversaire'];

type EtatCouloir = 'depart' | 'course' | 'chute' | 'victoire';

/* -------------------------------------------------------------------------- */
/* Les dessins                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Le père Noël, de profil, penché sur sa boule. Les couleurs viennent des
 * variables du couloir : le manteau change d'un camp à l'autre.
 */
function PereNoel() {
  return (
    <svg className="noel" viewBox="0 0 80 100" aria-hidden="true">
      {/* La jambe arrière, puis le corps, puis la jambe avant : l'ordre du dessin. */}
      <g className="noel-jambe noel-jambe-arriere">
        <rect x="27" y="62" width="10" height="24" rx="5" className="noel-pantalon" />
        <ellipse cx="35" cy="90" rx="9" ry="5.5" className="noel-botte" />
      </g>
      <g className="noel-corps">
        <ellipse cx="38" cy="50" rx="17" ry="21" transform="rotate(14 38 50)" className="noel-manteau" />
        <path d="M21 62 Q36 74 54 61 L55 67 Q37 80 21 68 Z" className="noel-fourrure" />
        <path d="M22 50 Q38 60 56 48 L57 54 Q39 66 22 56 Z" className="noel-botte" />
        <rect x="42" y="50" width="8" height="8" rx="1.5" transform="rotate(-14 46 54)" className="noel-boucle" />
      </g>
      <g className="noel-jambe noel-jambe-avant">
        <rect x="35" y="62" width="10" height="24" rx="5" className="noel-pantalon" />
        <ellipse cx="43" cy="90" rx="9" ry="5.5" className="noel-botte" />
      </g>
      {/* Le bras tendu, moufle contre la boule. */}
      <path d="M44 41 Q58 44 69 52" className="noel-bras" />
      <circle cx="71" cy="53" r="6" className="noel-fourrure" />
      {/* La tête : le visage, la barbe, le bonnet et son pompon. */}
      <circle cx="51" cy="25" r="10" className="noel-peau" />
      <path d="M42 27 Q43 44 56 42 Q65 38 61 26 Q56 33 50 30 Q45 31 42 27 Z" className="noel-fourrure" />
      <circle cx="61" cy="27" r="2.4" className="noel-nez" />
      <circle cx="55" cy="22" r="1.5" className="noel-oeil" />
      <path d="M40 20 Q40 4 58 9 Q50 11 49 17 Z" className="noel-manteau" />
      <path d="M58 9 Q40 2 27 14" className="noel-bonnet" />
      <circle cx="26" cy="15" r="5" className="noel-fourrure" />
      <rect x="39" y="15" width="25" height="7" rx="3.5" transform="rotate(12 51 18)" className="noel-fourrure" />
    </svg>
  );
}

/** Un obstacle du couloir. Celui qui fait tomber ressemble aux autres. */
function DessinObstacle({ genre }: { genre: GenreObstacle }) {
  if (genre === 'rocher') {
    return (
      <svg viewBox="0 0 40 28" aria-hidden="true">
        <path d="M2 28 L8 10 L19 3 L31 9 L38 28 Z" className="obstacle-roche" />
        <path d="M8 10 L19 3 L31 9 L24 12 L15 9 Z" className="obstacle-neige" />
      </svg>
    );
  }
  if (genre === 'souche') {
    return (
      <svg viewBox="0 0 40 28" aria-hidden="true">
        <path d="M8 28 L10 9 L30 9 L32 28 Z" className="obstacle-bois" />
        <ellipse cx="20" cy="9" rx="10.5" ry="4.5" className="obstacle-coupe" />
        <ellipse cx="20" cy="8" rx="9" ry="3.2" className="obstacle-neige" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 28" aria-hidden="true">
      <ellipse cx="20" cy="24" rx="19" ry="4" className="obstacle-glace" />
      <path d="M8 23 L17 22 M21 25 L31 24" className="obstacle-reflet" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Le couloir                                                                 */
/* -------------------------------------------------------------------------- */

function Couloir({
  camp,
  apercu,
  moi,
  course,
  etat,
  attache,
}: {
  camp: Camp;
  apercu: CampApercu;
  moi: boolean;
  course: Course | null;
  etat: EtatCouloir;
  attache: (el: HTMLDivElement | null) => void;
}) {
  const obstacles = course?.couloirs[camp].obstacles ?? [];
  return (
    <div
      ref={attache}
      className="couloir"
      data-camp={camp}
      data-bot={apercu.bot ? '' : undefined}
      data-etat={etat}
      data-chute={course && course.perdant === camp ? course.chute.type : undefined}
    >
      <p className="couloir-nom">
        <b>{apercu.pseudo}</b>
        {moi && <span>toi</span>}
      </p>

      <span className="couloir-arrivee" aria-hidden="true" />

      {obstacles.map((o) => (
        <span
          key={o.position}
          className="obstacle"
          data-obstacle={o.position}
          data-genre={o.genre}
          style={{ ['--q' as string]: o.position }}
          aria-hidden="true"
        >
          <DessinObstacle genre={o.genre} />
        </span>
      ))}

      <div className="attelage" aria-hidden="true">
        <PereNoel />
        <span className="boule">
          <i />
        </span>
        {/* La boule en morceaux : ils ne partent qu'à la chute. */}
        <span className="eclats">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </div>

      <span className="couloir-sol" aria-hidden="true" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* L'enjeu                                                                    */
/* -------------------------------------------------------------------------- */

function Enjeu({ mise }: { mise: number }) {
  return (
    // Les marges latérales dégagent la croix de fermeture, en haut à droite.
    <header className="flex flex-col items-center px-11 text-center">
      <p className="eyebrow">Duel de flocons · le premier qui tombe a perdu</p>
      <p className="arene-pot">
        {flakes(mise * 2)} <span className="text-ice">❄</span>
      </p>
      <p className="mt-1 font-display text-[12px] font-bold tracking-[0.2em] text-muted uppercase">
        Pour le gagnant · {flakes(mise)} ❄ misés par camp
      </p>
    </header>
  );
}

/**
 * L'arène avant la réponse du serveur : les deux pères Noël sur la ligne de
 * départ. Elle s'ouvre au clic, sans attendre le réseau.
 */
export function ArenePreparation({
  gauche,
  droite,
  mise,
  moi,
}: {
  gauche: CampApercu;
  droite: CampApercu;
  mise: number;
  /** De quel côté se tient le joueur : l'hôte s'il lance le duel, l'autre s'il en relève un. */
  moi: 'gauche' | 'droite';
}) {
  return (
    <div className="arene" aria-live="polite" aria-busy="true">
      <Enjeu mise={mise} />
      <div className="course mt-6">
        <Couloir camp="hote" apercu={gauche} moi={moi === 'gauche'} course={null} etat="depart" attache={() => {}} />
        <Couloir
          camp="adversaire"
          apercu={droite}
          moi={moi === 'droite'}
          course={null}
          etat="depart"
          attache={() => {}}
        />
      </div>
      <div className="arene-recit">
        <p className="font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
          {droite.bot ? 'Le Bot tasse sa boule de neige…' : 'Les deux camps tassent leur boule…'}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* La course                                                                  */
/* -------------------------------------------------------------------------- */

type Phase = 'course' | 'chute' | 'fini';

/** Ce que dit la chute, selon ce qui l'a causée. */
function recitChute(course: Course, nom: string): string {
  if (course.chute.type === 'eclate') return `La boule de ${nom} éclate !`;
  if (course.chute.type === 'glisse') return `${nom} glisse sur la glace !`;
  const fatal = course.couloirs[course.perdant].obstacles.find((o) => o.position === course.chute.position);
  return fatal?.genre === 'souche' ? `${nom} percute une souche !` : `${nom} percute un rocher !`;
}

export function BatailleArene({
  bataille,
  moiId,
  anime,
  onFini,
}: {
  bataille: BatailleVueClient;
  moiId: string | null;
  /** Jouer la course, ou montrer d'emblée l'arrivée. */
  anime: boolean;
  /** Appelé quand le vainqueur a passé la ligne. */
  onFini?: () => void;
}) {
  const b = bataille;
  const hote = b.camps[0];
  const adversaire = b.camps[1];
  const vainqueur: Camp | null =
    b.vainqueurId === null ? null : b.vainqueurId === hote?.id ? 'hote' : 'adversaire';

  const course = useMemo(() => (vainqueur ? ecritCourse(b.id, vainqueur) : null), [b.id, vainqueur]);

  const [phase, setPhase] = useState<Phase>(anime ? 'course' : 'fini');
  /** Qui mène, pour le commentaire. */
  const [tete, setTete] = useState<Camp | null>(null);

  const couloirs = useRef<Record<Camp, HTMLDivElement | null>>({ hote: null, adversaire: null });

  // Le rappel de fin change à chaque rendu du parent : on garde le dernier,
  // sans relancer la course pour autant.
  const rappel = useRef(onFini);
  useEffect(() => {
    rappel.current = onFini;
  }, [onFini]);

  const jeGagne = moiId !== null && b.vainqueurId === moiId;
  const jeJoue = moiId !== null && b.camps.some((c) => c.id === moiId);

  useEffect(() => {
    if (!course) return;

    /** Écrit l'avancée d'un camp dans son couloir. */
    const pose = (camp: Camp, p: number, tombe: boolean) => {
      const el = couloirs.current[camp];
      if (!el) return;
      let saut = 0;
      for (const o of el.querySelectorAll<HTMLElement>('[data-obstacle]')) {
        const q = Number(o.dataset.obstacle);
        const fatal = course.perdant === camp && q === course.chute.position;
        if (fatal) continue;
        if (p > q + AVANT_BOSSE) o.dataset.passe = '';
        else delete o.dataset.passe;
        const x = (p - (q - AVANT_BOSSE)) / (AVANT_BOSSE + APRES_BOSSE);
        if (x > 0 && x < 1) saut = Math.max(saut, Math.sin(Math.PI * x));
      }
      el.style.setProperty('--p', p.toFixed(4));
      el.style.setProperty('--saut', tombe ? '0' : saut.toFixed(3));
      el.style.setProperty('--tour', `${Math.round(p * 1500)}deg`);
    };

    if (!anime) {
      for (const camp of CAMPS) {
        const perd = course.perdant === camp;
        pose(camp, perd ? course.chute.position : 1, perd);
      }
      return;
    }

    const roule: Record<Camp, Roulement> = { hote: demarreRoulement(), adversaire: demarreRoulement() };
    const bosses: Record<Camp, number> = { hote: 0, adversaire: 0 };
    sonDepart();

    let u = 0;
    let avant: number | null = null;
    let tombe = false;
    let meneurAffiche: Camp | null = null;
    let image = 0;

    const pas = (t: number) => {
      const dt = avant === null ? 0 : Math.min(64, t - avant);
      avant = t;
      u = Math.min(1, u + (dt / DUREE) * (tombe ? HATE : 1));

      if (!tombe && u >= course.chute.instant) {
        tombe = true;
        roule[course.perdant].arrete();
        sonFracas();
        setPhase('chute');
      }

      for (const camp of CAMPS) {
        const perd = course.perdant === camp;
        const p = perd && tombe ? course.chute.position : avancee(course.couloirs[camp].allure, u);
        pose(camp, p, perd && tombe);
        if (perd && tombe) continue;
        roule[camp].regle(p);
        // Une bosse par obstacle franchi.
        const franchis = course.couloirs[camp].obstacles.filter(
          (o) => p > o.position && !(perd && o.position === course.chute.position),
        ).length;
        if (franchis > bosses[camp]) {
          bosses[camp] = franchis;
          sonBosse(p);
        }
      }

      if (!tombe) {
        const m = meneur(course, u);
        if (m !== meneurAffiche) {
          meneurAffiche = m;
          setTete(m);
        }
      }

      if (u >= 1) {
        roule[course.vainqueur].arrete();
        if (jeJoue && !jeGagne) sonDefaite();
        else sonGrelots();
        setPhase('fini');
        rappel.current?.();
        return;
      }
      image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);

    return () => {
      cancelAnimationFrame(image);
      roule.hote.arrete();
      roule.adversaire.arrete();
    };
  }, [course, anime, jeGagne, jeJoue]);

  if (!hote || !adversaire || !course) return null;

  const noms: Record<Camp, string> = { hote: hote.pseudo, adversaire: adversaire.pseudo };
  const botGagne = adversaire.bot && course.vainqueur === 'adversaire';
  const tirage = b.echanges.at(-1);

  const etatDe = (camp: Camp): EtatCouloir => {
    if (course.perdant === camp) return phase === 'course' ? 'course' : 'chute';
    return phase === 'fini' ? 'victoire' : 'course';
  };

  return (
    <div className="arene" aria-live="polite">
      <Enjeu mise={b.mise} />

      <div className="course mt-6">
        <Couloir
          camp="hote"
          apercu={hote}
          moi={hote.id === moiId}
          course={course}
          etat={etatDe('hote')}
          attache={(el) => {
            couloirs.current.hote = el;
          }}
        />
        <Couloir
          camp="adversaire"
          apercu={adversaire}
          moi={adversaire.id === moiId}
          course={course}
          etat={etatDe('adversaire')}
          attache={(el) => {
            couloirs.current.adversaire = el;
          }}
        />
      </div>

      {/* ---- Ce qui se passe ---- */}
      <div className="arene-recit">
        {phase === 'course' && (
          <p className="font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
            {tete === null ? 'Au coude à coude…' : `${noms[tete]} prend la tête`}
          </p>
        )}
        {phase === 'chute' && (
          <p className="duel-verdict font-display text-xl font-black tracking-wide text-gold uppercase sm:text-2xl">
            {recitChute(course, noms[course.perdant])}
          </p>
        )}
        {phase === 'fini' && (
          <div className="duel-verdict">
            <p
              className={`font-display text-3xl font-black tracking-wide uppercase sm:text-4xl ${
                jeJoue && !jeGagne ? 'text-ink' : 'text-aurora'
              }`}
            >
              {jeGagne
                ? `Tu rafles ${flakes(b.mise * 2)} ❄`
                : jeJoue
                  ? `Tu perds ta mise : −${flakes(b.mise)} ❄`
                  : botGagne
                    ? 'Le Bot garde la mise'
                    : `${noms[course.vainqueur]} rafle ${flakes(b.mise * 2)} ❄`}
            </p>
            <p className="mt-1 text-[15px] text-ink-2">
              {recitChute(course, noms[course.perdant])}
              {jeGagne ? ` Tu gagnes ${flakes(b.mise)} ❄ net.` : jeJoue ? ' La revanche t’attend.' : ''}
            </p>
            {tirage && !b.ancien && (
              <p className="mt-1 text-[12.5px] text-faint">
                Tirage du serveur : {tirage.hote} pour {hote.pseudo}, {tirage.adversaire} pour {adversaire.pseudo}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
