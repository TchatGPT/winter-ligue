'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SnowCap } from '@/components/SnowCap';
import { Notice } from '@/components/ui';
import { GAME_LIMITS, placementPoints } from '@/lib/domain/rules';

interface Joueur {
  id: string;
  pseudo: string;
}

interface Ligne {
  /** La ligne de la streameuse : affichée, jamais saisie. */
  streameuse: boolean;
  lu: string;
  kills: number;
  assists: number | null;
  joueurId: string | null;
  confiance: number;
  /** La modération sert le Joker du joueur : cette game ne comptera pas. */
  joker?: boolean;
}

type Placement = 1 | 2 | 3 | null;

/** Ce que le serveur annonce pour une ligne : le score, carte active comprise. */
interface Apercu {
  score: number;
  carte: { cardId: string; nom: string; points: number; resultat: string } | null;
  /** Vrai s'il garde un Joker. */
  joker: boolean;
}
type Message = { kind: 'error' | 'success' | 'info'; text: string } | null;

/**
 * La capture est réduite avant l'envoi : 1568 px, la taille au-delà de
 * laquelle le modèle la réduirait de toute façon. Le tableau reste lisible,
 * l'envoi est plus court.
 */
const LARGEUR_MAX = 1568;

const TOPS: { valeur: Placement; libelle: string }[] = [
  { valeur: 1, libelle: 'Top 1' },
  { valeur: 2, libelle: 'Top 2' },
  { valeur: 3, libelle: 'Top 3' },
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
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#04101f]/60 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      onClick={ferme}
    >
      <div
        className={`glass glass-reflet relative flex max-h-[92dvh] w-full flex-col overflow-hidden !rounded-b-none sm:!rounded-b-[var(--r-lg)] ${large ? 'max-w-3xl' : 'max-w-lg'}`}
        // La même glace bleutée que les cartes de la page. Sur le voile sombre,
        // le verre seul virait au gris : la teinte est posée en dur ici.
        style={{ background: 'linear-gradient(160deg, rgb(44 88 132 / 0.94) 0%, rgb(18 44 76 / 0.97) 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SnowCap radius="var(--r-lg)" seed="fenetre-saisie" epaisseur={14} />
        <header className="relative flex items-center gap-3 border-b border-white/15 px-5 pt-6 pb-4">
          <h2 className="font-display text-lg font-black tracking-wider text-ink uppercase">{titre}</h2>
          <button type="button" className="btn btn-sm ml-auto" onClick={ferme} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Les quatre tuiles du classement, partagé par toute l'équipe. */
function ChoixTop({ valeur, onChange, disabled }: { valeur: Placement; onChange: (p: Placement) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {TOPS.map((t) => {
        const actif = t.valeur === valeur;
        return (
          <button
            key={String(t.valeur)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(t.valeur)}
            aria-pressed={actif}
            className={`rounded-2xl border px-2 py-3 text-center transition-colors ${
              actif
                ? 'border-white/90 bg-white/90 text-[#06284a] shadow-[0_8px_22px_-10px_rgb(20_70_120/0.6)]'
                : 'glass glass-soft border-white/20 text-ink hover:border-white/50'
            }`}
          >
            <span className="block font-display text-[15px] font-black tracking-wide uppercase">{t.libelle}</span>
            <span className={`mt-0.5 block text-[13px] ${actif ? 'text-[#06284a]/80' : 'text-muted'}`}>
              +{placementPoints(t.valeur)} pts
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Avec l'IA -------------------------------- */

/**
 * Les kills du meilleur tueur de la partie : toutes les lignes lues sur la
 * capture, la streameuse et les coéquipiers hors ligue compris. C'est ce que
 * la carte « Clone kill du meilleur » copie.
 */
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
      efface();
      setMessage({ kind: 'success', text: `${faites} game${faites > 1 ? 's' : ''} enregistrée${faites > 1 ? 's' : ''}.` });
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
    <Fenetre titre="Saisie équipe — IA" large ferme={ferme}>
      {!active && (
        <div className="mb-4">
          <Notice kind="error">
            La lecture des captures n’est pas activée : la clé ANTHROPIC_API_KEY manque dans les variables
            d’environnement du serveur (Vercel). Ajoute-la, puis redéploie.
          </Notice>
        </div>
      )}

      {/* ---- le top, partagé ---- */}
      <p className="label">
        Classement top <span className="font-sans font-normal tracking-normal normal-case text-faint">(partagé pour toute l’équipe)</span>
      </p>
      <ChoixTop valeur={placement} onChange={setPlacement} disabled={busy !== null} />

      {/* ---- la capture ---- */}
      <p className="label mt-5">Capture d’écran fin de game</p>
      <div
        className="glass glass-soft flex min-h-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl p-2 text-center"
        style={{ borderStyle: apercu ? 'solid' : 'dashed', borderWidth: 2, borderColor: apercu ? 'var(--aurora)' : 'rgb(255 255 255 / 0.35)' }}
        onClick={() => !apercu && fichier.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('image/')) void charge(f);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fichier.current?.click();
        }}
      >
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu} alt="Capture de fin de game" className="max-h-[240px] w-auto rounded-xl" />
        ) : (
          <div className="px-4 py-6">
            <span className="block text-3xl opacity-50" aria-hidden="true">
              🖼
            </span>
            <p className="mt-2 text-[14px] text-muted">Ctrl+V pour coller · ou cliquez pour choisir un fichier</p>
          </div>
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

      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-ice flex-1" disabled={!image || !active || busy !== null} onClick={analyse}>
          {busy === 'lecture' ? 'Analyse en cours…' : '✦ Analyser'}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={efface}>
          ✕ Effacer
        </button>
      </div>

      {message && (
        <div className="mt-4">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}

      {/* ---- les résultats ---- */}
      {lignes && lignes.length > 0 && (
        <div className="mt-5">
          <p className="label">Résultats</p>
          <ul className="space-y-2.5">
            {lignes.map((l, i) => (
              <LigneResultat
                key={`${l.lu}-${i}`}
                ligne={l}
                placement={placement}
                apercu={l.joueurId ? apercus[l.joueurId] : undefined}
                joueurs={joueurs}
                onChange={(patch) => modifie(i, patch)}
              />
            ))}
          </ul>

          {/* Le total de l'escouade, toutes lignes lues : il doit tomber sur
              celui de la capture. Un écart, c'est un kill mal lu. */}
          <div className="saisie-total">
            <span>
              Élim. lues, toute l’escouade : <strong className="num">{totalKills}</strong>
            </span>
            <span className="text-faint">À comparer avec « Totaux escouade » sur la capture.</span>
          </div>

          {doublons && (
            <div className="mt-3">
              <Notice kind="error">Un même joueur est assigné à deux lignes : corrige avant de valider.</Notice>
            </div>
          )}
          <button
            type="button"
            className="btn btn-ice btn-lg mt-4 w-full"
            disabled={busy !== null || doublons || assignes.size === 0}
            onClick={valide}
          >
            {busy === 'validation'
              ? 'Enregistrement…'
              : `✓ Valider toute l’équipe${jokersJoues > 0 ? ` · ${jokersJoues} Joker${jokersJoues > 1 ? 's' : ''} joué${jokersJoues > 1 ? 's' : ''}` : ''}`}
          </button>
          <p className="mt-2 text-center text-[13px] text-faint">
            La carte active d’un joueur compte dans son score et sera consommée par cette game.
          </p>
        </div>
      )}

      {lignes && lignes.length === 0 && (
        <div className="mt-4">
          <Notice kind="error">Aucune ligne de joueur n’a été lue sur cette capture.</Notice>
        </div>
      )}
    </Fenetre>
  );
}

/* ------------------------------ Une ligne -------------------------------- */

/** Un texte sans espaces ni signe moins typographique, pour comparer deux écritures. */
const plat = (texte: string) => texte.replace(/\s/g, '').replace(/−/g, '-');

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
  onChange,
}: {
  ligne: Ligne;
  placement: Placement;
  apercu: Apercu | undefined;
  joueurs: Joueur[];
  onChange: (patch: Partial<Ligne>) => void;
}) {
  // La ligne de la streameuse : montrée pour qu'on voie qu'elle a été lue, et
  // ses kills comptent dans le total de l'escouade, mais elle n'a pas de game.
  if (l.streameuse) {
    return (
      <li className="saisie-ligne" data-etat="hors">
        <div className="saisie-ligne-tete">
          <span className="saisie-lu">{l.lu}</span>
          <span className="text-sm text-muted">Streameuse — hors ligue, aucune game</span>
          <span className="saisie-kills-fixes num">{l.kills} élim.</span>
        </div>
      </li>
    );
  }

  const assigne = l.joueurId !== null;
  const couleur = l.confiance >= 0.9 ? 'text-aurora' : l.confiance >= 0.6 ? 'text-gold' : 'text-danger';
  const top = placementPoints(placement);
  const carte = apercu?.carte ?? null;
  const total = apercu?.score ?? l.kills + top;
  const joker = Boolean(apercu?.joker);
  const jokerJoue = joker && Boolean(l.joker);
  const pseudo = joueurs.find((j) => j.id === l.joueurId)?.pseudo ?? '';

  return (
    <li className="saisie-ligne" data-etat={!assigne ? 'libre' : jokerJoue ? 'joker' : 'compte'}>
      <div className="saisie-ligne-tete">
        <span className="saisie-lu" title="Pseudo lu sur la capture">
          {l.lu}
        </span>
        <div className="min-w-0">
          <select
            className="field !py-1 text-sm"
            value={l.joueurId ?? ''}
            onChange={(e) => onChange({ joueurId: e.target.value || null, confiance: e.target.value ? 1 : 0, joker: false })}
            aria-label={`Joueur pour ${l.lu}`}
          >
            <option value="">— non assigné —</option>
            {joueurs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.pseudo}
              </option>
            ))}
          </select>
          {assigne && <span className={`mt-0.5 block text-[13px] ${couleur}`}>Lecture sûre à {Math.round(l.confiance * 100)} %</span>}
        </div>
        <div className="saisie-kills" role="group" aria-label="Éliminations">
          <button
            type="button"
            className="btn btn-sm !min-h-0 !px-2.5 !py-0.5"
            onClick={() => onChange({ kills: Math.max(GAME_LIMITS.minKills, l.kills - 1) })}
            aria-label="Un kill de moins"
          >
            −
          </button>
          <span className="num min-w-[2ch] text-center font-display text-xl font-bold text-ink">{l.kills}</span>
          <button
            type="button"
            className="btn btn-sm !min-h-0 !px-2.5 !py-0.5"
            onClick={() => onChange({ kills: Math.min(GAME_LIMITS.maxKills, l.kills + 1) })}
            aria-label="Un kill de plus"
          >
            +
          </button>
          <span className="text-[13px] text-faint">élim.</span>
        </div>
      </div>

      {assigne && (
        <>
          {/* Le détail du score : chaque terme, puis le total. */}
          <div className="saisie-calcul" data-barre={jokerJoue || undefined}>
            <span className="saisie-terme">
              <b className="num">{points(l.kills)}</b> {l.kills} kill{l.kills > 1 ? 's' : ''}
            </span>
            <span className="saisie-op">+</span>
            <span className="saisie-terme">
              <b className="num">{points(top)}</b> {placement === null ? 'pas top' : `Top ${placement}`}
            </span>
            {carte && (
              <>
                <span className="saisie-op">+</span>
                <span className="saisie-terme" data-carte={carte.points < 0 ? 'malus' : 'bonus'} title={carte.resultat}>
                  <b className="num">{points(carte.points)}</b> {carte.nom}
                </span>
              </>
            )}
            <span className="saisie-op">=</span>
            <span className="saisie-total-ligne num">{jokerJoue ? '0 pt' : `${total} pts`}</span>
          </div>
          {/* Le détail de la carte, quand il dit plus que ses points : « ×2 sur 24 pts ». */}
          {carte && !jokerJoue && plat(carte.resultat) !== plat(points(carte.points)) && (
            <p className="saisie-carte-detail">
              🃏 {carte.nom} : {carte.resultat}
            </p>
          )}

          {/* Le Joker : un choix, pas une case qu'on rate. */}
          {joker && (
            <div className="saisie-joker" data-joue={jokerJoue || undefined}>
              <div className="min-w-0">
                <p className="saisie-joker-titre">
                  🃏 {pseudo} a un Joker{jokerJoue ? ' — joué sur cette game' : ''}
                </p>
                <p className="saisie-joker-texte">
                  {jokerJoue
                    ? `Cette game ne comptera pas : 0 point, 0 flocon. Le Joker est consommé${carte ? `, et ${carte.nom} attend sa game suivante` : ''}.`
                    : 'Le jouer annule cette game : elle ne comptera pas, et il pourra la rejouer. Sinon, il garde son Joker pour plus tard.'}
                </p>
              </div>
              <button
                type="button"
                className="saisie-joker-bouton"
                aria-pressed={jokerJoue}
                onClick={() => onChange({ joker: !jokerJoue })}
              >
                {jokerJoue ? 'Ne pas jouer le Joker' : 'Jouer le Joker'}
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
