import Link from 'next/link';
import { Bloc, Chiffre, Ecran } from '@/components/admin/Cadre';
import { EmptyState, flakes } from '@/components/ui';
import { exigeRole } from '@/lib/auth/acces';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { nextMilestone, PACKS_REGLES } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { boostersDuGeste, persoEnAttente } from '@/lib/domain/twitchSubs';
import { shortDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vue d’ensemble — Modération' };

/** Assez de registre pour additionner les cadeaux d'une saison ; la liste n'en montre que le début. */
const REGISTRE = 2000;
const SUBS_AFFICHES = 40;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * La vue d'ensemble : les joueurs inscrits, et les subs — qui, combien, quand,
 * à quel niveau, et qui a payé des subs sans être inscrit à la ligue, ses
 * Boosters Perso en attente de son inscription.
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
  const enAttente = persoEnAttente(registre, inscrits);
  const boostersEnAttente = enAttente.reduce((n, c) => n + c.boosters, 0);
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
          label="Boosters Perso en attente"
          valeur={boostersEnAttente}
          note={enAttente.length ? `pour ${pluriel(enAttente.length, 'non-inscrit')}` : 'personne en attente'}
          accent="gold"
        />
      </section>

      {/* Trois blocs : sur deux colonnes, les subs prennent toute la hauteur à
          droite — le dernier bloc ne reste pas seul sur sa ligne ; sur un très
          grand écran, les trois côte à côte. */}
      <div className="grid gap-5 xl:grid-cols-2 3xl:grid-cols-3">
        <Bloc
          titre="Boosters Perso en attente"
          icone="snowflake"
          neige="admin-attente"
          aide={`Ils ont payé des subs sans être inscrits à la ligue. Un Booster Perso par sub T3, pris ou offert, et un tous les ${PACKS_REGLES.persoTousLes} subs offerts : ils leur sont versés d’office à leur première connexion.`}
        >
          {enAttente.length === 0 ? (
            <EmptyState title="Personne en attente" hint="Un abonné T3 ou un donateur non inscrit apparaîtra ici." />
          ) : (
            <ul className="admin-liste">
              {enAttente.map((c) => (
                <li key={c.twitchId}>
                  <span className="admin-liste-titre">{c.pseudo}</span>
                  <span className="admin-liste-detail">
                    {[
                      c.niveau3 > 0 ? `${pluriel(c.niveau3, 'sub')} T3` : null,
                      c.offerts > 0 ? `${pluriel(c.offerts, 'sub')} offert${c.offerts > 1 ? 's' : ''}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    ·{' '}
                    <strong className="text-aurora">{pluriel(c.boosters, 'Booster')} Perso</strong> à son
                    inscription
                  </span>
                  <time className="admin-liste-date">{shortDateTime(c.dernier)}</time>
                </li>
              ))}
            </ul>
          )}
        </Bloc>

        <Bloc
          titre="Les subs"
          icone="antenne"
          aide="Chaque sub compté depuis Twitch, le plus récent en tête. Un sub T3, et cinq subs offerts, valent un Booster Perso à qui les a payés : versé d’office."
          className="xl:row-span-2 3xl:row-span-1"
        >
          {registre.length === 0 ? (
            <EmptyState title="Aucun sub encore" hint="Chaque sub, resub et cadeau arrivé par Twitch s’inscrit ici." />
          ) : (
            <ul className="admin-liste">
              {registre.slice(0, SUBS_AFFICHES).map((s) => {
                const boosters = boostersDuGeste({ niveau: s.niveau, nombre: s.nombre, anonyme: s.twitchId === null });
                return (
                  <li key={s.id}>
                    <span className="admin-liste-titre">
                      {s.pseudo}
                      {s.twitchId && !inscrits.has(s.twitchId) && (
                        <span className="ml-2 text-[13px] font-normal tracking-[0.12em] text-gold uppercase">
                          pas inscrit
                        </span>
                      )}
                    </span>
                    <span className="admin-liste-detail">
                      {s.genre === 'cadeau'
                        ? `${pluriel(s.nombre, 'sub')} offert${s.nombre > 1 ? 's' : ''}`
                        : s.genre}{' '}
                      · T{s.niveau}
                      {boosters > 0 && (
                        <>
                          {' '}
                          · <strong className="text-aurora">{pluriel(boosters, 'Booster')} Perso</strong>
                        </>
                      )}
                    </span>
                    <time className="admin-liste-date">{shortDateTime(s.le)}</time>
                  </li>
                );
              })}
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
