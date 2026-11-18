'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Panneau, Pastille } from '@/components/admin/Kit';
import { VisuelBilan } from '@/components/admin/VisuelBilan';
import { SAISONS, parametresSaison, type ParametresSaison } from '@/lib/domain/rules';
import type { BilanSaison } from '@/lib/services/bilanSaison';

export interface RetourSubs {
  kind: 'success' | 'error';
  text: string;
}

/**
 * La saison (18/11/2026, ex-« Subs & saison ») : le bilan de la saison en
 * image, à partager sur Discord, et — pour son responsable — le changement de
 * saison. Le compteur de subs à la main, la limite de games, la sauvegarde et
 * le branchement de Twitch en sont partis : Twitch est branché, et la saison
 * règle la limite.
 */
export function EcranSaison({
  numero,
  bilan,
  responsable = false,
  retour = null,
}: {
  /** La saison en cours (`SAISONS`). */
  numero: number;
  bilan: BilanSaison;
  /** Le responsable de la saison (`RESPONSABLES_SAISON`) : lui seul la lance. */
  responsable?: boolean;
  /** Le retour d'un branchement de Twitch, s'il y en a eu un. */
  retour?: RetourSubs | null;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  /** Le retour du branchement Twitch, lu une fois puis refermé. */
  const [retourLu, setRetourLu] = useState(false);

  return (
    <EcranAdmin
      intro="Le bilan de la saison, à partager, et la saison en cours."
      grille="saison"
      message={message ?? (retour && !retourLu ? { kind: retour.kind, text: retour.text } : null)}
      onFermeMessage={() => {
        setMessage(null);
        setRetourLu(true);
      }}
    >
      {/* ------------------------------ Le bilan ------------------------------ */}
      <Panneau
        zone="bilan"
        ton="glace"
        titre="Bilan de la saison"
        sousTitre="Les chiffres de la saison en une image : copie-la, et colle-la dans Discord."
      >
        <VisuelBilan bilan={bilan} />
      </Panneau>

      {responsable && (
        <Panneau
          zone="changement"
          ton="glace"
          surtitre="Saison en cours"
          titre={parametresSaison(numero).nom}
        >
          <NouvelleSaison
            numero={numero}
            occupe={busy !== null}
            onLancer={(n) =>
              envoie(
                '/api/admin/saison',
                { numero: n },
                { cle: 'nouvelle-saison', succes: `${parametresSaison(n).nom} lancée : la ligue repart de zéro.` },
              )
            }
          />
        </Panneau>
      )}
    </EcranAdmin>
  );
}

/** Les réglages d'une saison, en une ligne. */
function resumeSaison(s: ParametresSaison): string {
  return [
    `${s.games} games`,
    `Booster Finisseur à la ${s.finisseurA}ᵉ`,
    s.uneParSessionApres !== null ? 'puis une game par session' : null,
    s.finalistes > 0 ? `finale à ${s.finalistes}` : 'pas de finale',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Les règles d'une saison, une par tuile, dans le choix de la saison. */
function detailsSaison(s: ParametresSaison): [string, string][] {
  return [
    ['Dates', s.periode],
    ['Games', String(s.games)],
    ['Booster Finisseur', `à la ${s.finisseurA}ᵉ`],
    ['Ensuite', s.uneParSessionApres !== null ? 'une game par session' : 'libre'],
    ['Finale', s.finalistes > 0 ? `à ${s.finalistes}` : 'pas de finale'],
    ['Solde maximum', `${s.soldeMax.toLocaleString('fr-FR')} ❄`],
  ];
}

/**
 * Changer de saison : la ligue repart de zéro (12/11/2026). Réservé au
 * responsable de la saison (Jex3_) : le panneau n'existe que pour lui. On
 * choisit la saison — la suivante, ou revenir à une d'avant pour la montrer —,
 * puis une fenêtre demande de confirmer.
 */
function NouvelleSaison({
  numero,
  occupe,
  onLancer,
}: {
  numero: number;
  occupe: boolean;
  onLancer: (numero: number) => Promise<Record<string, unknown> | null>;
}) {
  const suivante = SAISONS.find((s) => s.numero > numero)?.numero ?? numero;
  const [choix, setChoix] = useState(suivante);
  const [confirme, setConfirme] = useState(false);
  const saison = parametresSaison(choix);
  const court = saison.nom.split(' · ')[0];
  const verbe = choix > numero ? `Passer en ${court}` : choix < numero ? `Revenir en ${court}` : `Recommencer la ${court}`;

  useEffect(() => {
    if (!confirme) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !occupe) setConfirme(false);
    };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [confirme, occupe]);

  async function lance() {
    await onLancer(choix);
    setConfirme(false);
  }

  return (
    <section className="adm-nouvelle-saison">
      <div className="adm-saisons" role="radiogroup" aria-label="La saison à lancer">
        {SAISONS.map((s) => (
          <button
            key={s.numero}
            type="button"
            role="radio"
            aria-checked={choix === s.numero}
            className="adm-saison-choix"
            onClick={() => setChoix(s.numero)}
          >
            <span className="adm-saison-nom">
              {s.nom}
              {s.numero === numero && <Pastille ton="glace">en cours</Pastille>}
            </span>
            {/* Sur un écran bas, une ligne au lieu des tuiles. */}
            <span className="adm-saison-resume">
              {resumeSaison(s)} · solde max {s.soldeMax.toLocaleString('fr-FR')} ❄
            </span>
            <dl className="adm-saison-details">
              {detailsSaison(s).map(([nom, valeur]) => (
                <div key={nom}>
                  <dt>{nom}</dt>
                  <dd>{valeur}</dd>
                </div>
              ))}
            </dl>
          </button>
        ))}
      </div>
      <div className="adm-saison-bilan">
        <p data-sens="efface">
          <b>Repart de zéro</b>
          Les games et les points, les flocons, les boosters à ouvrir, les cartes, les duels, les évènements, les codes
          cadeaux, le compteur de subs et les subs offerts.
        </p>
        <p data-sens="reste">
          <b>Reste</b>
          Les joueurs inscrits et leurs comptes, les cartes et les boosters du catalogue, le journal. Chaque joueur
          repart avec ses 3 Jokers.
        </p>
      </div>
      <div className="adm-saison-lancer">
        <button type="button" className="btn btn-danger" disabled={occupe} onClick={() => setConfirme(true)}>
          {verbe}
        </button>
      </div>
      {confirme &&
        createPortal(
          <div
            className="fenetre-voile"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirme-saison"
            onClick={() => !occupe && setConfirme(false)}
          >
            <div
              className="fenetre-carte glass glass-reflet relative grid gap-4 px-6 pt-7 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="confirme-saison"
                className="font-display text-2xl leading-none font-black tracking-wide text-ink uppercase"
              >
                {verbe} ?
              </h2>
              <p className="text-[14px] leading-relaxed text-muted">
                Toute la ligue repart de zéro : games, points, flocons, boosters, cartes, duels, évènements, codes et
                subs. Les joueurs restent inscrits. Ça ne se récupère pas.
              </p>
              <p className="text-[14px] text-ink">{resumeSaison(saison)}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-ghost" disabled={occupe} onClick={() => setConfirme(false)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-danger" disabled={occupe} onClick={lance} autoFocus>
                  {occupe ? 'Remise à zéro…' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
