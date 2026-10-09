'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { SnowCap } from '@/components/SnowCap';
import { LONGUEUR_ACTIVISION } from '@/lib/domain/activision';
import { sansInvisibles } from '@/lib/domain/texte';

/** Un modérateur qui ne joue pas peut fermer la fenêtre : on s'en souvient ici. */
const CLE_SANS_JOUER = 'wl-modo-sans-jouer';

const lisSansJouer = () => {
  try {
    return window.localStorage.getItem(CLE_SANS_JOUER) === '1';
  } catch {
    return false;
  }
};
const ecouteStockage = (rappel: () => void) => {
  window.addEventListener('storage', rappel);
  return () => window.removeEventListener('storage', rappel);
};

type Etape = 'saisie' | 'verification' | 'inscrit';

/**
 * L'inscription à la Winter Ligue : la fenêtre qui s'ouvre à la première
 * connexion, par-dessus la page, et ne se referme qu'une fois le pseudo en
 * jeu donné.
 *
 *  1. **Saisie** — le pseudo tel qu'il s'affiche dans Warzone, au caractère
 *     près : c'est lui que la modération cherche sur les captures de fin de
 *     game pour saisir les games. Tout caractère est accepté ; seuls les
 *     invisibles sont retirés, comme le fait le serveur.
 *  2. **Vérification** — le pseudo en grand, tel qu'il sera enregistré, et une
 *     case à cocher : « c'est exactement mon pseudo en jeu ».
 *  3. **Inscrit** — et l'on entre dans la ligue.
 *
 * Il ne se donne qu'une fois : ensuite, seule la modération le corrige. La
 * mise en page ne pose la fenêtre que pour un joueur sans pseudo, jamais pour
 * la streameuse. Un modérateur qui ne joue pas peut la fermer.
 */
