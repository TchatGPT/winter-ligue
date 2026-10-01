'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { IconSnowflake } from '@/components/icons';
import { montantDuJour } from '@/lib/domain/cadeauDuJour';
import { CADEAU_DU_JOUR } from '@/lib/domain/rules';
import { num } from '@/lib/format';
import type { EtatCadeau } from '@/lib/services/cadeauDuJour';

const rienAEcouter = () => () => {};

/**
 * Le cadeau du jour, près du solde : une tuile dans le menu, sous la capsule
 * des flocons, et une pastille dans le solde de l'en-tête mobile — toujours
 * là, dorée et marquée d'un point tant qu'il attend. Un clic ouvre sa fenêtre — qu'il soit pris ou non : la semaine jour
 * par jour, la série, ce que vaut demain, et le bouton pour le prendre s'il
 * attend encore.
 *
 * La tuile montre la semaine en cours — sept crans, le septième doré, celui
 * qui vaut plus. Le navigateur ne fait que demander : le jour, la série et le
 * montant se décident sur le serveur (`lib/services/cadeauDuJour.ts`). Le
 * compte à rebours jusqu'à minuit n'est qu'un affichage.
 *
 * La fenêtre s'ouvre au centre de l'écran, par un portail vers <body>, comme
 * celle du code cadeau : les plaques de verre du menu portent un
 * backdrop-filter, qui couperait un panneau accroché au bouton.
 */
