'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { IconActivision } from '@/components/icons';
import { LONGUEUR_ACTIVISION } from '@/lib/domain/activision';
import { sansInvisibles } from '@/lib/domain/texte';

/**
 * Le pseudo en jeu d'un joueur (identifiant Activision), sur sa fiche. Sur sa
 * propre fiche, le joueur le change lui-même (17/11/2026) : s'il change de
 * pseudo en jeu en cours de ligue, c'est ici qu'il le dit, sinon la
 * modération ne le retrouve plus sur les captures. Le serveur refuse un pseudo
 * déjà pris, et le journal garde l'ancien et le nouveau.
 */
export function PseudoActivision({ activisionId, moi }: { activisionId: string | null; moi: boolean }) {
  const router = useRouter();
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(activisionId ?? '');
  const [certifie, setCertifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const pseudo = sansInvisibles(valeur);
  const pret =
    pseudo.length >= LONGUEUR_ACTIVISION.min &&
    pseudo.length <= LONGUEUR_ACTIVISION.max &&
    pseudo !== activisionId &&
    certifie;

  async function enregistre() {
    setBusy(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activisionId: pseudo }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.issues?.[0]?.message ?? charge.error?.message ?? 'Changement refusé.');
        return;
      }
      setOuvert(false);
      router.refresh();
    } catch {
      setErreur('Le serveur n’a pas répondu. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profil-activision">
      <p className="profil-activision-ligne" title="Pseudo Warzone (identifiant Activision)">
        <IconActivision className="profil-activision-logo" />
        {activisionId ? (
          <span translate="no">{activisionId}</span>
        ) : (
          <em>{moi ? 'Tu n’as pas encore donné ton pseudo en jeu' : 'Pas de pseudo en jeu'}</em>
        )}
        {moi && !ouvert && (
          <button
            type="button"
            className="profil-activision-changer"
            onClick={() => {
              setValeur(activisionId ?? '');
              setCertifie(false);
              setErreur(null);
              setOuvert(true);
            }}
          >
            {activisionId ? 'Changer' : 'Le donner'}
          </button>
        )}
      </p>

      {moi && ouvert && (
        <form
          className="profil-activision-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (pret && !busy) void enregistre();
          }}
        >
          <label className="sr-only" htmlFor={`${id}-pseudo`}>
            Ton pseudo en jeu (Warzone)
          </label>
          <input
            id={`${id}-pseudo`}
            className="field"
            value={valeur}
            onChange={(e) => {
              setValeur(e.target.value);
              setErreur(null);
            }}
            placeholder="Exactement comme en jeu"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <p className="profil-activision-note">
            Seulement si tu as changé de pseudo en jeu : c’est grâce à lui que la modération retrouve tes games sur les
            captures.
          </p>
          <label className="profil-activision-case">
            <input type="checkbox" checked={certifie} onChange={(e) => setCertifie(e.target.checked)} />
            <span>
              C’est <b>exactement</b> mon pseudo en jeu sur Warzone.
            </span>
          </label>
          {erreur && (
            <p className="profil-activision-erreur" role="alert">
              {erreur}
            </p>
          )}
          <div className="profil-activision-actions">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-sm btn-ice" disabled={!pret || busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
