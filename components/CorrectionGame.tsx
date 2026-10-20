'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SnowCap } from '@/components/SnowCap';
import { flakes } from '@/components/ui';
import { getCard } from '@/lib/domain/catalog';
import { GAME_LIMITS, placementPoints } from '@/lib/domain/rules';
import type { Placement } from '@/lib/domain/types';
import { shortDateTime } from '@/lib/format';

const rienAEcouter = () => () => {};

/** Ce que la fenêtre sait de la game : ce que montre la fiche. */
export interface GameACorriger {
  id: string;
  kills: number;
  placement: number | null;
  score: number;
  skipped: boolean;
  playedAt: string;
  applied: { cardId: string; points: number }[];
}

const PLACEMENTS: { valeur: Placement; nom: string }[] = [
  { valeur: 1, nom: 'Top 1' },
  { valeur: 2, nom: 'Top 2' },
  { valeur: 3, nom: 'Top 3' },
  { valeur: null, nom: 'Hors top 3' },
];

const enPlacement = (p: number | null): Placement => (p === 1 || p === 2 || p === 3 ? p : null);
const signe = (n: number) => (n > 0 ? `+${flakes(n)}` : `−${flakes(-n)}`);

/**
 * Corriger une game déjà saisie, pour la modération : la capture était mal
 * lue — l'IA s'est trompée de kills, de placement —, ou la game n'aurait pas
 * dû l'être.
 *
 * Les kills entre − et +, le placement en quatre boutons, et ce que la game
 * vaudra, kills et top. Le serveur fait le reste (`corrigeGame`) : le score,
 * les cartes de la game relues, et ses flocons ajustés de la différence.
 * Supprimer demande une confirmation : la game quitte le classement, ses
 * flocons sont repris, et sa carte revient au joueur (`supprimeGame`).
 */
