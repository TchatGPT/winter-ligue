'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SnowCap } from '@/components/SnowCap';
import { Notice } from '@/components/ui';
import { CardFrame } from '@/components/CardFrame';
import { IconActivision } from '@/components/icons';
import { getCard, RARITY_META } from '@/lib/domain/catalog';
import { sansTagClan } from '@/lib/domain/correspondance';
import { GAME_LIMITS, placementPoints } from '@/lib/domain/rules';
import type { Placement } from '@/lib/domain/types';

interface Joueur {
  id: string;
  pseudo: string;
  /** Son pseudo Activision, s'il l'a donné : c'est lui qu'on lit sur la capture. */
  activision?: string | null;
}

interface Ligne {
  /** La ligne de la streameuse : affichée, jamais saisie. */
  streameuse: boolean;
  lu: string;
  kills: number;
  assists: number | null;
  joueurId: string | null;
  confiance: number;
  /** ÉLIM./ASSIST. moins ASSIST., lus sur la capture : ils doivent tomber sur les kills. */
  attendu?: number | null;
  /** La modération sert le Joker du joueur : cette game ne comptera pas. */
  joker?: boolean;
}

/** Ce que le serveur annonce pour une ligne : le score, carte active comprise. */
interface Apercu {
  score: number;
  carte: { cardId: string; nom: string; points: number; resultat: string } | null;
  /** Vrai s'il garde un Joker. */
  joker: boolean;
  /** Les kills de la game, carte comprise. */
  kills?: number;
}
type Message = { kind: 'error' | 'success' | 'info'; text: string } | null;

/**
 * La capture est réduite avant l'envoi : 1568 px, la taille au-delà de
 * laquelle le modèle la réduirait de toute façon. Le tableau reste lisible,
 * l'envoi est plus court.
 */
const LARGEUR_MAX = 1568;

/** Top 6, 8 et 10 ne rapportent rien d'eux-mêmes : ils servent aux cartes. */
const TOPS: { valeur: Placement; libelle: string }[] = [
  { valeur: 1, libelle: 'Top 1' },
  { valeur: 2, libelle: 'Top 2' },
  { valeur: 3, libelle: 'Top 3' },
  { valeur: 6, libelle: 'Top 6' },
  { valeur: 8, libelle: 'Top 8' },
  { valeur: 10, libelle: 'Top 10' },
  { valeur: null, libelle: 'Pas top' },
];

/**
 * La saisie des games, au-dessus du classement, pour la modération.
 *
 * Une seule voie, comme sur la Summer Ligue : la capture de fin de game, lue
 * par le modèle, relue et validée par la modération. Chaque game passe
 * ensuite par la route habituelle, et c'est le serveur qui calcule le score
 * et les flocons. Il n'y a pas de saisie à la main.
 */
export function SaisieGames({ joueurs, reconnaissance }: { joueurs: Joueur[]; reconnaissance: boolean }) {
  const [ouverte, setOuverte] = useState(false);

  return (
    <>
      <div className="flex w-full sm:w-auto">
        <button
          type="button"
          className="btn btn-ice w-full sm:w-auto"
          onClick={() => setOuverte(true)}
          title={reconnaissance ? undefined : 'ANTHROPIC_API_KEY manque côté serveur'}
        >
          Saisir une game
        </button>
      </div>

      {ouverte && <FenetreIA joueurs={joueurs} active={reconnaissance} ferme={() => setOuverte(false)} />}
    </>
  );
}

/* ------------------------------ La fenêtre ------------------------------- */

