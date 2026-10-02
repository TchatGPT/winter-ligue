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
 * L'animation tourne hors de React : une boucle d'images donne l'avancée de
 * chaque camp à la scène 3D (`components/duel3d`) — personnages modelés,
 * décor, caméra qui suit la course. Sans WebGL, les couloirs dessinés prennent
 * le relais, et la même boucle écrit leurs variables CSS.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Course3D, type ControleCourse3D } from '@/components/duel3d/Course3D';
import type { Donnees3D } from '@/components/duel3d/moteur';
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
/**
 * La boule de neige en pleine face : la ligne passée, le vainqueur se
 * retourne et lance. La boule touche le perdant à cet instant (en secondes
 * après l'arrivée) ; le verdict tombe un peu après.
 */
const IMPACT_BOULE = 1.1;
const FIN_BOULE = 2.2;
/** De part et d'autre d'un obstacle, la fenêtre où la boule tressaute. */
const AVANT_BOSSE = 0.012;
const APRES_BOSSE = 0.05;

const CAMPS: Camp[] = ['hote', 'adversaire'];

type EtatCouloir = 'depart' | 'course' | 'chute' | 'victoire';

/* -------------------------------------------------------------------------- */
/* Les dessins                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Le père Noël, de profil, penché sur sa boule, en volume.
 *
 * Il était dessiné en aplats, et se lisait comme une silhouette découpée. Il
 * est maintenant modelé : chaque pièce a sa lumière (en haut à gauche) et son
 * ombre, les membres sont des cylindres, la tête et le pompon des sphères ; les
 * pièces portent leur ombre les unes sur les autres — la barbe sur la poitrine,
 * le bonnet sur le front —, et le cuir, l'or et le nez ont leur reflet. La
 * jambe du fond est plus sombre que celle de devant.
 *
 * Les teintes des dégradés se déduisent des variables du couloir : le manteau
 * change d'un camp à l'autre, la peau du bot est d'acier. D'où des dégradés
 * propres à chaque dessin — deux couloirs, deux jeux d'identifiants.
 */