export function CorrectionGame({
  game,
  numero,
  pseudo,
  onClose,
}: {
  game: GameACorriger;
  numero: number;
  pseudo: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  const [kills, setKills] = useState(game.kills);
  const [placement, setPlacement] = useState<Placement>(enPlacement(game.placement));
  const [supprimer, setSupprimer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  // Échap pour fermer, et la page dessous ne défile plus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = precedent;
    };
  }, [onClose, busy]);

  const killsValides = Number.isInteger(kills) && kills >= GAME_LIMITS.minKills && kills <= GAME_LIMITS.maxKills;
  const change = kills !== game.kills || placement !== enPlacement(game.placement);
  const nuAvant = game.kills + placementPoints(enPlacement(game.placement));
  const nuApres = killsValides ? kills + placementPoints(placement) : null;
  const cartes = game.applied.map((a) => getCard(a.cardId)?.name).filter((n): n is string => Boolean(n));

  async function envoie(methode: 'PATCH' | 'DELETE') {
    setBusy(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/games', {
        method: methode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(methode === 'PATCH' ? { gameId: game.id, kills, placement } : { gameId: game.id }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.message ?? 'Refusé.');
        return;
      }
      if (methode === 'PATCH') {
        const c = charge.data.correction as { avant: { score: number }; flocons: number } | null;
        const score = (charge.data.game as { score: number }).score;
        setFait(
          `Game corrigée : ${c?.avant.score ?? game.score} → ${score} pts` +
            (c && c.flocons !== 0 ? ` · ${signe(c.flocons)} ❄` : '') +
            '.',
        );
      } else {
        const d = charge.data as { flocons: number; rendues: string[]; perdues: string[] };
        setFait(
          'Game supprimée.' +
            (d.flocons !== 0 ? ` ${flakes(Math.abs(d.flocons))} ❄ repris.` : '') +
            (d.rendues.length ? ` ${d.rendues.join(', ')} revient au joueur.` : '') +
            (d.perdues.length ? ` ${d.perdues.join(', ')} est perdue : il avait déjà une carte en attente.` : ''),
        );
      }
      router.refresh();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setBusy(false);
    }
  }

  if (!navigateur) return null;

  return createPortal(
    <div
      className="fenetre-voile"
      role="dialog"
      aria-modal="true"
      aria-label={`Corriger la game ${numero}`}
      onClick={() => !busy && onClose()}
    >
      <div className="fenetre-carte correction-fenetre glass glass-reflet relative" onClick={(e) => e.stopPropagation()}>
        <SnowCap radius="var(--r-lg)" seed={`correction-${game.id}`} epaisseur={14} />
        <button
          type="button"
          className="btn btn-sm absolute top-4 right-4 z-10"
          onClick={onClose}
          disabled={busy}
          aria-label="Fermer"
        >
          ✕
        </button>

        <header className="correction-tete">
          <p className="correction-surtitre">Modération · {pseudo}</p>
          <h2 className="correction-titre">Game {numero}</h2>
          <p className="correction-sous-titre">
            {shortDateTime(game.playedAt)} · {game.score} pts aujourd’hui
            {game.skipped && ' · ne compte pas'}
          </p>
        </header>

        {fait ? (
          <div className="correction-fait">
            <p>{fait}</p>
            <button type="button" className="btn btn-ice" onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="correction-corps">
              <div className="correction-champ">
                <span className="correction-libelle" id="correction-kills">
                  Kills
                </span>
                <div className="duels-mise-champ correction-kills">
                  <button
                    type="button"
                    aria-label="Un kill de moins"
                    data-sens="moins"
                    disabled={busy || supprimer || kills <= GAME_LIMITS.minKills}
                    onClick={() => setKills((k) => Math.max(GAME_LIMITS.minKills, k - 1))}
                  >
                    −
                  </button>
                  <label>
                    <span className="sr-only">Kills de la game</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="num"
                      min={GAME_LIMITS.minKills}
                      max={GAME_LIMITS.maxKills}
                      value={Number.isFinite(kills) ? kills : ''}
                      disabled={busy || supprimer}
                      aria-labelledby="correction-kills"
                      onChange={(e) => setKills(Math.floor(Number(e.target.value)))}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Un kill de plus"
                    data-sens="plus"
                    disabled={busy || supprimer || kills >= GAME_LIMITS.maxKills}
                    onClick={() => setKills((k) => Math.min(GAME_LIMITS.maxKills, k + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="correction-champ">
                <span className="correction-libelle" id="correction-placement">
                  Placement
                </span>
                <div className="segment correction-placement" role="group" aria-labelledby="correction-placement">
                  {PLACEMENTS.map((p) => (
                    <button
                      key={p.nom}
                      type="button"
                      aria-pressed={placement === p.valeur}
                      disabled={busy || supprimer}
                      onClick={() => setPlacement(p.valeur)}
                    >
                      {p.nom}
                    </button>
                  ))}
                </div>
              </div>

              <div className="correction-apercu" data-change={change ? '' : undefined}>
                <span>Kills et top</span>
                <strong className="num">
                  {nuAvant} pts {change && nuApres !== null && <>→ {nuApres} pts</>}
                </strong>
                <small>
                  {game.skipped
                    ? 'Cette game ne compte pas : elle ne rapporte ni points ni flocons.'
                    : cartes.length
                      ? `${cartes.join(', ')} se recalcule sur la game corrigée ; ses flocons suivent.`
                      : 'Ses flocons suivent : la différence est ajoutée, ou reprise.'}
                </small>
              </div>

              {supprimer && (
                <div className="correction-alerte" role="alert">
                  <p>
                    <b>Supprimer cette game ?</b> Elle quitte le classement, les flocons qu’elle a rapportés sont repris,
                    et sa carte, s’il y en a une, revient au joueur.
                  </p>
                </div>
              )}
              {erreur && (
                <p className="correction-erreur" role="status">
                  {erreur}
                </p>
              )}
            </div>

            <footer className="correction-pied">
              {supprimer ? (
                <>
                  <button type="button" className="btn" disabled={busy} onClick={() => setSupprimer(false)}>
                    Annuler
                  </button>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => envoie('DELETE')}>
                    {busy ? 'Suppression…' : 'Oui, supprimer la game'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-danger correction-supprimer"
                    disabled={busy}
                    onClick={() => setSupprimer(true)}
                  >
                    Supprimer la game
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={onClose}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn btn-ice"
                    disabled={busy || !change || !killsValides}
                    onClick={() => envoie('PATCH')}
                  >
                    {busy ? 'Enregistrement…' : 'Enregistrer la correction'}
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
