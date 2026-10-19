'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { SnowCap } from '@/components/SnowCap';
import { CARD_ART } from '@/lib/domain/card-art.generated';
import type { RankingRow } from '@/lib/services/league';

const rienAEcouter = () => () => {};

/** Sans accent ni casse, pour que « Boreal » trouve « Boréal ». */
const plat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function Avatar({ joueur, grand }: { joueur: Pick<RankingRow, 'pseudo' | 'avatarUrl'>; grand?: boolean }) {
  const classe = grand ? 'verglas-avatar verglas-avatar-grand' : 'verglas-avatar';
  return joueur.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={classe} src={joueur.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className={classe} aria-hidden="true">
      {joueur.pseudo.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Lancer un Verglas, pour la modération : une fenêtre à part, ouverte depuis
 * la fiche de la carte.
 *
 * En haut, le coup qui se prépare — le porteur, la glace, la victime choisie.
 * Dessous, tous les joueurs en tuiles, qu'on choisit d'un clic (une recherche
 * pour aller vite). En bas, un seul bouton, qui dit exactement ce qu'il fait.
 * Une fois envoyé, la fenêtre le confirme avant de se refermer.
 *
 * Le choix ne fait que désigner : le serveur revérifie la carte, la victime,
 * et qu'aucun membre de la modération ne joue le Verglas qu'il garde.
 */
export function LancerVerglas({
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
  const [recherche, setRecherche] = useState('');
  const [cible, setCible] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState<RankingRow | null>(null);

  const victimes = useMemo(
    () => joueurs.filter((j) => j.id !== porteur.id).sort((a, b) => a.rank - b.rank),
    [joueurs, porteur.id],
  );
  const visibles = useMemo(() => {
    const q = plat(recherche.trim());
    return q
      ? victimes.filter((j) => plat(j.pseudo).includes(q) || plat(j.activisionId ?? '').includes(q))
      : victimes;
  }, [victimes, recherche]);
  const choisi = victimes.find((j) => j.id === cible) ?? null;

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

  async function envoie() {
    if (!choisi) return;
    setBusy(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/admin/cartes/verglas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carteId, cibleId: choisi.id }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.message ?? 'Refusé.');
        return;
      }
      setEnvoye(choisi);
      router.refresh();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setBusy(false);
    }
  }

  if (!navigateur) return null;
  const art = CARD_ART['plaque-verglas'];

  return createPortal(
    <div
      className="fenetre-voile"
      role="dialog"
      aria-modal="true"
      aria-label="Lancer le Verglas"
      onClick={() => !busy && onClose()}
    >
      <div className="fenetre-carte verglas-fenetre glass glass-reflet relative" onClick={(e) => e.stopPropagation()}>
        <SnowCap radius="var(--r-lg)" seed="lancer-verglas" epaisseur={14} />
        <button
          type="button"
          className="btn btn-sm absolute top-4 right-4 z-10"
          onClick={onClose}
          disabled={busy}
          aria-label="Fermer"
        >
          ✕
        </button>

        {envoye ? (
          <div className="verglas-fait">
            {art && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="verglas-fait-art" src={art} alt="" />
            )}
            <p className="verglas-surtitre">Verglas envoyé</p>
            <div className="verglas-fait-cible">
              <Avatar joueur={envoye} grand />
              <span className="verglas-fait-pseudo">{envoye.pseudo}</span>
            </div>
            <p className="verglas-fait-texte">
              {envoye.immunise ? (
                <>Son immunité l’a paré : son total ne bouge pas.</>
              ) : (
                <>
                  <strong>−20 points</strong> sur son total.
                </>
              )}
            </p>
            <button type="button" className="btn btn-ice" onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            <header className="verglas-tete">
              {art && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="verglas-vignette" src={art} alt="" />
              )}
              <div className="min-w-0">
                <p className="verglas-surtitre">Ultra rare · Verglas</p>
                <h2 className="verglas-titre">Lancer le Verglas</h2>
                <p className="verglas-sous-titre">
                  Choisis la victime de <strong>{porteur.pseudo}</strong> : elle perd 20 points sur son total, tout
                  de suite.
                </p>
              </div>
            </header>

            {/* Le coup qui se prépare : de qui, vers qui. */}
            <div className="verglas-coup" data-pret={choisi ? '' : undefined}>
              <div className="verglas-camp">
                <Avatar joueur={porteur} grand />
                <span className="verglas-camp-pseudo">{porteur.pseudo}</span>
                <span className="verglas-camp-role">lance</span>
              </div>
              <div className="verglas-fleche" aria-hidden="true">
                <span className="verglas-fleche-valeur">−20 pts</span>
                <span className="verglas-fleche-trait" />
              </div>
              <div className="verglas-camp">
                {choisi ? (
                  <>
                    <Avatar joueur={choisi} grand />
                    <span className="verglas-camp-pseudo">{choisi.pseudo}</span>
                    <span className="verglas-camp-role">{choisi.immunise ? 'immunisé' : 'reçoit'}</span>
                  </>
                ) : (
                  <>
                    <span className="verglas-avatar verglas-avatar-grand verglas-avatar-vide" aria-hidden="true">
                      ?
                    </span>
                    <span className="verglas-camp-pseudo text-faint">Qui ?</span>
                    <span className="verglas-camp-role">choisis ci-dessous</span>
                  </>
                )}
              </div>
            </div>

            <div className="verglas-liste-zone">
              <label className="block">
                <span className="sr-only">Chercher un joueur</span>
                <input
                  type="search"
                  className="field"
                  placeholder="Chercher un joueur…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              {visibles.length === 0 ? (
                <p className="verglas-vide">Aucun joueur ne correspond.</p>
              ) : (
                <ul className="verglas-grille" aria-label="Victimes possibles">
                  {visibles.map((j) => (
                    <li key={j.id}>
                      <button
                        type="button"
                        className="verglas-tuile"
                        aria-pressed={j.id === cible}
                        disabled={busy}
                        onClick={() => setCible(j.id === cible ? null : j.id)}
                      >
                        <Avatar joueur={j} />
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
              )}
            </div>

            <footer className="verglas-pied">
              <p className="verglas-pied-texte" aria-live="polite">
                {erreur ? (
                  <span className="text-danger">{erreur}</span>
                ) : choisi?.immunise ? (
                  <span className="text-gold">
                    {choisi.pseudo} est immunisé : le Verglas sera paré, et la carte perdue.
                  </span>
                ) : choisi ? (
                  <>La carte de {porteur.pseudo} sera consommée.</>
                ) : (
                  <>Clique sur un joueur pour le désigner.</>
                )}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn" disabled={busy} onClick={onClose}>
                  Annuler
                </button>
                <button type="button" className="btn btn-ice" disabled={!choisi || busy} onClick={envoie}>
                  {busy ? 'Envoi…' : choisi ? `Envoyer sur ${choisi.pseudo}` : 'Envoyer le Verglas'}
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
