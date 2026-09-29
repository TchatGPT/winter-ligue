'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { flakes } from '@/components/ui';
import { PACKS_REGLES, SUBS, nextMilestone } from '@/lib/domain/rules';

export interface ConfigSaison {
  maxGamesPerPlayer: number;
  totalSubs: number;
}

export interface JoueurSubs {
  id: string;
  pseudo: string;
  subsOfferts: number;
}

/**
 * Ce qui se règle une fois, ou une fois par soir : les subs, la limite de
 * games, la sauvegarde.
 *
 * Deux compteurs de subs, et la distinction compte. Le compteur de saison
 * verse à tout le monde et met les packs collectifs en file. Les subs offerts
 * par un joueur nommé lui valent ses packs Perso — c'est la seule chose qu'un
 * sub achète à quelqu'un en particulier, et elle passe par la file, jamais par
 * un versement direct.
 */
export function EcranSaison({
  config,
  joueurs,
  packsEnFile,
}: {
  config: ConfigSaison;
  joueurs: JoueurSubs[];
  packsEnFile: number;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [maxGames, setMaxGames] = useState(config.maxGamesPerPlayer);
  const [gifteur, setGifteur] = useState('');
  const [subsGifteur, setSubsGifteur] = useState<number>(PACKS_REGLES.persoTousLes);
  const [dernierVersement, setDernierVersement] = useState<string | null>(null);

  const prochain = nextMilestone(config.totalSubs);
  const joueurChoisi = joueurs.find((j) => j.id === gifteur);

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
      packs: string[];
      recipients: number;
      evenements?: { label: string; endsAt: string }[];
    };
    const evenements = (d.evenements ?? []).map((e) => e.label);
    setDernierVersement(
      (d.milestones.length === 0
        ? `+${delta} subs — aucun palier franchi`
        : `${d.milestones.join(', ')} — ${d.snowflakesEach} ❄ pour ${d.recipients} joueur(s)${
            d.packs.length ? ` + ${d.packs.length} pack(s) en file` : ''
          }`) + (evenements.length ? ` · évènements ouverts : ${evenements.join(', ')}` : ''),
    );
  }

  return (
    <Ecran
      titre="Saison"
      lead="Le compteur de subs, les subs offerts par les joueurs, la limite de games et la sauvegarde."
      message={message}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc
          titre="Compteur de subs"
          aide={
            <>
              Chaque palier verse à <strong className="text-muted">tous les joueurs actifs</strong>,
              à parts égales, et met les Boosters Commu et Folie en file. Aucun versement ne vise un
              joueur en particulier.
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
              <div className="num font-display text-3xl leading-none font-black text-aurora">
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

          <p className="mt-3 text-[13px] text-faint">
            {packsEnFile === 0
              ? 'Aucun booster en file.'
              : `${packsEnFile} booster${packsEnFile > 1 ? 's' : ''} en file, à ouvrir depuis l’écran des boosters.`}
          </p>
        </Bloc>

        <Bloc
          titre="Subs offerts par un joueur"
          aide={
            <>
              Un Booster Perso tous les {PACKS_REGLES.persoTousLes} subs offerts, mis en file pour ce
              joueur. À saisir <strong className="text-muted">en plus</strong> du compteur de
              saison : ces subs comptent aussi pour tout le monde.
            </>
          }
        >
          <div className="space-y-3">
            <select
              className="field w-full"
              value={gifteur}
              onChange={(e) => setGifteur(e.target.value)}
              aria-label="Joueur qui a offert des subs"
            >
              <option value="">— Joueur —</option>
              {joueurs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pseudo} — {p.subsOfferts} offert{p.subsOfferts > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                className="field num max-w-[120px]"
                min={1}
                max={10_000}
                value={subsGifteur}
                onChange={(e) => setSubsGifteur(Number(e.target.value))}
                aria-label="Nombre de subs offerts"
              />
              <button
                className="btn btn-ice flex-1"
                disabled={busy !== null || !gifteur || subsGifteur < 1}
                onClick={async () => {
                  const data = await envoie(
                    '/api/admin/subs',
                    { action: 'subs-joueur', playerId: gifteur, delta: subsGifteur },
                    { cle: 'subs-joueur', succes: 'Subs attribués.' },
                  );
                  if (!data) return;
                  const d = data as { subsOfferts: number; packsAjoutes: number };
                  setMessage({
                    kind: 'success',
                    text: `${joueurChoisi?.pseudo ?? 'Joueur'} : ${d.subsOfferts} subs offerts${
                      d.packsAjoutes ? ` — ${d.packsAjoutes} Booster(s) Perso en file` : ''
                    }.`,
                  });
                }}
              >
                Attribuer
              </button>
            </div>
            {joueurChoisi && (
              <p className="text-[13px] text-faint">
                Prochain Booster Perso dans{' '}
                {PACKS_REGLES.persoTousLes - (joueurChoisi.subsOfferts % PACKS_REGLES.persoTousLes)}{' '}
                sub(s).
              </p>
            )}
          </div>
        </Bloc>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc
          titre="Limite de games"
          aide="Le nombre de games comptées par joueur. La dernière ouvre le Booster Finisseur."
        >
          <div className="flex gap-2">
            <input
              id="max-games"
              type="number"
              className="field num"
              min={1}
              max={100}
              value={maxGames}
              onChange={(e) => setMaxGames(Number(e.target.value))}
              aria-label="Limite de games par joueur"
            />
            <button
              className="btn shrink-0"
              disabled={busy !== null}
              onClick={() =>
                envoie('/api/admin/config', { maxGamesPerPlayer: maxGames }, { methode: 'PATCH' })
              }
            >
              Appliquer
            </button>
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