export function InscriptionWarzone({ pseudoTwitch, admin }: { pseudoTwitch: string; admin: boolean }) {
  const router = useRouter();
  const id = useId();
  const [etape, setEtape] = useState<Etape>('saisie');
  const [valeur, setValeur] = useState('');
  const [certifie, setCertifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fermee, setFermee] = useState(false);
  const sansJouer = useSyncExternalStore(ecouteStockage, lisSansJouer, () => false);
  const ouverte = !fermee && !(admin && sansJouer);

  // La page derrière ne défile pas tant que la fenêtre est ouverte.
  useEffect(() => {
    if (!ouverte) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = avant;
    };
  }, [ouverte]);

  if (!ouverte) return null;

  const pseudo = sansInvisibles(valeur);
  const tropLong = pseudo.length > LONGUEUR_ACTIVISION.max;
  const pret = pseudo.length >= LONGUEUR_ACTIVISION.min && !tropLong;

  async function inscris() {
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
        setErreur(charge.error?.issues?.[0]?.message ?? charge.error?.message ?? 'Inscription refusée.');
        setEtape('saisie');
        return;
      }
      setEtape('inscrit');
    } catch {
      setErreur('Le serveur n’a pas répondu. Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="insc-fond" role="presentation">
      <section className="glass glass-reflet insc" role="dialog" aria-modal="true" aria-labelledby={`${id}-titre`}>
        <SnowCap radius="var(--r-lg)" seed="inscription" epaisseur={18} />

        {etape !== 'inscrit' && (
          <ol className="insc-etapes" aria-label="Les étapes de l’inscription">
            <li aria-current={etape === 'saisie' ? 'step' : undefined}>
              <span>1</span> Ton pseudo
            </li>
            <li aria-current={etape === 'verification' ? 'step' : undefined}>
              <span>2</span> Vérification
            </li>
          </ol>
        )}

        {etape === 'saisie' && (
          <form
            className="insc-corps"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pret) return;
              setCertifie(false);
              setEtape('verification');
            }}
          >
            <p className="eyebrow">Bienvenue, {pseudoTwitch}</p>
            <h2 id={`${id}-titre`} className="insc-titre">
              Inscris-toi à la Winter Ligue
            </h2>
            <p className="insc-phrase">
              Une seule étape : ton <b>pseudo en jeu</b> sur Warzone. C’est grâce à lui que la modération retrouve tes
              games sur les captures de fin de partie, et les saisit pour toi.
            </p>

            <label className="insc-label" htmlFor={`${id}-pseudo`}>
              Ton pseudo en jeu <span>(Warzone)</span>
            </label>
            <input
              id={`${id}-pseudo`}
              className="field insc-champ"
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
              aria-describedby={`${id}-consigne`}
              aria-invalid={tropLong || erreur ? true : undefined}
            />
            {(tropLong || erreur) && (
              <p className="insc-erreur" role="alert">
                {erreur ?? 'Soixante caractères au plus.'}
              </p>
            )}

            <div id={`${id}-consigne`} className="insc-consigne">
              <p className="insc-consigne-titre">Exactement comme il s’affiche en jeu</p>
              <ul>
                <li>Même orthographe, mêmes majuscules, mêmes symboles.</li>
                <li>Pas un pseudo approchant, ni ton pseudo Twitch.</li>
                <li>Sinon, la modération ne te retrouvera pas sur les captures : tes games ne compteront pas.</li>
              </ul>
            </div>

            <button type="submit" className="btn btn-ice insc-bouton" disabled={!pret}>
              Continuer
            </button>
            {admin && <BoutonSansJouer onFerme={() => setFermee(true)} />}
          </form>
        )}

        {etape === 'verification' && (
          <form
            className="insc-corps"
            onSubmit={(e) => {
              e.preventDefault();
              if (certifie && !busy) void inscris();
            }}
          >
            <p className="eyebrow">Dernière vérification</p>
            <h2 id={`${id}-titre`} className="insc-titre">
              C’est bien ton pseudo en jeu ?
            </h2>
            <p className="insc-phrase">Il sera enregistré exactement comme ceci :</p>
            <p className="insc-apercu" translate="no">
              {pseudo}
            </p>
            <label className="insc-case">
              <input type="checkbox" checked={certifie} onChange={(e) => setCertifie(e.target.checked)} />
              <span>
                C’est <b>exactement</b> mon pseudo en jeu sur Warzone.
              </span>
            </label>
            <p className="insc-note">
              Une fois inscrit, tu ne pourras plus le changer toi-même : seule la modération le pourra.
            </p>
            <div className="insc-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setEtape('saisie')}>
                ← Corriger
              </button>
              <button type="submit" className="btn btn-ice" disabled={!certifie || busy}>
                {busy ? 'Inscription…' : 'M’inscrire à la ligue'}
              </button>
            </div>
          </form>
        )}

        {etape === 'inscrit' && (
          <div className="insc-corps insc-fin">
            <p className="eyebrow">C’est fait</p>
            <h2 id={`${id}-titre`} className="insc-titre">
              Bienvenue dans la Winter Ligue
            </h2>
            <p className="insc-phrase">
              Ton pseudo <b translate="no">{pseudo}</b> est enregistré. Joue tes games en live : la modération les
              saisit, et ton score monte au classement.
            </p>
            <button
              type="button"
              className="btn btn-ice insc-bouton"
              onClick={() => {
                setFermee(true);
                router.refresh();
              }}
            >
              Découvrir la ligue
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Pour un modérateur qui ne joue pas : fermer, et ne plus la revoir sur cet appareil. */
function BoutonSansJouer({ onFerme }: { onFerme: () => void }) {
  return (
    <button
      type="button"
      className="insc-sans-jouer"
      onClick={() => {
        try {
          window.localStorage.setItem(CLE_SANS_JOUER, '1');
        } catch {
          // Navigation privée : la fenêtre reviendra à la prochaine visite.
        }
        onFerme();
      }}
    >
      Je modère sans jouer : fermer
    </button>
  );
}
