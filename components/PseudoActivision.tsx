'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { IconActivision } from '@/components/icons';
import { LONGUEUR_ACTIVISION, sansSuffixeActivision } from '@/lib/domain/activision';
import { sansInvisibles } from '@/lib/domain/texte';

/**
 * Le pseudo en jeu d'un joueur (identifiant Activision), au milieu de l'en-tête
 * de sa fiche, dans un puits creusé. Sur sa propre fiche, le joueur le change
 * lui-même (17/11/2026) : s'il change de pseudo en jeu en cours de ligue, c'est
 * ici qu'il le dit, sinon la modération ne le retrouve plus sur les captures.
 * Le serveur refuse un pseudo déjà pris, et le journal garde l'ancien et le
 * nouveau.
 *
 * Le changement se fait **sur place** : le pseudo devient un champ, suivi de ✓
 * et ✕, à la même hauteur ; dessous, la consigne ou le refus prennent la place
 * du bouton. Le puits ne change jamais de taille, l'en-tête non plus.
 */
export function PseudoActivision({ activisionId, moi }: { activisionId: string | null; moi: boolean }) {
  const router = useRouter();
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(activisionId ?? '');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Enregistré sans le « #1234567 », comme le fait le serveur.
  const pseudo = sansSuffixeActivision(sansInvisibles(valeur));
  const pret =
    pseudo.length >= LONGUEUR_ACTIVISION.min && pseudo.length <= LONGUEUR_ACTIVISION.max && pseudo !== activisionId;
  const edition = moi && ouvert;

  const ferme = () => {
    setOuvert(false);
    setErreur(null);
  };

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
    <div className="profil-activision" data-edition={edition || undefined}>
      <p className="profil-activision-titre">
        <IconActivision className="profil-activision-logo" />
        Pseudo en jeu
      </p>

      {edition ? (
        <form
          className="profil-activision-valeur"
          onSubmit={(e) => {
            e.preventDefault();
            if (pret && !busy) void enregistre();
          }}
        >
          <label className="sr-only" htmlFor={`${id}-pseudo`}>
            Ton pseudo en jeu sur Warzone, sans le #
          </label>
          <input
            id={`${id}-pseudo`}
            className="profil-activision-champ"
            value={valeur}
            onChange={(e) => {
              setValeur(e.target.value);
              setErreur(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') ferme();
            }}
            placeholder="Ton nouveau pseudo"
            maxLength={LONGUEUR_ACTIVISION.max * 2}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-invalid={erreur ? true : undefined}
            aria-describedby={`${id}-pied`}
          />
          <button
            type="submit"
            className="profil-activision-icone"
            data-ton="ok"
            disabled={!pret || busy}
            aria-label="Enregistrer mon pseudo en jeu"
            title="Enregistrer"
          >
            {busy ? '…' : '✓'}
          </button>
          <button
            type="button"
            className="profil-activision-icone"
            disabled={busy}
            onClick={ferme}
            aria-label="Annuler"
            title="Annuler"
          >
            ✕
          </button>
        </form>
      ) : (
        <p className="profil-activision-valeur">
          {activisionId ? (
            <span translate="no">{activisionId}</span>
          ) : (
            <em>{moi ? 'Pas encore donné' : 'Pas de pseudo en jeu'}</em>
          )}
        </p>
      )}

      {moi && (
        <p id={`${id}-pied`} className="profil-activision-pied" data-erreur={edition && erreur ? '' : undefined}>
          {edition ? (
            (erreur ?? 'Exactement comme en jeu, sans le #')
          ) : (
            <button
              type="button"
              className="profil-activision-changer"
              onClick={() => {
                setValeur(activisionId ?? '');
                setErreur(null);
                setOuvert(true);
              }}
            >
              {activisionId ? 'Changer' : 'Le donner'}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
