'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SnowCap } from '@/components/SnowCap';
import { shortDateTime } from '@/lib/format';
import type { RankingRow } from '@/lib/services/league';

const rienAEcouter = () => () => {};

/** Une game qu'on peut choisir : encore sans carte. */
interface GameChoisissable {
  id: string;
  jouee: string;
  kills: number;
  placement: number | null;
  score: number;
}

interface Choix {
  minGames: number;
  jouees: number;
  miennes: GameChoisissable[];
  autres: { joueurId: string; games: GameChoisissable[] }[];
}

/** « 12/01 21:04 · 15 kills · Top 3 » */
const resume = (g: GameChoisissable) =>
  `${shortDateTime(g.jouee)} · ${g.kills} kill${g.kills > 1 ? 's' : ''}${g.placement ? ` · Top ${g.placement}` : ''}`;

function TuileGame({
  game,
  choisie,
  disabled,
  onChoisir,
}: {
  game: GameChoisissable;
  choisie: boolean;
  disabled: boolean;
  onChoisir: () => void;
}) {
  return (
    <li>
      <button type="button" className="verglas-tuile" aria-pressed={choisie} disabled={disabled} onClick={onChoisir}>
        <span className="min-w-0">
          <span className="verglas-tuile-pseudo num">{game.score} pts</span>
          <span className="verglas-tuile-infos num">{resume(game)}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Jouer un Pacte du Givre, pour la modération : une fenêtre à part, ouverte
 * depuis la fiche de la carte au classement.
 *
 * Trois choix, dans l'ordre où le joueur les donne : une de ses games, l'autre
 * joueur, une game de cet autre joueur — seulement des games encore sans
 * carte. En bas, ce que l'échange va donner, et un seul bouton. Le serveur
 * revérifie tout (`/api/admin/cartes/echange`).
 */
export function LancerPacte({
  carteId,
  porteur,
  joueurs,
  onClose,
}: {
  carteId: string;
  porteur: RankingRow;
  joueurs: RankingRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  const [choix, setChoix] = useState<Choix | null>(null);
  const [maGame, setMaGame] = useState<string | null>(null);
  const [autreId, setAutreId] = useState<string | null>(null);
  const [autreGame, setAutreGame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/admin/cartes/echange?carteId=${encodeURIComponent(carteId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((charge) => {
        if (annule) return;
        if (charge.ok) setChoix(charge.data as Choix);
        else setErreur(charge.error?.message ?? 'Lecture refusée.');
      })
      .catch(() => !annule && setErreur('Le serveur n’a pas répondu.'));
    return () => {
      annule = true;
    };
  }, [carteId]);

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

  const autres = useMemo(() => {
    const avecGames = new Set(choix?.autres.map((a) => a.joueurId));
    return joueurs.filter((j) => avecGames.has(j.id)).sort((a, b) => a.rank - b.rank);
  }, [choix, joueurs]);
  const mienne = choix?.miennes.find((g) => g.id === maGame) ?? null;
  const autre = autres.find((j) => j.id === autreId) ?? null;
  const gamesAutre = choix?.autres.find((a) => a.joueurId === autreId)?.games ?? [];
  const sienne = gamesAutre.find((g) => g.id === autreGame) ?? null;
  const tropTot = choix !== null && choix.jouees < choix.minGames;

  async function envoie() {
    if (!mienne || !sienne) return;
    setBusy(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/admin/cartes/echange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carteId, maGameId: mienne.id, autreGameId: sienne.id }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.message ?? 'Refusé.');
        return;
      }
      setFait(charge.data?.resultat ?? 'Échange fait.');
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
      aria-label="Jouer le Pacte du Givre"
      onClick={() => !busy && onClose()}
    >
      <div className="fenetre-carte verglas-fenetre glass glass-reflet relative" onClick={(e) => e.stopPropagation()}>
        <SnowCap radius="var(--r-lg)" seed="lancer-pacte" epaisseur={14} />
        <button
          type="button"
          className="btn btn-sm absolute top-4 right-4 z-10"
          onClick={onClose}
          disabled={busy}
          aria-label="Fermer"
        >
          ✕
        </button>

        <header className="verglas-tete">
          <span className="pacte-glyphe" aria-hidden="true">
            🤝
          </span>
          <div className="min-w-0">
            <p className="verglas-surtitre">Légendaire · Pacte du Givre</p>
            <h2 className="verglas-titre">Jouer le Pacte</h2>
            <p className="verglas-sous-titre">
              Une game de <strong>{porteur.pseudo}</strong> et une game d’un autre joueur échangent leur score.
            </p>
          </div>
        </header>

        {fait ? (
          <div className="pacte-zone">
            <p className="verglas-pied-texte">{fait}</p>
            <div className="flex justify-end">
              <button type="button" className="btn btn-ice" onClick={onClose}>
                Fermer
              </button>
            </div>
          </div>
        ) : !choix ? (
          <div className="pacte-zone">
            <p className="verglas-pied-texte">{erreur ? <span className="text-danger">{erreur}</span> : 'Chargement…'}</p>
          </div>
        ) : tropTot ? (
          <div className="pacte-zone">
            <p className="verglas-pied-texte">
              {porteur.pseudo} a joué {choix.jouees} game{choix.jouees > 1 ? 's' : ''} : le Pacte se joue à partir de
              la {choix.minGames}e.
            </p>
          </div>
        ) : (
          <>
            <div className="pacte-zone">
              <section>
                <h3 className="pacte-etape">1. Une game de {porteur.pseudo}</h3>
                {choix.miennes.length === 0 ? (
                  <p className="verglas-vide">Aucune game sans carte.</p>
                ) : (
                  <ul className="verglas-grille pacte-grille">
                    {choix.miennes.map((g) => (
                      <TuileGame
                        key={g.id}
                        game={g}
                        choisie={g.id === maGame}
                        disabled={busy}
                        onChoisir={() => setMaGame(g.id === maGame ? null : g.id)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="pacte-etape">2. L’autre joueur</h3>
                <ul className="verglas-grille pacte-grille">
                  {autres.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        className="verglas-tuile"
                        aria-pressed={j.id === autreId}
                        disabled={busy}
                        onClick={() => {
                          setAutreId(j.id === autreId ? null : j.id);
                          setAutreGame(null);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="verglas-tuile-pseudo">{j.pseudo}</span>
                          <span className="verglas-tuile-infos num">
                            #{j.rank} · {j.totals.totalScore} pts
                          </span>
                        </span>
                        {j.immunise && <span className="verglas-tuile-tag">Immunisé</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              {autre && (
                <section>
                  <h3 className="pacte-etape">3. Une game de {autre.pseudo}</h3>
                  <ul className="verglas-grille pacte-grille">
                    {gamesAutre.map((g) => (
                      <TuileGame
                        key={g.id}
                        game={g}
                        choisie={g.id === autreGame}
                        disabled={busy}
                        onChoisir={() => setAutreGame(g.id === autreGame ? null : g.id)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <footer className="verglas-pied">
              <p className="verglas-pied-texte" aria-live="polite">
                {erreur ? (
                  <span className="text-danger">{erreur}</span>
                ) : mienne && sienne && autre ? (
                  <>
                    {porteur.pseudo} : {mienne.score} → <strong>{sienne.score} pts</strong> · {autre.pseudo} :{' '}
                    {sienne.score} → <strong>{mienne.score} pts</strong>
                    {autre.immunise && sienne.score > mienne.score && (
                      <span className="text-gold"> — {autre.pseudo} est immunisé : l’échange tombera, et la carte sera perdue.</span>
                    )}
                  </>
                ) : (
                  <>Choisis les deux games.</>
                )}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn" disabled={busy} onClick={onClose}>
                  Annuler
                </button>
                <button type="button" className="btn btn-ice" disabled={!mienne || !sienne || busy} onClick={envoie}>
                  {busy ? 'Envoi…' : 'Échanger les games'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