function Fenetre({
  titre,
  large,
  ferme,
  children,
}: {
  titre: string;
  large?: boolean;
  ferme: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ferme();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ferme]);

  // Un portail vers <body> : la carte du classement porte un backdrop-filter,
  // qui ferait d'elle le bloc de référence d'un élément fixe. La fenêtre doit
  // se caler sur l'écran, pas sur la carte — sur mobile surtout.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fenetre-voile saisie-voile" role="dialog" aria-modal="true" aria-label={titre} onClick={ferme}>
      <div
        className={`fenetre-carte saisie-fenetre glass glass-reflet relative${large ? ' saisie-fenetre-large' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SnowCap radius="var(--r-lg)" seed="fenetre-saisie" epaisseur={14} />
        <header className="saisie-entete">
          <h2>{titre}</h2>
          <button type="button" className="btn btn-sm ml-auto" onClick={ferme} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="saisie-corps">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Le top de l'équipe, partagé : une pastille par place, ce qu'elle rapporte à côté. */
function ChoixTop({ valeur, onChange, disabled }: { valeur: Placement; onChange: (p: Placement) => void; disabled?: boolean }) {
  return (
    <div className="saisie-tops" role="group" aria-label="Top de l'équipe">
      {TOPS.map((t) => (
        <button
          key={String(t.valeur)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t.valeur)}
          aria-pressed={t.valeur === valeur}
        >
          <b>{t.libelle}</b>
          <span className="num">+{placementPoints(t.valeur)}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Avec l'IA -------------------------------- */

/**
 * Les kills du meilleur tueur de la partie : toutes les lignes lues sur la
 * capture, la streameuse et les coéquipiers hors ligue compris. C'est ce que
 * la carte « Clone kill du meilleur » copie.
 */
/** Le meilleur tueur de la partie, toutes lignes lues : son nom, sans marque de clan, et ses kills. */
function meilleurTueurDe(lignes: { lu: string; kills: number }[]): { nom: string; kills: number } | null {
  if (lignes.length === 0) return null;
  const tete = lignes.reduce((a, b) => (b.kills > a.kills ? b : a));
  return { nom: sansTagClan(tete.lu) || tete.lu, kills: tete.kills };
}

function meilleurKillsDe(lignes: { kills: number }[]): number | null {
  if (lignes.length === 0) return null;
  return Math.max(...lignes.map((l) => l.kills));
}

function FenetreIA({ joueurs, active, ferme }: { joueurs: Joueur[]; active: boolean; ferme: () => void }) {
  const router = useRouter();
  const fichier = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [placement, setPlacement] = useState<Placement>(null);
  const [busy, setBusy] = useState<'lecture' | 'validation' | null>(null);
  // La capture en grand, par-dessus tout, pour comparer ligne à ligne.
  const [loupe, setLoupe] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [apercus, setApercus] = useState<Record<string, Apercu>>({});

  /*
   * L'aperçu vient du serveur : il rejoue la saisie sur une copie de la base,
   * carte active comprise. Un léger délai regroupe les clics sur ± et sur
   * les tuiles de top, pour ne pas appeler à chaque frappe.
   */
  useEffect(() => {
    const lignesAssignees = (lignes ?? []).filter((l) => l.joueurId);
    let annule = false;
    const minuterie = setTimeout(async () => {
      if (lignesAssignees.length === 0) {
        setApercus({});
        return;
      }
      try {
        const reponse = await fetch('/api/games/apercu', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placement,
            meilleurKills: meilleurKillsDe(lignes ?? []),
            lignes: lignesAssignees.map((l) => ({ playerId: l.joueurId, kills: l.kills })),
          }),
        });
        const charge = await reponse.json();
        if (annule || !charge.ok) return;
        const suivant: Record<string, Apercu> = {};
        for (const a of charge.data.apercus as (Apercu & { playerId: string })[]) suivant[a.playerId] = a;
        setApercus(suivant);
      } catch {
        /* l'aperçu est un confort : sans lui, le score simple reste affiché */
      }
    }, 250);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [lignes, placement]);

  async function charge(source: Blob) {
    setMessage(null);
    setLignes(null);
    const url = URL.createObjectURL(source);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image illisible'));
        el.src = url;
      });
      const echelle = Math.min(1, LARGEUR_MAX / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * echelle);
      canvas.height = Math.round(img.naturalHeight * echelle);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      setApercu(dataUrl);
      setImage(dataUrl.split(',')[1]);
    } catch {
      setMessage({ kind: 'error', text: 'Cette image n’a pas pu être lue.' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  useEffect(() => {
    const surColle = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const blob = item?.getAsFile();
      if (blob) {
        e.preventDefault();
        void charge(blob);
      }
    };
    window.addEventListener('paste', surColle);
    return () => window.removeEventListener('paste', surColle);
  }, []);

  function efface() {
    setApercu(null);
    setImage(null);
    setLignes(null);
    setPlacement(null);
    setMessage(null);
    if (fichier.current) fichier.current.value = '';
  }

  async function analyse() {
    if (!image) return;
    setBusy('lecture');
    setMessage(null);
    try {
      const reponse = await fetch('/api/admin/games/analyse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({ kind: 'error', text: charge.error?.message ?? 'Lecture refusée.' });
        return;
      }
      const data = charge.data as { placement: Placement; propositions: Ligne[] };
      setLignes(data.propositions);
      if (data.placement !== null) setPlacement(data.placement);
      const reconnus = data.propositions.filter((l) => l.joueurId).length;
      setMessage({
        kind: 'info',
        text: `${data.propositions.length} ligne${data.propositions.length > 1 ? 's' : ''} lue${data.propositions.length > 1 ? 's' : ''}, ${reconnus} joueur${reconnus > 1 ? 's' : ''} de la ligue reconnu${reconnus > 1 ? 's' : ''}.`,
      });
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(null);
    }
  }

  function nomDe(id: string | null): string {
    return joueurs.find((j) => j.id === id)?.pseudo ?? '?';
  }

  async function valide() {
    if (!lignes) return;
    const aSaisir = lignes.filter((l) => l.joueurId);
    if (aSaisir.length === 0) {
      setMessage({ kind: 'error', text: 'Aucun joueur assigné : rien à enregistrer.' });
      return;
    }
    setBusy('validation');
    setMessage(null);
    let faites = 0;
    const echecs: { id: string; texte: string }[] = [];
    for (const ligne of aSaisir) {
      try {
        const reponse = await fetch('/api/games', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            playerId: ligne.joueurId,
            kills: ligne.kills,
            placement,
            meilleurKills: meilleurKillsDe(lignes),
            note: 'Saisie par capture',
            // Le Joker ne part que si le serveur a dit qu'il en a un, et il
            // le vérifie de nouveau.
            joker: Boolean(ligne.joker && apercus[ligne.joueurId!]?.joker),
          }),
        });
        const charge = await reponse.json();
        if (charge.ok) faites += 1;
        else echecs.push({ id: ligne.joueurId!, texte: `${nomDe(ligne.joueurId)} : ${charge.error?.message ?? 'refusée'}` });
      } catch {
        echecs.push({ id: ligne.joueurId!, texte: `${nomDe(ligne.joueurId)} : le serveur n’a pas répondu` });
      }
    }
    setBusy(null);
    router.refresh();
    if (echecs.length === 0) {
      // Tout est passé : la fenêtre se ferme, le classement se met à jour derrière.
      efface();
      ferme();
    } else {
      // Les games passées sont passées : on ne garde que les lignes en échec,
      // pour qu'elles ne soient pas saisies deux fois.
      setLignes(lignes.filter((l) => !l.joueurId || echecs.some((e) => e.id === l.joueurId)));
      setMessage({
        kind: 'error',
        text: `${faites} enregistrée${faites > 1 ? 's' : ''}, ${echecs.length} refusée${echecs.length > 1 ? 's' : ''} — ${echecs.map((e) => e.texte).join(' · ')}`,
      });
    }
  }

  function modifie(index: number, patch: Partial<Ligne>) {
    setLignes((l) => (l ? l.map((ligne, i) => (i === index ? { ...ligne, ...patch } : ligne)) : l));
  }

  const assignes = new Set((lignes ?? []).map((l) => l.joueurId).filter(Boolean));
  const doublons = (lignes ?? []).filter((l) => l.joueurId).length !== assignes.size;
  const totalKills = (lignes ?? []).reduce((somme, l) => somme + l.kills, 0);
  const jokersJoues = (lignes ?? []).filter((l) => l.joueurId && l.joker && apercus[l.joueurId]?.joker).length;

  return (
    <Fenetre titre="Saisir une game" large ferme={ferme}>
      {/* Une fois lue, sur un téléphone, les résultats passent en tête. */}
      <div className="saisie" data-lu={lignes && lignes.length > 0 ? '' : undefined} data-lecture={busy === 'lecture' ? '' : undefined}>
        {/* ---- À gauche : la capture, le top, l'analyse ---- */}
        <div className="saisie-gauche">
          {!active && (
            <Notice kind="error">
              La lecture des captures n’est pas activée : la clé ANTHROPIC_API_KEY manque dans les variables
              d’environnement du serveur (Vercel). Ajoute-la, puis redéploie.
            </Notice>
          )}

          <div
            className="saisie-capture"
            data-vide={apercu ? undefined : ''}
            onClick={() => !apercu && fichier.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f && f.type.startsWith('image/')) void charge(f);
            }}
            role={apercu ? undefined : 'button'}
            tabIndex={apercu ? undefined : 0}
            onKeyDown={(e) => {
              if (!apercu && (e.key === 'Enter' || e.key === ' ')) fichier.current?.click();
            }}
          >
            {apercu ? (
              <>
                <button
                  type="button"
                  className="saisie-capture-image"
                  onClick={() => setLoupe(true)}
                  aria-label="Voir la capture en grand"
                  title="Voir en grand"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={apercu} alt="Capture de fin de game" />
                </button>
                {/* Pendant l'analyse : un faisceau balaie la capture, ligne à ligne. */}
                {busy === 'lecture' && <span className="saisie-scan" aria-hidden="true" />}
                <div className="saisie-capture-actions">
                  <button type="button" onClick={() => setLoupe(true)} aria-label="Voir la capture en grand">
                    ⤢ Agrandir
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => fichier.current?.click()}>
                    Changer
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={efface}
                    aria-label="Retirer la capture"
                    title="Retirer la capture"
                  >
                    ✕
                  </button>
                </div>
              </>
            ) : (
              <p>
                <b>Colle la capture</b> (Ctrl+V)
                <span>ou clique pour choisir un fichier</span>
              </p>
            )}
          </div>
          <input
            ref={fichier}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void charge(f);
            }}
          />

          <div>
            <p className="saisie-titre">Top de l’équipe</p>
            <ChoixTop valeur={placement} onChange={setPlacement} disabled={busy !== null} />
          </div>

          <button type="button" className="btn btn-ice w-full" disabled={!image || !active || busy !== null} onClick={analyse}>
            {busy === 'lecture' ? 'Analyse en cours…' : lignes ? '✦ Relancer l’analyse' : '✦ Analyser'}
          </button>

          {message && <Notice kind={message.kind}>{message.text}</Notice>}
        </div>

        {/* ---- À droite : une ligne par joueur, et la validation ---- */}
        <div className="saisie-droite">
          {busy === 'lecture' ? (
            <div className="saisie-analyse" role="status">
              <p>
                <span className="saisie-analyse-flocon" aria-hidden="true">
                  ❄
                </span>
                Lecture de la capture…
                <span>les noms, les kills, le top</span>
              </p>
              {[0, 1, 2].map((i) => (
                <span key={i} className="saisie-fantome" style={{ ['--i' as string]: i } as React.CSSProperties} aria-hidden="true" />
              ))}
            </div>
          ) : lignes && lignes.some((l) => !l.streameuse) ? (
            <div className="saisie-lignes">
              {/* Les colonnes, nommées une fois : on lit chaque ligne sans légende. */}
              <div className="saisie-colonnes" aria-hidden="true">
                <span>Joueur</span>
                <span>Kills</span>
                <span>Carte active</span>
                <span>Points</span>
              </div>
              <ul>
              {lignes.map((l, i) => l.streameuse ? null : (
                <LigneResultat
                  key={`${l.lu}-${i}`}
                  ligne={l}
                  placement={placement}
                  apercu={l.joueurId ? apercus[l.joueurId] : undefined}
                  joueurs={joueurs}
                  meilleur={meilleurTueurDe(lignes)}
                  onChange={(patch) => modifie(i, patch)}
                />
              ))}
              </ul>
            </div>
          ) : (
            <p className="saisie-attente">
              {lignes
                ? 'Aucune ligne de joueur n’a été lue sur cette capture.'
                : 'Colle la capture de fin de game, puis lance l’analyse : les joueurs lus apparaîtront ici.'}
            </p>
          )}

          {lignes && lignes.length > 0 && (
            <div className="saisie-pied">
              {doublons && <Notice kind="error">Un même joueur est assigné à deux lignes : corrige avant de valider.</Notice>}
              <div className="saisie-pied-ligne">
                {/* Le total de l'escouade, toutes lignes lues : il doit tomber sur
                    celui de la capture. Un écart, c'est un kill mal lu. */}
                <p className="saisie-total" title="À comparer avec « Totaux escouade » sur la capture">
                  Élim. de l’escouade <strong className="num">{totalKills}</strong>
                  <span>à comparer avec la capture</span>
                </p>
                <button
                  type="button"
                  className="btn btn-ice saisie-valider"
                  disabled={busy !== null || doublons || assignes.size === 0}
                  onClick={valide}
                  title="La carte active d’un joueur compte dans son score et sera consommée par cette game."
                >
                  {busy === 'validation'
                    ? 'Enregistrement…'
                    : `✓ Valider ${assignes.size} game${assignes.size > 1 ? 's' : ''}${jokersJoues > 0 ? ` · ${jokersJoues} Joker${jokersJoues > 1 ? 's' : ''}` : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {loupe && apercu && <Loupe src={apercu} ferme={() => setLoupe(false)} />}
    </Fenetre>
  );
}

