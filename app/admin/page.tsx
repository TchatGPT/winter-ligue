import Link from 'next/link';
import { Bloc, Chiffre, Ecran } from '@/components/admin/Cadre';
import { EmptyState, flakes } from '@/components/ui';
import { exigeRole } from '@/lib/auth/acces';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { nextMilestone, PACKS_REGLES } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { cadeauxEnAttente } from '@/lib/domain/twitchSubs';
import { shortDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vue d’ensemble — Modération' };

/** Assez de registre pour additionner les cadeaux d'une saison ; la liste n'en montre que le début. */
const REGISTRE = 2000;
const SUBS_AFFICHES = 40;

/**
 * La vue d'ensemble : les joueurs inscrits, et les subs — qui, combien, quand,
 * et qui a offert des subs sans être inscrit à la ligue, ses Boosters Perso en
 * attente de son inscription.
 */
export default async function AdminAccueilPage() {
  await exigeRole('admin');
  const store = getStore();
  const chaine = chaineDeLaLigue();

  const [ligue, registre] = await Promise.all([
    store.read((db) => ({
      joueurs: db.players
        .filter((p) => p.active)
        .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          pseudo: p.pseudo,
          twitchId: p.twitchId,
          inscritLe: p.joinedAt,
          modo: p.role === 'admin',
          streameuse: estLaStreameuse(p, chaine),
        })),
      subs: db.config.totalSubs,
    })),
    store.subsTwitch(REGISTRE),
  ]);

  const inscrits = new Set(ligue.joueurs.map((j) => j.twitchId).filter((id): id is string => Boolean(id)));
  const enAttente = cadeauxEnAttente(registre, inscrits);
  const subsEnAttente = enAttente.reduce((n, c) => n + c.subs, 0);
  const dernier = ligue.joueurs[0] ?? null;
  const prochain = nextMilestone(ligue.subs);

  return (
    <Ecran titre="Vue d’ensemble" lead="Les joueurs inscrits, et les subs : qui, combien, quand — et qui attend son Booster Perso.">
      <section className="admin-chiffres">
        <Chiffre label="Joueurs inscrits" valeur={ligue.joueurs.length} note="par Twitch" />
        <Chiffre
          label="Dernier inscrit"
          valeur={dernier ? dernier.pseudo : '—'}
          note={dernier ? shortDateTime(dernier.inscritLe) : 'personne encore'}
          accent="ice"
        />
        <Chiffre
          label="Subs de la saison"
          valeur={flakes(ligue.subs)}
          note={prochain ? `${prochain.milestone.label} dans ${prochain.remaining}` : 'tous les paliers franchis'}
          accent="aurora"
        />
        <Chiffre
          label="Cadeaux en attente"
          valeur={enAttente.length}
          note={enAttente.length ? `${subsEnAttente} subs offerts par des non-inscrits` : 'aucun donateur non inscrit'}
          accent="gold"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Bloc
          titre="Subs cadeaux en attente"
          icone="snowflake"
          neige="admin-attente"
          aide={`Ils ont offert des subs sans être inscrits à la ligue. Un Booster Perso tous les ${PACKS_REGLES.persoTousLes} subs offerts : dès qu’ils s’inscrivent, ajoute-les dans Joueurs.`}
        >
          {enAttente.length === 0 ? (
            <EmptyState title="Personne en attente" hint="Un donateur non inscrit apparaîtra ici." />
          ) : (
            <ul className="admin-liste">
              {enAttente.map((c) => {
                const boosters = Math.floor(c.subs / PACKS_REGLES.persoTousLes);
                return (
                  <li key={c.twitchId}>
                    <span className="admin-liste-titre">{c.pseudo}</span>
                    <span className="admin-liste-detail">
                      {c.subs} sub{c.subs > 1 ? 's' : ''} offert{c.subs > 1 ? 's' : ''} ·{' '}
                      <strong className="text-aurora">
                        {boosters} Booster{boosters > 1 ? 's' : ''} Perso
                      </strong>{' '}
                      à son inscription
                    </span>
                    <time className="admin-liste-date">{shortDateTime(c.dernier)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </Bloc>

        <Bloc titre="Les subs" icone="antenne" aide="Chaque sub compté depuis Twitch, le plus récent en tête.">
          {registre.length === 0 ? (
            <EmptyState title="Aucun sub encore" hint="Chaque sub et chaque cadeau arrivé par Twitch s’inscrit ici." />
          ) : (
            <ul className="admin-liste">
              {registre.slice(0, SUBS_AFFICHES).map((s) => (
                <li key={s.id}>
                  <span className="admin-liste-titre">
                    {s.pseudo}
                    {s.twitchId && !inscrits.has(s.twitchId) && (
                      <span className="ml-2 text-[12px] font-normal tracking-[0.12em] text-gold uppercase">
                        pas inscrit
                      </span>
                    )}
                  </span>
                  <span className="admin-liste-detail">
                    {s.genre === 'cadeau'
                      ? `${s.nombre} sub${s.nombre > 1 ? 's' : ''} offert${s.nombre > 1 ? 's' : ''}`
                      : 'sub'}{' '}
                    · niveau {s.niveau}
                  </span>
                  <time className="admin-liste-date">{shortDateTime(s.le)}</time>
                </li>
              ))}
              {registre.length > SUBS_AFFICHES && (
                <li className="admin-liste-plus">…et {registre.length - SUBS_AFFICHES} plus anciens.</li>
              )}
            </ul>
          )}
        </Bloc>

        <Bloc
          titre="Joueurs inscrits"
          icone="user"
          aide="Du plus récent au plus ancien."
          actions={
            <Link href="/admin/joueurs" className="btn btn-sm no-underline">
              Gérer →
            </Link>
          }
        >
          {ligue.joueurs.length === 0 ? (
            <EmptyState title="Personne encore" hint="Les joueurs s’inscrivent en se connectant avec Twitch." />
          ) : (
            <ul className="admin-liste">
              {ligue.joueurs.map((j) => (
                <li key={j.id}>
                  <span className="admin-liste-titre">
                    <Link href={`/joueurs/${j.slug}`} className="text-ink no-underline hover:text-ice">
                      {j.pseudo}
                    </Link>
                  </span>
                  <span className="admin-liste-detail">
                    {j.streameuse ? 'la streameuse' : j.modo ? 'modération' : 'joueur'}
                  </span>
                  <time className="admin-liste-date">{shortDateTime(j.inscritLe)}</time>
                </li>
              ))}
            </ul>
          )}
        </Bloc>
      </div>
    </Ecran>
  );
}
