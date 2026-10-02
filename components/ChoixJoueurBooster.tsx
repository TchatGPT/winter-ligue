'use client';

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { libelleMultiplicateur } from '@/lib/domain/rules';

export interface CandidatBooster {
  id: string;
  pseudo: string;
  avatarUrl: string | null;
  chance: number;
  /** Combien de boosters de ce type l'attendent. */
  n: number;
}

/** La place que le panneau veut sous le champ ; s'il en manque, il s'ouvre au-dessus. */
const HAUTEUR_VOULUE = 360;
/** Entre le champ et le panneau. */
const ECART = 6;
/** Entre le panneau et le bord de l'écran. */
const MARGE = 12;

const rienAEcouter = () => () => {};

/** Sans accent ni casse, pour que « Boreal » trouve « Boréal ». */
const plat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

interface Place {
  left: number;
  width: number;
  /** Ouvert dessous : son haut. */
  top?: number;
  /** Ouvert dessus : son bas, compté depuis le bas de l'écran. */
  bottom?: number;
  maxHeight: number;
}

/** Où poser le panneau : sous le champ, ou au-dessus s'il manque de place dessous. */
function placeDu(champ: HTMLElement): Place {
  const r = champ.getBoundingClientRect();
  const dessous = window.innerHeight - r.bottom - ECART - MARGE;
  const dessus = r.top - ECART - MARGE;
  const enHaut = dessous < HAUTEUR_VOULUE && dessus > dessous;
  const maxHeight = Math.max(180, Math.min(HAUTEUR_VOULUE + 80, enHaut ? dessus : dessous));
  return enHaut
    ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + ECART, maxHeight }
    : { left: r.left, width: r.width, top: r.bottom + ECART, maxHeight };
}