function PereNoel() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (nom: string) => `url(#${id}-${nom})`;

  return (
    <svg className="noel" viewBox="0 0 80 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-manteau`} cx="0.36" cy="0.26" r="0.8">
          <stop offset="0" className="noel-s-lumiere" />
          <stop offset="0.45" className="noel-s-base" />
          <stop offset="1" className="noel-s-ombre" />
        </radialGradient>
        <linearGradient id={`${id}-membre`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="noel-s-lumiere" />
          <stop offset="0.42" className="noel-s-base" />
          <stop offset="1" className="noel-s-ombre" />
        </linearGradient>
        <linearGradient id={`${id}-bras`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="noel-s-lumiere" />
          <stop offset="0.5" className="noel-s-base" />
          <stop offset="1" className="noel-s-ombre" />
        </linearGradient>
        <radialGradient id={`${id}-fourrure`} cx="0.34" cy="0.26" r="0.85">
          <stop offset="0" className="noel-s-fourrure-lumiere" />
          <stop offset="0.55" className="noel-s-fourrure" />
          <stop offset="1" className="noel-s-fourrure-ombre" />
        </radialGradient>
        <radialGradient id={`${id}-peau`} cx="0.42" cy="0.3" r="0.75">
          <stop offset="0" className="noel-s-peau-lumiere" />
          <stop offset="0.62" className="noel-s-peau" />
          <stop offset="1" className="noel-s-peau-ombre" />
        </radialGradient>
        <linearGradient id={`${id}-botte`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="noel-s-botte-lumiere" />
          <stop offset="0.45" className="noel-s-botte" />
          <stop offset="1" className="noel-s-botte-ombre" />
        </linearGradient>
        <linearGradient id={`${id}-or`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="noel-s-or-lumiere" />
          <stop offset="0.5" className="noel-s-or" />
          <stop offset="1" className="noel-s-or-ombre" />
        </linearGradient>
        <radialGradient id={`${id}-nez`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" className="noel-s-nez-lumiere" />
          <stop offset="0.55" className="noel-s-nez" />
          <stop offset="1" className="noel-s-nez-ombre" />
        </radialGradient>
      </defs>

      {/* La jambe du fond, dans l'ombre du corps. */}
      <g className="noel-jambe noel-jambe-arriere noel-loin">
        <rect x="27" y="62" width="10" height="24" rx="5" fill={u('membre')} className="noel-pantalon" />
        <ellipse cx="35" cy="90" rx="9" ry="5.5" fill={u('botte')} />
        <ellipse cx="32.5" cy="87.4" rx="4" ry="1.2" className="noel-reflet" />
      </g>

      <g className="noel-corps">
        <ellipse cx="38" cy="50" rx="17" ry="21" transform="rotate(14 38 50)" fill={u('manteau')} />
        {/* Les ombres que portent la barbe et la fourrure du bas. */}
        <ellipse cx="50" cy="42.5" rx="9.5" ry="6" className="noel-ao" />
        <path d="M21 59.5 Q36 71.5 54 58.5 L54.4 62 Q37 75 21 63 Z" className="noel-ao" />
        <path d="M21 62 Q36 74 54 61 L55 67 Q37 80 21 68 Z" fill={u('fourrure')} />
        {/* La ceinture, son liseré de lumière, sa boucle d'or. */}
        <path d="M22 50 Q38 60 56 48 L57 54 Q39 66 22 56 Z" fill={u('botte')} />
        <path d="M23 51.2 Q38 60.6 55.8 49.2" className="noel-lisere" />
        <g transform="rotate(-14 46 54)">
          <rect x="42" y="50" width="8" height="8" rx="1.5" fill={u('or')} />
          <rect x="44.2" y="52.2" width="3.6" height="3.6" rx="0.6" fill={u('botte')} />
          <rect x="42.9" y="50.7" width="3.2" height="1.1" rx="0.55" className="noel-reflet" />
        </g>
      </g>

      <g className="noel-jambe noel-jambe-avant">
        <rect x="35" y="62" width="10" height="24" rx="5" fill={u('membre')} className="noel-pantalon" />
        <ellipse cx="43" cy="90" rx="9" ry="5.5" fill={u('botte')} />
        <ellipse cx="40.5" cy="87.4" rx="4" ry="1.2" className="noel-reflet" />
      </g>

      {/* Le bras tendu, un cylindre ; le poignet de fourrure, la moufle contre la boule. */}
      <path d="M44 41 Q58 44 69 52" stroke={u('bras')} className="noel-bras" />
      <ellipse cx="65.5" cy="50.2" rx="3.1" ry="5.2" transform="rotate(35 65.5 50.2)" fill={u('fourrure')} />
      <circle cx="71" cy="53" r="6" fill={u('fourrure')} />
      <ellipse cx="69" cy="50.4" rx="2.3" ry="1.3" className="noel-reflet" />

      {/* La tête : une sphère ; la joue rosit, le bonnet ombre le front. */}
      <circle cx="51" cy="25" r="10" fill={u('peau')} />
      <circle cx="57" cy="27.6" r="3.4" className="noel-joue" />
      <ellipse cx="52" cy="22.6" rx="9" ry="1.6" className="noel-ao noel-ao-douce" />
      <path d="M42 27 Q43 44 56 42 Q65 38 61 26 Q56 33 50 30 Q45 31 42 27 Z" fill={u('fourrure')} />
      <path d="M46.2 32.5 q0.6 3.4 2.6 5.6 M51 34 q0.4 3.6 2.4 5.8 M56.4 33.4 q0.8 3 3 4.4" className="noel-boucles" />
      <path d="M54.6 29.6 Q58 27.4 61.4 29.4 Q63.8 31.4 61.2 32.2 Q58.2 30.6 55.6 32.2 Q52.9 31.6 54.6 29.6 Z" fill={u('fourrure')} />
      <circle cx="61" cy="27" r="2.4" fill={u('nez')} />
      <circle cx="60.2" cy="26.1" r="0.7" className="noel-reflet" />
      {/* L'œil, juste sous le revers du bonnet, qui lui fait sourcil. */}
      <circle cx="56.2" cy="24.6" r="1.35" className="noel-oeil" />
      <circle cx="56.6" cy="24.1" r="0.42" className="noel-reflet" />

      {/* Le bonnet, sa pointe qui retombe, son pompon, son revers. */}
      <path d="M40 20 Q40 4 58 9 Q50 11 49 17 Z" fill={u('manteau')} />
      <path d="M58 9 Q40 2 27 14" stroke={u('bras')} className="noel-bonnet" />
      <circle cx="26" cy="15" r="5" fill={u('fourrure')} />
      <circle cx="24.5" cy="13.3" r="1.4" className="noel-reflet" />
      <rect x="39" y="15" width="25" height="7" rx="3.5" transform="rotate(12 51 18)" fill={u('fourrure')} />
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
      data-chute={
        course && course.perdant === camp
          ? course.chute.type === 'boule' || course.chute.type === 'essouffle'
            ? 'glisse'
            : course.chute.type
          : undefined
      }
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
        {/* L'ombre de contact : au sol, elle ne suit ni le saut ni la chute. */}
        <span className="noel-ombre" />
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
      <p className="mt-1 font-display text-[13px] font-bold tracking-[0.12em] text-muted uppercase">
        Pour le gagnant · {flakes(mise)} ❄ misés chacun
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
  const [en3d, setEn3d] = useState(true);
  const controle = useRef<ControleCourse3D | null>(null);
  const donnees = useMemo<Donnees3D>(
    () => ({
      bots: { hote: gauche.bot, adversaire: droite.bot },
      obstacles: { hote: [], adversaire: [] },
      chute: null,
    }),
    [gauche.bot, droite.bot],
  );

  return (
    <div className="arene" aria-live="polite" aria-busy="true">
      <Enjeu mise={mise} />
      {en3d ? (
        <div className="mt-6">
          <Course3D
            donnees={donnees}
            noms={{
              hote: { pseudo: gauche.pseudo, moi: moi === 'gauche' },
              adversaire: { pseudo: droite.pseudo, moi: moi === 'droite' },
            }}
            surControle={(c) => {
              controle.current = c;
            }}
            onIndisponible={() => setEn3d(false)}
          />
        </div>
      ) : (
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
      )}
      <div className="arene-recit">
        <p className="font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
          {droite.bot ? 'Le Bot tasse sa boule de neige…' : 'Les deux joueurs tassent leur boule…'}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* La course                                                                  */
/* -------------------------------------------------------------------------- */

/** `lancer` : la ligne passée, le vainqueur se retourne, boule de neige en main. */
type Phase = 'course' | 'lancer' | 'chute' | 'fini';

/** Ce que dit la chute, selon ce qui l'a causée. */
function recitChute(course: Course, nom: string): string {
  if (course.chute.type === 'boule') return `${nom} se prend une boule de neige en pleine face !`;
  if (course.chute.type === 'essouffle') return `${nom} s’écroule, à bout de souffle !`;
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
  /** La scène 3D ; sans WebGL, les couloirs dessinés la remplacent. */
  const [en3d, setEn3d] = useState(true);
  const controle = useRef<ControleCourse3D | null>(null);
  const donnees3d = useMemo<Donnees3D | null>(
    () =>
      course
        ? {
            bots: { hote: hote?.bot ?? false, adversaire: adversaire?.bot ?? false },
            obstacles: { hote: course.couloirs.hote.obstacles, adversaire: course.couloirs.adversaire.obstacles },
            chute: { camp: course.perdant, type: course.chute.type, position: course.chute.position },
            fete: course.fete,
          }
        : null,
    [course, hote?.bot, adversaire?.bot],
  );

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

    /**
     * Donne l'avancée d'un camp à la scène 3D — et, sans elle, l'écrit dans
     * les variables CSS de son couloir. Le tressaut se lit sur les obstacles
     * de la course, pas sur le DOM : la scène 3D n'en a pas.
     */
    const pose = (camp: Camp, p: number, tombe: boolean) => {
      let saut = 0;
      for (const o of course.couloirs[camp].obstacles) {
        const fatal = course.perdant === camp && o.position === course.chute.position;
        if (fatal) continue;
        const x = (p - (o.position - AVANT_BOSSE)) / (AVANT_BOSSE + APRES_BOSSE);
        if (x > 0 && x < 1) saut = Math.max(saut, Math.sin(Math.PI * x));
      }
      controle.current?.pose(camp, p, tombe ? 0 : saut, tombe);

      const el = couloirs.current[camp];
      if (!el) return;
      for (const o of el.querySelectorAll<HTMLElement>('[data-obstacle]')) {
        if (p > Number(o.dataset.obstacle) + AVANT_BOSSE) o.dataset.passe = '';
        else delete o.dataset.passe;
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
    /** La boule de neige en pleine face : le temps écoulé depuis l'arrivée, en secondes. */
    const boule = course.chute.type === 'boule';
    let apres = -1;

    const pas = (t: number) => {
      const dt = avant === null ? 0 : Math.min(64, t - avant);
      avant = t;
      u = Math.min(1, u + (dt / DUREE) * (tombe ? HATE : 1));

      if (!tombe && !boule && u >= course.chute.instant) {
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

      if (u >= 1 && boule) {
        // La ligne passée : il se retourne, lance, et la boule touche l'autre.
        if (apres < 0) {
          apres = 0;
          roule.hote.arrete();
          roule.adversaire.arrete();
          setPhase('lancer');
        } else {
          apres += dt / 1000;
        }
        if (!tombe && apres >= IMPACT_BOULE) {
          tombe = true;
          sonFracas();
          setPhase('chute');
        }
        if (apres < FIN_BOULE) {
          image = requestAnimationFrame(pas);
          return;
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

  // La scène 3D suit l'état de chaque camp : course, lancer, chute, victoire.
  useEffect(() => {
    if (!course) return;
    const boule = course.chute.type === 'boule';
    for (const camp of CAMPS) {
      let etat: 'course' | 'depart' | 'lancer' | 'chute' | 'victoire';
      if (course.perdant === camp) {
        // Battu d'un rien, il s'arrête juste après la ligne — et attend la boule.
        etat = phase === 'course' ? 'course' : phase === 'lancer' ? 'depart' : 'chute';
      } else if (phase === 'fini') {
        etat = 'victoire';
      } else {
        etat = boule && phase !== 'course' ? 'lancer' : 'course';
      }
      controle.current?.etat(camp, etat);
    }
  }, [course, phase, en3d]);

  if (!hote || !adversaire || !course || !donnees3d) return null;

  const noms: Record<Camp, string> = { hote: hote.pseudo, adversaire: adversaire.pseudo };
  const botGagne = adversaire.bot && course.vainqueur === 'adversaire';
  const tirage = b.echanges.at(-1);

  const etatDe = (camp: Camp): EtatCouloir => {
    if (course.perdant === camp) return phase === 'course' || phase === 'lancer' ? 'course' : 'chute';
    return phase === 'fini' ? 'victoire' : 'course';
  };

  return (
    <div className="arene" aria-live="polite">
      <Enjeu mise={b.mise} />

      {en3d ? (
        <div className="mt-6">
          <Course3D
            donnees={donnees3d}
            noms={{
              hote: { pseudo: hote.pseudo, moi: hote.id === moiId },
              adversaire: { pseudo: adversaire.pseudo, moi: adversaire.id === moiId },
            }}
            surControle={(c) => {
              controle.current = c;
            }}
            onIndisponible={() => setEn3d(false)}
          />
        </div>
      ) : (
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
      )}

      {/* ---- Ce qui se passe ---- */}
      <div className="arene-recit">
        {phase === 'course' && (
          <p className="font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
            {tete === null ? 'Au coude à coude…' : `${noms[tete]} prend la tête`}
          </p>
        )}
        {phase === 'lancer' && (
          <p className="font-display text-lg font-black tracking-wide text-ink uppercase sm:text-xl">
            {noms[course.vainqueur]} passe la ligne… et se retourne !
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