export function CadeauDuJour({ etat, variante }: { etat: EtatCadeau; variante: 'tuile' | 'pastille' }) {
  const router = useRouter();
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'erreur';
    text: string;
  } | null>(null);

  const dispo = etat.eligible && !etat.dejaPris;

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
    setOuvert(true);
  }

  async function prends() {
    if (!dispo || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/cadeau-du-jour', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({
          kind: 'erreur',
          text: charge.error?.message ?? 'Cadeau indisponible.',
        });
        return;
      }
      const { recu, montant } = charge.data as {
        recu: number;
        montant: number;
      };
      setMessage({
        kind: 'ok',
        text: recu < montant ? `+${num(recu)} ❄ : ton solde touche le plafond.` : `+${num(recu)} ❄ sur ton solde !`,
      });
      router.refresh();
    } catch {
      setMessage({ kind: 'erreur', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(false);
    }
  }

  const aide = !etat.eligible
    ? 'Après ta première game'
    : etat.dejaPris
      ? `Pris · série de ${etat.serie} jour${etat.serie > 1 ? 's' : ''} — reviens demain`
      : `+${num(etat.montant)} ❄ · jour ${etat.jour} sur ${CADEAU_DU_JOUR.cycle}`;

  return (
    <>
      {variante === 'pastille' ? (
        <button
          type="button"
          className="cadeau-jour-pastille"
          data-dispo={dispo ? '' : undefined}
          onClick={ouvre}
          aria-label={dispo ? `Cadeau du jour : ${etat.montant} flocons à prendre` : 'Cadeau du jour'}
          title={dispo ? `Cadeau du jour : +${etat.montant} ❄` : 'Cadeau du jour'}
        >
          <IconSnowflake className="h-[15px] w-[15px]" />
        </button>
      ) : (
        <button type="button" className="cadeau-jour-tuile" data-dispo={dispo ? '' : undefined} onClick={ouvre}>
          <span className="code-cadeau-medaillon cadeau-jour-medaillon" aria-hidden="true">
            <IconSnowflake className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="code-cadeau-titre">Cadeau du jour</span>
            <span className="code-cadeau-aide">{aide}</span>
            {etat.eligible && (
              <span className="cadeau-jour-semaine" aria-hidden="true">
                {Array.from({ length: CADEAU_DU_JOUR.cycle }, (_, i) => (
                  <i
                    key={i}
                    data-fait={estFait(etat, i + 1) ? '' : undefined}
                    data-septieme={i === CADEAU_DU_JOUR.cycle - 1 ? '' : undefined}
                  />
                ))}
              </span>
            )}
          </span>
          <span className="code-cadeau-fleche cadeau-jour-fleche" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {ouvert &&
        navigateur &&
        createPortal(
          <FenetreCadeauDuJour
            etat={etat}
            busy={busy}
            message={message}
            onPrendre={prends}
            onFermer={() => setOuvert(false)}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * La fenêtre du cadeau du jour : la règle, la semaine case par case, et
 * selon le jour le bouton pour le prendre ou ce que vaudra demain. Exportée
 * à part pour être rendue telle quelle dans les maquettes.
 */
export function FenetreCadeauDuJour({
  etat,
  busy,
  message,
  onPrendre,
  onFermer,
}: {
  etat: EtatCadeau;
  busy: boolean;
  message: { kind: 'ok' | 'erreur'; text: string } | null;
  onPrendre: () => void;
  onFermer: () => void;
}) {
  return (
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-label="Cadeau du jour" onClick={onFermer}>
      <div
        className="fenetre-carte cadeau-carte cadeau-jour-fenetre glass glass-reflet relative px-6 pt-7 pb-6 lg:px-9 lg:pt-9 lg:pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="btn btn-sm absolute top-4 right-4" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <span className="cadeau-medaillon cadeau-jour-medaillon-grand" aria-hidden="true">
          <IconSnowflake className="h-6 w-6 lg:h-7 lg:w-7" />
        </span>
        <h2 className="mt-3 font-display text-2xl leading-none font-black tracking-wide text-ink uppercase lg:mt-4 lg:text-[34px]">
          Cadeau du jour
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted lg:mt-3 lg:text-[16px]">
          Chaque jour, {num(CADEAU_DU_JOUR.parJour)} ❄ ; le {CADEAU_DU_JOUR.cycle}ᵉ jour d’affilée,{' '}
          {num(CADEAU_DU_JOUR.septiemeJour)} ❄, puis la semaine recommence. Un jour manqué, et la série repart du
          premier jour. Le jour change à minuit, heure de Paris.
        </p>

        <ol className="cadeau-jour-calendrier" aria-label="La semaine en cours">
          {Array.from({ length: CADEAU_DU_JOUR.cycle }, (_, i) => {
            const jour = i + 1;
            const fait = etat.eligible && estFait(etat, jour);
            const aujourdhui = etat.eligible && jour === etat.jour;
            return (
              <li
                key={jour}
                className="cadeau-jour-case"
                data-fait={fait ? '' : undefined}
                data-aujourdhui={aujourdhui ? '' : undefined}
                data-septieme={jour === CADEAU_DU_JOUR.cycle ? '' : undefined}
              >
                <span className="cadeau-jour-case-jour">J{jour}</span>
                <span className="cadeau-jour-case-montant num">{fait ? '✓' : `+${num(montantDuJour(jour))}`}</span>
              </li>
            );
          })}
        </ol>

        <div className="cadeau-jour-etat">
          {!etat.eligible ? (
            <p className="text-[14px] text-muted lg:text-[16px]">Le cadeau du jour s’ouvre après ta première game dans la ligue.</p>
          ) : etat.dejaPris ? (
            <>
              <p className="text-[14px] text-ink-2 lg:text-[16px]">
                Pris aujourd’hui · série de <strong className="text-ink">{etat.serie}</strong> jour
                {etat.serie > 1 ? 's' : ''}.
              </p>
              <p className="mt-1 text-[14px] text-muted lg:text-[16px]">
                Demain : <strong className="text-ice">+{num(montantDuJour(etat.serie + 1))} ❄</strong>
                <AvantMinuit />
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-2 lg:text-[16px]">
                Jour <strong className="text-ink">{etat.jour}</strong> sur {CADEAU_DU_JOUR.cycle}
                {etat.serie > 1 ? ` · série de ${etat.serie} jours` : ''}.
              </p>
              <button type="button" className="btn btn-ice mt-3 w-full lg:mt-4" onClick={onPrendre} disabled={busy}>
                Prendre +{num(etat.montant)} ❄
              </button>
            </>
          )}
        </div>

        {message && (
          <p className="cadeau-message" data-kind={message.kind} role="status">
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

/** Le jour `jour` de la semaine (1 à 7) est-il déjà pris ? */
function estFait(etat: EtatCadeau, jour: number): boolean {
  return jour < etat.jour || (etat.dejaPris && jour === etat.jour);
}

/** Les secondes qui restent avant minuit à Paris — un affichage, rien de plus. */
function avantMinuitAParis(now = new Date()): number {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const v = (t: string) => Number(parties.find((p) => p.type === t)?.value ?? 0);
  return 86_400 - (v('hour') * 3600 + v('minute') * 60 + v('second'));
}

/** « , dans 5 h 12 » — rafraîchi chaque minute. */
function AvantMinuit() {
  const [reste, setReste] = useState(() => avantMinuitAParis());
  useEffect(() => {
    const t = window.setInterval(() => setReste(avantMinuitAParis()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const h = Math.floor(reste / 3600);
  const m = Math.floor((reste % 3600) / 60);
  return <>, dans {h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min`}</>;
}