/**
 * La capture en grand, sur tout l'écran : pour comparer les noms et les kills
 * lus avec ce qu'elle montre. Échap, la croix ou un clic à côté la referment —
 * sans fermer la saisie dessous.
 */
function Loupe({ src, ferme }: { src: string; ferme: () => void }) {
  useEffect(() => {
    // En phase de capture : la saisie écoute aussi Échap, elle ne doit pas se fermer.
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      ferme();
    };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [ferme]);

  return createPortal(
    <div className="saisie-loupe" role="dialog" aria-modal="true" aria-label="La capture en grand" onClick={ferme}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Capture de fin de game" onClick={(e) => e.stopPropagation()} />
      <button type="button" className="btn btn-sm saisie-loupe-fermer" onClick={ferme} aria-label="Fermer la capture">
        ✕
      </button>
    </div>,
    document.body,
  );
}

/* ------------------------------ Une ligne -------------------------------- */

/** « +3 pts », « −4 pts », « 0 pt ». */
function points(n: number): string {
  if (n === 0) return '0 pt';
  return `${n > 0 ? '+' : '−'}${Math.abs(n)} pt${Math.abs(n) > 1 ? 's' : ''}`;
}

/**
 * Une ligne lue sur la capture : le joueur, ses kills, et le détail de son
 * score — kills, top, carte — pour qu'une erreur de lecture saute aux yeux
 * avant de valider. Le Joker, s'il en garde un, est un vrai choix, en clair.
 */
