'use client';

import { Ecran } from '@/components/admin/Cadre';
import { EmptyState, flakes } from '@/components/ui';
import { shortDateTime } from '@/lib/format';

export interface LigneGame {
  id: string;
  pseudo: string;
  kills: number;
  placement: number | null;
  bonusPoints: number;
  score: number;
  playedAt: string;
  note: string | null;
}

/**
 * Les dernières games enregistrées.
 *
 * La saisie, elle, se fait par capture de fin de game, sur la page du
 * classement : c'est là que la modération regarde le résultat. Il n'y a pas
 * de saisie à la main.
 */
export function EcranGames({
  recentes,
}: {
  recentes: LigneGame[];
}) {
  return (
    <Ecran
      titre="Games"
      lead={
        <>
          Les games se saisissent par capture de fin de game, depuis la page du classement, avec le
          bouton « Saisir avec l’IA ». Le score et les flocons sont calculés par le serveur à partir
          des kills et du classement ; ni multiplicateur ni bonus ne se saisissent.
        </>
      }
      message={null}
    >
      <section className="glass">
        <h3 className="border-b border-white/10 px-4 py-2.5 font-display text-sm font-black tracking-wider text-ink uppercase">
          Dernières games
        </h3>
        {recentes.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Aucune game" hint="La première saisie apparaîtra ici." />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Joueur</th>
                  <th className="text-right">Kills</th>
                  <th className="text-right">Top</th>
                  <th className="text-right">Cartes</th>
                  <th className="text-right">Score</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((g) => (
                  <tr key={g.id}>
                    <td className="text-xs whitespace-nowrap text-faint">
                      {shortDateTime(g.playedAt)}
                    </td>
                    <td className="text-ink">{g.pseudo}</td>
                    <td className="num text-right text-muted">{g.kills}</td>
                    <td className="num text-right text-muted">{g.placement ?? '—'}</td>
                    <td
                      className={`num text-right ${g.bonusPoints > 0 ? 'text-aurora' : g.bonusPoints < 0 ? 'text-danger' : 'text-faint'}`}
                    >
                      {g.bonusPoints === 0 ? '—' : g.bonusPoints > 0 ? `+${g.bonusPoints}` : g.bonusPoints}
                    </td>
                    <td className="num text-right font-bold text-ice">{flakes(g.score)}</td>
                    <td className="text-xs text-muted">{g.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Ecran>
  );
}
