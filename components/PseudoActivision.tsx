'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { IconActivision } from '@/components/icons';
import { LONGUEUR_ACTIVISION, sansSuffixeActivision } from '@/lib/domain/activision';
import { sansInvisibles } from '@/lib/domain/texte';

/**
 * Le pseudo en jeu d'un joueur (identifiant Activision), au milieu de l'en-tête
 * de sa fiche, en pilule fine. Sur sa propre fiche, le joueur le change
 * lui-même (17/11/2026) : s'il change de pseudo en jeu en cours de ligue, c'est
 * ici qu'il le dit, sinon la modération ne le retrouve plus sur les captures.
 * Le serveur refuse un pseudo déjà pris, et le journal garde l'ancien et le
 * nouveau.
 *
 * Le changement se fait **sur place** : le pseudo devient un champ, suivi de ✓
 * et ✕, à la même hauteur ; la consigne ou le refus s'affichent en bulle
 * dessous, par-dessus. La pilule ne change pas de hauteur, l'en-tête non plus.
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
    <div className="profil-activision" data-edition={edition || undefined} title="Pseudo en jeu (Activision)">
      <IconActivision className="profil-activision-logo" />
      {edition ? (
        <form
          className="profil-activision-form"
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
            placeholder="Nouveau pseudo, sans le #"
            maxLength={LONGUEUR_ACTIVISION.max * 2}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-invalid={erreur ? true : undefined}
            aria-describedby={`${id}-bulle`}
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
          {/* La consigne, ou le refus : en bulle sous la pilule, par-dessus. */}
          <span
            id={`${id}-bulle`}
            className="profil-activision-bulle"
            data-erreur={erreur ? '' : undefined}
            role={erreur ? 'alert' : undefined}
          >
            {erreur ?? 'Exactement comme en jeu, sans le #'}
          </span>
        </form>
      ) : (
        <>
          {activisionId ? (
            <span className="profil-activision-pseudo" translate="no">
              {activisionId}
            </span>
          ) : (
            <em className="profil-activision-pseudo">{moi ? 'Pseudo en jeu à donner' : 'Pas de pseudo en jeu'}</em>
          )}
          {moi && (
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
        </>
      )}
    </div>
  );
}
