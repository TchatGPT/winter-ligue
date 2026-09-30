import Link from 'next/link';
import { Bloc, Chiffre, Ecran } from '@/components/admin/Cadre';
import { EmptyState, RarityChip, flakes } from '@/components/ui';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { nextMilestone } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';
import { dernieresOuvertures, fileDesPacks } from '@/lib/services/packs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vue d’ensemble — Administration' };

/**
 * La vue d'ensemble : ce qu'on regarde en arrivant.
 *
 * Des chiffres, et rien à remplir. Les boosters en attente se lisent ici mais
 * s'ouvrent sur leur page, à l'antenne ; les games se saisissent depuis le
 * classement. Un écran d'accueil qui porte un formulaire finit par recevoir
 * des saisies faites sans le vouloir.
 */
export default async function AdminAccueilPage() {
  await exigeRole('moderateur');
  const store = getStore();

  const [data, journal] = await Promise.all([
    store.read((db) => {
      const actifs = db.players.filter((p) => p.active);
      const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
      return {
        joueurs: actifs.length,
        avecDroits: actifs.filter((p) => p.role === 'moderateur' || p.role === 'admin').length,
        games: db.games.filter((g) => !g.skipped).length,
        cartesEnAttente: db.cartesEnAttente.filter((c) => c.consommeeA === null).length,
        subs: db.config.totalSubs,
        file: fileDesPacks(db),
        ouvertures: dernieresOuvertures(db, 6),
        dernieresGames: [...db.games]
          .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
          .slice(0, 7)
          .map((g) => ({
            id: g.id,
            pseudo: pseudo(g.playerId),
            kills: g.kills,
            placement: g.placement,
            score: g.score,
            skipped: g.skipped,
            playedAt: g.playedAt,
          })),
      };
    }),
    store.journal(8),
  ]);

  const prochain = nextMilestone(data.subs);

  return (
    <Ecran titre="Vue d’ensemble" lead="L’état de la ligue, ce qui attend l’antenne, et les dernières traces du journal.">
      <section className="admin-chiffres">
        <Chiffre label="Joueurs actifs" valeur={data.joueurs} note={`dont ${data.avecDroits} avec des droits`} />
        <Chiffre label="Games comptées" valeur={data.games} note={`${data.cartesEnAttente} carte(s) en attente`} />
        <Chiffre
          label="Boosters à ouvrir"
          valeur={data.file.length}
          note={data.file.length ? 'sur la page Boosters' : 'rien en attente'}
          accent="ice"
        />
        <Chiffre
          label="Subs de la saison"
          valeur={flakes(data.subs)}
          note={prochain ? `${prochain.milestone.label} dans ${prochain.remaining}` : 'tous les paliers franchis'}
          accent="aurora"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Bloc
          titre="Boosters à ouvrir"
          icone="rocket"
          neige="admin-file"
          aide="Dans l’ordre d’arrivée. Ils s’ouvrent à l’antenne, sur la page Boosters : l’overlay du stream suit."
          actions={
            <Link href="/boosters" className="btn btn-sm btn-ice no-underline">
              Ouvrir →
            </Link>
          }
        >
          {data.file.length === 0 ? (
            <EmptyState title="Rien en attente" hint="Les subs, les paliers et les fins de saison remplissent cette file." />
          ) : (
            <ul className="admin-liste">
              {data.file.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <span className="admin-liste-titre">{p.nom}</span>
                  <span className="admin-liste-detail">
                    {p.pseudo ? `pour ${p.pseudo}` : 'pour la communauté'} · {p.raison}
                  </span>
                  <time className="admin-liste-date">{shortDateTime(p.creeA)}</time>
                </li>
              ))}
              {data.file.length > 8 && (
                <li className="admin-liste-plus">…et {data.file.length - 8} autre(s).</li>
              )}
            </ul>
          )}
        </Bloc>

        <Bloc titre="Dernières ouvertures" icone="layers" aide="Ce qui est sorti des boosters, et pour qui.">
          {data.ouvertures.length === 0 ? (
            <EmptyState title="Aucune ouverture" hint="La première carte tirée apparaîtra ici." />
          ) : (
            <ul className="admin-liste">
              {data.ouvertures.map((o) => (
                <li key={o.id}>
                  <span className="admin-liste-titre">
                    <RarityChip rarity={o.rarity} taille={16} /> {o.nom}
                  </span>
                  <span className="admin-liste-detail">
                    {o.pack} · {o.pseudo ? `pour ${o.pseudo}` : o.tous ? 'toute la ligue' : o.beneficiaires.join(', ')}
                  </span>
                  <time className="admin-liste-date">{shortDateTime(o.openedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </Bloc>

        <Bloc titre="Dernières games" icone="trophy" aide="Saisies depuis le classement, par capture de fin de game.">
          {data.dernieresGames.length === 0 ? (
            <EmptyState title="Aucune game" hint="La première saisie apparaîtra ici." />
          ) : (
            <ul className="admin-liste">
              {data.dernieresGames.map((g) => (
                <li key={g.id} data-eteint={g.skipped ? '' : undefined}>
                  <span className="admin-liste-titre">{g.pseudo}</span>
                  <span className="admin-liste-detail">
                    {g.kills} kills{g.placement ? ` · Top ${g.placement}` : ''} ·{' '}
                    <strong className="text-ice">{flakes(g.score)} pts</strong>
                    {g.skipped ? ' · passée' : ''}
                  </span>
                  <time className="admin-liste-date">{shortDateTime(g.playedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </Bloc>

        <Bloc
          titre="Dernières actions"
          icone="book"
          aide="Le journal, en ajout seul : rien ne s’y efface."
          actions={
            <Link href="/admin/journal" className="btn btn-sm no-underline">
              Tout le journal
            </Link>
          }
        >
          {journal.length === 0 ? (
            <EmptyState title="Rien encore" hint="Chaque action de modération laisse une ligne ici." />
          ) : (
            <ul className="admin-liste">
              {journal.map((e) => (
                <li key={e.id}>
                  <span className="admin-liste-titre">{e.action.replaceAll('_', ' ').toLowerCase()}</span>
                  <span className="admin-liste-detail">{e.detail}</span>
                  <time className="admin-liste-date">{shortDateTime(e.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </Bloc>
      </div>
    </Ecran>
  );
}