function Avatar({ c }: { c: CandidatBooster }) {
  return c.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="choix-joueur-avatar" src={c.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="choix-joueur-avatar" aria-hidden="true">
      {c.pseudo.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Pour qui s'ouvre un booster personnel (Perso, Finisseur) : un champ qui
 * montre le joueur choisi — son avatar, son pseudo, combien l'attendent. Un
 * clic déroule sous lui un panneau avec une recherche, et seulement les
 * joueurs qui ont un booster de ce type à ouvrir : un joueur sans booster dû
 * ne peut pas être choisi, il n'a rien à faire dans la liste. Trente joueurs
 * concernés tiennent dans le panneau, qui défile ; la scène, elle, ne bouge
 * pas.
 *
 * Seul candidat, il est choisi d'office (voir `PackOpening`). Au clavier : les
 * flèches parcourent, Entrée choisit, Échap ferme. Le panneau passe par un
 * portail vers <body> : la scène coupe ce qui déborde, et les plaques de verre
 * portent un backdrop-filter qui piégerait un panneau fixe.
 *
 * Le choix ne fait que désigner : le serveur revérifie ce qui est dû.
 */
export function ChoixJoueurBooster({
  candidats,
  choisi,
  onChoix,
  fige,
  nomBooster,
  cache,
}: {
  candidats: CandidatBooster[];
  choisi: string;
  onChoix: (id: string) => void;
  fige: boolean;
  nomBooster: string;
  /** Booster collectif : le champ reste là, invisible, pour garder la hauteur de la scène. */
  cache?: boolean;
}) {
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  const [ouvert, setOuvert] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [recherche, setRecherche] = useState('');
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLButtonElement>(null);
  const panneau = useRef<HTMLDivElement>(null);
  const saisie = useRef<HTMLInputElement>(null);
  const idListe = useId();

  // Une ouverture qui commence referme le panneau : il ne revient pas tout
  // seul une fois la carte posée.
  const [figeAvant, setFigeAvant] = useState(fige);
  if (fige !== figeAvant) {
    setFigeAvant(fige);
    if (fige) setOuvert(false);
  }

  const visibles = useMemo(() => {
    const q = plat(recherche.trim());
    return q ? candidats.filter((c) => plat(c.pseudo).includes(q)) : candidats;
  }, [candidats, recherche]);
  const indexActif = Math.min(actif, visibles.length - 1);
  const courant = candidats.find((c) => c.id === choisi) ?? null;
  const montre = ouvert && navigateur && place !== null && !cache && candidats.length > 0;

  function ouvre() {
    if (!champ.current) return;
    setPlace(placeDu(champ.current));
    setRecherche('');
    setActif(Math.max(0, candidats.findIndex((c) => c.id === choisi)));
    setOuvert(true);
  }

  function ferme() {
    setOuvert(false);
    champ.current?.focus();
  }

  function choisis(id: string) {
    onChoix(id);
    ferme();
  }

  function clavier(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActif(Math.min(indexActif + 1, visibles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActif(Math.max(indexActif - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = visibles[indexActif];
      if (c) choisis(c.id);
    } else if (e.key === 'Tab') {
      setOuvert(false);
    }
  }

  // Ouvert, il suit le champ quand la page défile ou change de taille, et se
  // ferme sur un clic ailleurs ou sur Échap.
  useEffect(() => {
    if (!montre) return;
    const replace = () => {
      if (champ.current) setPlace(placeDu(champ.current));
    };
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (panneau.current?.contains(cible) || champ.current?.contains(cible)) return;
      setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOuvert(false);
      champ.current?.focus();
    };
    window.addEventListener('resize', replace);
    window.addEventListener('scroll', replace, true);
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      window.removeEventListener('resize', replace);
      window.removeEventListener('scroll', replace, true);
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [montre]);

  // À la souris, la recherche prend le focus ; au doigt, elle attend qu'on la
  // touche : pas de clavier qui surgit et cache la liste.
  useEffect(() => {
    if (montre && window.matchMedia('(pointer: fine)').matches) saisie.current?.focus();
  }, [montre]);

  // Au clavier, l'option active reste en vue.
  useEffect(() => {
    if (montre) panneau.current?.querySelector('[data-actif]')?.scrollIntoView({ block: 'nearest' });
  }, [montre, indexActif]);

  if (candidats.length === 0) {
    return (
      <p className={`choix-joueur-vide ${cache ? 'invisible' : ''}`} aria-hidden={cache || undefined}>
        Aucun {nomBooster} à ouvrir pour l’instant. Le compteur de chaque joueur se règle dans Modération → Joueurs.
      </p>
    );
  }

  return (
    <>
      <button
        ref={champ}
        type="button"
        className={`field choix-joueur-champ ${cache ? 'invisible' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={montre}
        aria-hidden={cache || undefined}
        onClick={() => (montre ? ferme() : ouvre())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            ouvre();
          }
        }}
        disabled={fige}
      >
        {courant ? (
          <>
            <Avatar c={courant} />
            <span className="choix-joueur-pseudo">{courant.pseudo}</span>
            <span className="choix-joueur-nombre">
              <strong>{courant.n}</strong> à ouvrir
            </span>
          </>
        ) : (
          <span className="choix-joueur-invite">
            Pour quel joueur ?{' '}
            <span className="choix-joueur-invite-n">
              {candidats.length} en attente
            </span>
          </span>
        )}
      </button>

      {montre &&
        createPortal(
          <div ref={panneau} className="choix-joueur-panneau" style={place}>
            <input
              ref={saisie}
              type="search"
              className="field"
              placeholder="Chercher un joueur…"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setActif(0);
              }}
              onKeyDown={clavier}
              role="combobox"
              aria-expanded="true"
              aria-controls={idListe}
              aria-autocomplete="list"
              aria-activedescendant={visibles[indexActif] ? `${idListe}-${indexActif}` : undefined}
              aria-label="Chercher un joueur"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="choix-joueur-compte">
              {candidats.length} joueur{candidats.length > 1 ? 's' : ''} avec un {nomBooster} à ouvrir
            </p>
            <ul id={idListe} role="listbox" aria-label="Pour quel joueur ouvrir" className="choix-joueur-options">
              {visibles.map((c, i) => (
                <li
                  key={c.id}
                  id={`${idListe}-${i}`}
                  role="option"
                  aria-selected={c.id === choisi}
                  data-actif={i === indexActif ? '' : undefined}
                  className="choix-joueur-option"
                  onPointerMove={() => {
                    if (i !== indexActif) setActif(i);
                  }}
                  onClick={() => choisis(c.id)}
                >
                  <Avatar c={c} />
                  <span className="choix-joueur-pseudo">{c.pseudo}</span>
                  <span className="choix-joueur-chance num">chance {libelleMultiplicateur(c.chance)}</span>
                  <span className="choix-joueur-nombre">
                    <strong>{c.n}</strong> à ouvrir
                  </span>
                </li>
              ))}
              {visibles.length === 0 && (
                <li className="choix-joueur-aucun" role="presentation">
                  Personne ne s’appelle « {recherche.trim()} ».
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