function LigneResultat({
  ligne: l,
  placement,
  apercu,
  joueurs,
  meilleur,
  onChange,
}: {
  ligne: Ligne;
  placement: Placement;
  apercu: Apercu | undefined;
  joueurs: Joueur[];
  /** Le meilleur tueur de la partie : Écho Lointain copie ses kills. */
  meilleur: { nom: string; kills: number } | null;
  onChange: (patch: Partial<Ligne>) => void;
}) {
  const assigne = l.joueurId !== null;
  const sure = l.confiance >= 0.9 ? 'sure' : l.confiance >= 0.6 ? 'moyenne' : 'faible';
  const top = placementPoints(placement);
  const carte = apercu?.carte ?? null;
  const total = apercu?.score ?? l.kills + top;
  const joker = Boolean(apercu?.joker);
  const jokerJoue = joker && Boolean(l.joker);
  // Écho Lointain remplace les kills par ceux du meilleur tueur : le calcul
  // montre les kills d'après la carte, et la carte sans points à côté.
  const kills = apercu?.kills ?? l.kills;
  const clone = kills !== l.kills;
  // Le contrôle : ÉLIM. = ÉLIM./ASSIST. − ASSIST., recalculé à chaque − / +.
  const controle = l.attendu === null || l.attendu === undefined ? null : l.attendu === l.kills;
  const ici =
    carte?.cardId === 'echo-lointain' && meilleur
      ? clone
        ? `copie les ${meilleur.kills} kills de ${meilleur.nom}, meilleur tueur`
        : `meilleur tueur lui-même : ${points(carte.points)} de consolation`
      : (carte?.resultat ?? '');
  const sureTexte = `Lecture sûre à ${Math.round(l.confiance * 100)} %`;
  const choisi = joueurs.find((j) => j.id === l.joueurId);
  const pseudo = choisi?.pseudo ?? '';
  // Le détail du total, terme à terme : kills + top + carte.
  const detail = jokerJoue
    ? 'game annulée'
    : [`${kills} kill${kills > 1 ? 's' : ''}`, `${top} top`, ...(carte && !clone ? [`${carte.points < 0 ? '−' : ''}${Math.abs(carte.points)} carte`] : [])].join(' + ');

  return (
    <li className="saisie-ligne" data-etat={!assigne ? 'libre' : jokerJoue ? 'joker' : 'compte'}>
      <div className="saisie-qui">
        <select
          className="field saisie-joueur"
          value={l.joueurId ?? ''}
          onChange={(e) => onChange({ joueurId: e.target.value || null, confiance: e.target.value ? 1 : 0, joker: false })}
          aria-label={`Joueur pour ${l.lu}`}
        >
          <option value="">— pas dans la ligue —</option>
          {joueurs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.pseudo}
            </option>
          ))}
        </select>
        {/* À quel point la lecture est sûre, et le pseudo Activision : celui du
            joueur choisi s'il l'a donné, sinon le nom lu sur la capture. */}
        <span className="saisie-lu" title={`Lu sur la capture : ${l.lu}`}>
          {assigne && (
            <b className="saisie-sure" data-sure={sure} title={sureTexte}>
              {Math.round(l.confiance * 100)} %
            </b>
          )}
          <IconActivision className="saisie-activision-logo" />
          <span>{choisi?.activision ?? (sansTagClan(l.lu) || l.lu)}</span>
        </span>
      </div>

      <div className="saisie-kills" role="group" aria-label="Kills">
        <button
          type="button"
          onClick={() => onChange({ kills: Math.max(GAME_LIMITS.minKills, l.kills - 1) })}
          aria-label="Un kill de moins"
        >
          −
        </button>
        <span
          className="num saisie-kills-n"
          data-controle={controle === null ? undefined : controle ? 'ok' : 'ecart'}
          title={
            controle === null
              ? undefined
              : controle
                ? `Vérifié : ${l.kills} = élim./assist. − assist.`
                : `Élim./assist. − assist. donne ${l.attendu} : vérifie sur la capture`
          }
        >
          {l.kills}
        </span>
        <button
          type="button"
          onClick={() => onChange({ kills: Math.min(GAME_LIMITS.maxKills, l.kills + 1) })}
          aria-label="Un kill de plus"
        >
          +
        </button>
      </div>

      <div className="saisie-effet">
        {controle === false && (
          <span className="saisie-puce" data-ton="alerte" title="Élim./assist. − assist., lus sur la capture">
            ⚠ La capture donne {l.attendu} kills
          </span>
        )}
        {!assigne ? (
          <span className="saisie-sans">Pas de game : il n’est pas dans la ligue</span>
        ) : carte ? (
          <CarteDeLaGame cardId={carte.cardId} donne={clone ? `${kills} kills` : points(carte.points)} ici={ici} eteinte={jokerJoue} />
        ) : (
          <span className="saisie-sans">Aucune carte active</span>
        )}
      </div>

      <div className="saisie-points" data-joker={jokerJoue || undefined}>
        <b className="num">{!assigne ? '—' : jokerJoue ? '0 pt' : `${total} pts`}</b>
      </div>

      {/* Le détail du total, sur une ligne fine, sous la ligne et au-dessus du Joker. */}
      {assigne && (
        <p className="saisie-detail num" data-joker={jokerJoue || undefined}>
          {jokerJoue ? 'Game annulée par le Joker' : `${total} pts = ${detail}`}
        </p>
      )}

      {/* Le Joker : un interrupteur, en clair. */}
      {assigne && joker && (
        <button
          type="button"
          role="switch"
          aria-checked={jokerJoue}
          className="saisie-joker"
          onClick={() => onChange({ joker: !jokerJoue })}
        >
          <span className="saisie-joker-icone" aria-hidden="true">
            🃏
          </span>
          <span className="saisie-joker-texte">
            {jokerJoue ? (
              <>
                <b>Joker joué</b> : la game de {pseudo} ne compte pas — 0 point, 0 flocon
                {carte ? `, ${carte.nom} attend la suivante` : ''}.
              </>
            ) : (
              <>
                <b>{pseudo} a un Joker</b> : le jouer annule cette game.
              </>
            )}
          </span>
          <span className="saisie-interrupteur" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/**
 * La carte active d'un joueur, dans sa ligne : sa vignette, son nom et sa
 * rareté, ce qu'elle fait sur cette game, et ce qu'elle lui donne.
 */
function CarteDeLaGame({ cardId, donne, ici, eteinte }: { cardId: string; donne: string; ici: string; eteinte?: boolean }) {
  const def = getCard(cardId);
  if (!def) return null;
  const meta = RARITY_META[def.rarity];
  return (
    <div
      className="saisie-carte"
      data-eteinte={eteinte || undefined}
      style={{ ['--r' as string]: meta.color }}
      title={`${def.name} (${meta.label}) — ${def.description}`}
    >
      <span className="saisie-carte-vignette" aria-hidden="true">
        <CardFrame cardId={def.id} name={def.name} rarity={def.rarity} glyph={def.glyph} nature={def.nature} largeur="34px" />
      </span>
      <div className="saisie-carte-texte">
        <p>
          <b>{def.name}</b>
          <span>{meta.label}</span>
        </p>
        <p>{eteinte ? 'attend la game suivante' : ici}</p>
      </div>
      {!eteinte && (
        <b className="saisie-carte-donne num" data-signe={donne.startsWith('−') ? 'moins' : undefined}>
          {donne}
        </b>
      )}
    </div>
  );
}
