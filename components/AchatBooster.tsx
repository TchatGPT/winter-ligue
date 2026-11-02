'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { packArt } from '@/lib/domain/catalog';
import { ACHAT_PERSO, multiplicateurChance } from '@/lib/domain/rules';
import { num } from '@/lib/format';

const rienAEcouter = () => () => {};

/** « ×1,4 ». */
const fois = (m: number) => `×${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;

/**
 * Le solde de flocons, qu'on touche pour échanger 5 000 ❄ contre un Booster
 * Perso (`ACHAT_PERSO`). La fenêtre dit tout avant l'achat : le prix, le solde
 * qui reste, et la chance aux boosters, qui baisse avec lui.
 *
 * Le navigateur n'envoie qu'une clé d'achat, tirée à l'ouverture : le prix, le
 * solde et le droit d'acheter se décident sur le serveur
 * (`acheteBoosterPerso`). La fenêtre s'ouvre par un portail vers <body>,
 * comme le code cadeau : le verre du menu couperait un panneau accroché.
 */
export function AchatBooster({
  solde,
  className,
  title,
  children,
}: {
  solde: number;
  className: string;
  title?: string;
  /** Ce qu'on touche : la capsule du solde, ou le chiffre de la pastille. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  const [ouvert, setOuvert] = useState(false);
  const [cle, setCle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'erreur'; text: string } | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert]);

  function ouvre() {
    setMessage(null);
    setCle(crypto.randomUUID());
    setOuvert(true);
  }

  const { prix } = ACHAT_PERSO;
  const assez = solde >= prix;
  const apres = solde - prix;
  const chanceAvant = multiplicateurChance(solde);
  const chanceApres = multiplicateurChance(Math.max(0, apres));
  const achete = message?.kind === 'ok';
  const visuel = packArt('perso');

  async function echange() {
    if (busy || !assez || achete) return;
    setBusy(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/achat-booster', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cle }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({ kind: 'erreur', text: charge.error?.message ?? 'Achat refusé.' });
        return;
      }
      setMessage({ kind: 'ok', text: 'Booster Perso ajouté à ta file : il t’attend dans les boosters.' });
      router.refresh();
    } catch {
      setMessage({ kind: 'erreur', text: 'Le serveur n’a pas répondu. Réessaie dans un instant.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={ouvre} title={title}>
        {children}
      </button>

      {ouvert &&
        navigateur &&
        createPortal(
          <div
            className="fenetre-voile"
            role="dialog"
            aria-modal="true"
            aria-label="Échanger des flocons contre un Booster Perso"
            onClick={() => setOuvert(false)}
          >
            <div
              className="fenetre-carte achat-carte glass glass-reflet relative px-6 pt-7 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="btn btn-sm absolute top-4 right-4"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
              <div className="achat-tete">
                {visuel && (
                  // eslint-disable-next-line @next/next/no-img-element -- une planche déjà dimensionnée
                  <img className="achat-visuel" src={visuel} alt="" width={96} height={128} />
                )}
                <div className="min-w-0">
                  <h2 className="font-display text-2xl leading-none font-black tracking-wide text-ink uppercase">
                    Booster Perso
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">
                    Échange tes flocons contre un Booster Perso, à ouvrir quand tu veux dans les boosters.
                  </p>
                </div>
              </div>

              <dl className="achat-compte">
                <div>
                  <dt>Prix</dt>
                  <dd className="num">{num(prix)} ❄</dd>
                </div>
                <div>
                  <dt>Ton solde</dt>
                  <dd className="num">
                    {num(solde)} ❄
                    {assez && !achete && (
                      <>
                        <span className="achat-fleche" aria-label="puis">
                          →
                        </span>
                        {num(apres)} ❄
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Ta chance aux boosters</dt>
                  <dd className="num">
                    {fois(chanceAvant)}
                    {assez && !achete && chanceApres < chanceAvant && (
                      <>
                        <span className="achat-fleche" aria-label="puis">
                          →
                        </span>
                        <span className="text-danger">{fois(chanceApres)}</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>

              {!assez ? (
                <p className="achat-avertissement" data-kind="manque">
                  Il te manque <strong className="num">{num(prix - solde)} ❄</strong> pour un Booster Perso.
                </p>
              ) : (
                !achete && (
                  <p className="achat-avertissement">
                    {chanceApres < chanceAvant ? (
                      <>
                        Ta chance dépend de ton solde : dépenser {num(prix)} ❄ la fait passer de{' '}
                        <strong>{fois(chanceAvant)}</strong> à <strong>{fois(chanceApres)}</strong>, pour ce booster
                        et les suivants.
                      </>
                    ) : (
                      <>Ta chance dépend de ton solde : moins de flocons, moins de chance aux prochains boosters.</>
                    )}
                  </p>
                )
              )}

              {achete ? (
                <Link href="/boosters" className="btn btn-ice mt-4 w-full no-underline" onClick={() => setOuvert(false)}>
                  Ouvrir mes boosters
                </Link>
              ) : (
                <button type="button" className="btn btn-ice mt-4 w-full" disabled={busy || !assez} onClick={echange}>
                  {busy ? 'Échange…' : `Échanger ${num(prix)} ❄`}
                </button>
              )}
              {message && (
                <p className="cadeau-message" data-kind={message.kind} role="status">
                  {message.text}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
