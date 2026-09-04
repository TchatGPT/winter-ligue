'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { flakes } from '@/components/ui';
import { SUBS, nextMilestone } from '@/lib/domain/rules';

export interface ConfigSaison {
  maxGamesPerPlayer: number;
  shopOpen: boolean;
  marketOpen: boolean;
  totalSubs: number;
}

/**
 * Ce qui se règle une fois, ou une fois par soir : les subs, les vannes, la
 * sauvegarde.
 *
 * Rassemblé sur un écran parce que ces trois choses ont le même rythme — on n'y
 * touche pas en saisissant des games — et parce qu'elles portent le même risque :
 * elles s'appliquent à toute la ligue d'un coup.
 */
export function EcranSaison({
  config,
  joueurs,
}: {
  config: ConfigSaison;
  joueurs: { id: string; pseudo: string }[];
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [maxGames, setMaxGames] = useState(config.maxGamesPerPlayer);
  const [gifte, setGifte] = useState('');
  const [dernierVersement, setDernierVersement] = useState<string | null>(null);

  const prochain = nextMilestone(config.totalSubs);

  async function ajouteSubs(delta: number) {
    const data = await envoie(
      '/api/admin/subs',
      { action: 'subs', delta },
      { cle: `subs-${delta}`, succes: 'Subs enregistrés.' },
    );
    if (!data) return;
    const d = data as {
      milestones: string[];
      snowflakesEach: number;
      boostersEach: string[];
      recipients: number;
      evenements?: { label: string; endsAt: string }[];
    };
    const evenements = (d.evenements ?? []).map((e) => e.label);
    setDernierVersement(
      (d.milestones.length === 0
        ? `+${delta} subs — aucun palier franchi`
        : `${d.milestones.join(', ')} — ${d.snowflakesEach} ❄${
            d.boostersEach.length ? ` + ${d.boostersEach.length} booster(s)` : ''
          } pour ${d.recipients} joueur(s)`) +
        (evenements.length ? ` · évènements ouverts : ${evenements.join(', ')}` : ''),
    );
  }

  return (
    <Ecran
      titre="Saison"
      lead="Le compteur de subs, les vannes de la boutique et du marché, et la sauvegarde."
      message={message}
    >
      <Bloc
        titre="Compteur de subs"
        aide={
          <>
            Chaque palier verse à <strong className="text-muted">tous les joueurs actifs</strong>, à
            parts égales. Aucun versement ne peut viser un joueur en particulier — c’est l’invariant
            qui empêche d’acheter le classement d’un joueur.
          </>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SUBS.adminSteps.map((pas) => (
              <button
                key={pas}
                className="btn btn-sm"
                disabled={busy !== null}
                onClick={() => ajouteSubs(pas)}
              >
                +{pas}
              </button>
            ))}
          </div>
          <div className="text-right">
            <div className="num font-display text-3xl leading-none font-black text-violet">
              {flakes(config.totalSubs)}
            </div>
            {prochain && (
              <div className="text-[13px] text-faint">
                {prochain.milestone.label} dans {prochain.remaining} sub
                {prochain.remaining > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {dernierVersement && (
          <p className="mt-3 rounded-lg border border-aurora/40 bg-aurora/5 px-3 py-2 text-xs text-aurora">
            {dernierVersement}
          </p>
        )}

        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="label">Carte offerte par un gifteur ({SUBS.giftThreshold} subs)</p>
          <div className="flex flex-wrap gap-2">
            <select
              className="field flex-1"
              value={gifte}
              onChange={(e) => setGifte(e.target.value)}
              aria-label="Joueur désigné"
            >
              <option value="">— Joueur désigné —</option>
              {joueurs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pseudo}
                </option>
              ))}
            </select>
            <button
              className="btn shrink-0"
              disabled={busy !== null || !gifte}
              onClick={async () => {
                const fait = await envoie('/api/admin/subs', { action: 'gift', playerId: gifte });
                if (fait) setGifte('');
              }}
            >
              Offrir une commune
            </button>
          </div>
          <p className="mt-1.5 text-[13px] text-faint">
            Toujours une commune, jamais des flocons : le geste passe à l’antenne sans peser sur le
            classement. Maximum {SUBS.maxGiftedCardsPerDay} par joueur et par jour.
          </p>
        </div>
      </Bloc>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc titre="Vannes">
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="max-games">
                Limite de games par joueur
              </label>
              <div className="flex gap-2">
                <input
                  id="max-games"
                  type="number"
                  className="field num"
                  min={1}
                  max={100}
                  value={maxGames}
                  onChange={(e) => setMaxGames(Number(e.target.value))}
                />
                <button
                  className="btn shrink-0"
                  disabled={busy !== null}
                  onClick={() =>
                    envoie(
                      '/api/admin/config',
                      { maxGamesPerPlayer: maxGames },
                      { methode: 'PATCH' },
                    )
                  }
                >
                  Appliquer
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={`btn flex-1 ${config.shopOpen ? '' : 'btn-danger'}`}
                disabled={busy !== null}
                onClick={() =>
                  envoie('/api/admin/config', { shopOpen: !config.shopOpen }, { methode: 'PATCH' })
                }
              >
                Boutique&nbsp;: {config.shopOpen ? 'ouverte' : 'fermée'}
              </button>
              <button
                className={`btn flex-1 ${config.marketOpen ? '' : 'btn-danger'}`}
                disabled={busy !== null}
                onClick={() =>
                  envoie(
                    '/api/admin/config',
                    { marketOpen: !config.marketOpen },
                    { methode: 'PATCH' },
                  )
                }
              >
                Ventes&nbsp;: {config.marketOpen ? 'ouvertes' : 'fermées'}
              </button>
            </div>
          </div>
        </Bloc>

        <Bloc
          titre="Sauvegarde"
          aide="À exporter avant toute manipulation lourde. La restauration se fait par POST sur la même route, et elle est réservée aux administrateurs."
        >
          <a
            href="/api/admin/backup"
            className="btn no-underline"
            onClick={() => setMessage({ kind: 'success', text: 'Export lancé.' })}
          >
            Exporter la base (JSON)
          </a>
        </Bloc>
      </div>
    </Ecran>
  );
}
