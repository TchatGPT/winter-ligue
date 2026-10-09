'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Medaille } from '@/components/EmblemePalier';
import { EmblemeRarete } from '@/components/EmblemeRarete';
import { NAV_ICONS } from '@/components/icons';
import { SnowCap } from '@/components/SnowCap';
import { RARITY_META } from '@/lib/domain/catalog';
import { CHANCE, ECONOMY, PALIERS_CHANCE, poidsAvecChance, rarityPercent } from '@/lib/domain/rules';
import type { PackDefinition, Rarity } from '@/lib/domain/types';

const RARETES: Rarity[] = ['C', 'R', 'UR', 'L'];
const rienAEcouter = () => () => {};

const pourcent = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 1 ? 2 : 1 })} %`;

/** Le taux en chances, comme sur la page : « ≈ 8 sur 10 », « 1 sur 500 ». */
const enChances = (v: number) =>
  v <= 0 ? '—' : v >= 10 ? `≈ ${Math.round(v / 10)} sur 10` : `1 sur ${Math.round(100 / v).toLocaleString('fr-FR')}`;

/**
 * Le badge « Tirage équitable », sous le nom d'un booster, et la fenêtre qu'il
 * ouvre : comment la carte est tirée, et ce que la chance y change.
 *
 * Ce n'est pas un tirage « provably fair » au sens des sites de caisses — une
 * graine publiée que chacun recalcule — et la fenêtre ne le prétend pas : elle
 * dit ce qui est vrai. Le tirage se fait sur le serveur
 * (`lib/domain/rng.ts`, `crypto.randomInt`), aux taux affichés, avant
 * l'animation ; personne ne choisit ; chaque ouverture est au journal ; et les
 * tests mesurent le tirage réel (`tests/tirage.test.ts`).
 */
export function TirageEquitable({ pack }: { pack: PackDefinition }) {
  const [ouvert, setOuvert] = useState(false);
  const Bouclier = NAV_ICONS.shield;
  return (
    <>
      <button type="button" className="equitable-badge" onClick={() => setOuvert(true)}>
        <Bouclier className="equitable-badge-icone" />
        Tirage équitable
        <span aria-hidden="true">›</span>
      </button>
      {ouvert && <FenetreEquitable pack={pack} onClose={() => setOuvert(false)} />}
    </>
  );
}

function FenetreEquitable({ pack, onClose }: { pack: PackDefinition; onClose: () => void }) {
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = precedent;
    };
  }, [onClose]);
  if (!navigateur) return null;

  const pourUnJoueur = pack.portee === 'JOUEUR';
  const pousses = poidsAvecChance(pack.weights, CHANCE.max);
  const chanceMax = PALIERS_CHANCE.at(-1)!.multiplicateur;
  const Bouclier = NAV_ICONS.shield;

  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-label="Tirage équitable" onClick={onClose}>
      <div className="fenetre-carte equitable glass glass-reflet relative" onClick={(e) => e.stopPropagation()}>
        <SnowCap radius="var(--r-lg)" seed="tirage-equitable" epaisseur={14} />
        <button type="button" className="btn btn-sm absolute top-4 right-4 z-10" onClick={onClose} aria-label="Fermer">
          ✕
        </button>

        <div className="equitable-corps">
          <header className="equitable-tete">
            <Medaille teinte="var(--aurora)" id="equitable" className="equitable-medaille">
              <Bouclier className="medaille-icone" />
            </Medaille>
            <div>
              <p className="eyebrow">{pack.name}</p>
              <h2 className="equitable-titre">Tirage équitable</h2>
              <p className="equitable-phrase">Rien n’est truqué : tout est aléatoire, aux taux affichés.</p>
            </div>
          </header>

          <section className="equitable-bloc">
            <h3>Tiré par le serveur, jamais à la main</h3>
            <p>
              Au moment de l’ouverture, le serveur tire la carte avec un générateur aléatoire cryptographique, le même
              genre que celui des mots de passe : imprévisible, et que personne ne peut orienter.{' '}
              <b>Ni la streameuse ni la modération ne choisissent</b> la carte, ni le joueur sur qui elle tombe.
            </p>
            <p>
              L’animation ne fait que révéler un résultat déjà tiré : la recharger, la couper ou la revoir ne change
              rien.
            </p>
          </section>

          <section className="equitable-bloc">
            <h3>Comment la carte est tirée</h3>
            <ol className="equitable-etapes">
              <li>
                <b>La rareté</b>, selon les taux du booster ci-dessous.
              </li>
              <li>
                <b>Une carte de cette rareté</b>, au hasard parmi celles du booster.
              </li>
              {!pourUnJoueur && (
                <li>
                  <b>Le ou les joueurs</b>, à parts égales parmi ceux qui peuvent recevoir la carte (jamais la
                  streameuse).
                </li>
              )}
            </ol>
          </section>

          <section className="equitable-bloc">
            <h3>{pourUnJoueur ? 'Les taux, et ce que la chance y change' : 'Les taux'}</h3>
            <table className="equitable-taux">
              <thead>
                <tr>
                  <th scope="col">Rareté</th>
                  <th scope="col">Sans chance</th>
                  {pourUnJoueur && <th scope="col">À ×{chanceMax}</th>}
                </tr>
              </thead>
              <tbody>
                {RARETES.filter((r) => pack.weights[r] > 0 || pousses[r] > 0).map((r) => (
                  <tr key={r} style={{ ['--r' as string]: RARITY_META[r].color }}>
                    <th scope="row">
                      <span className="equitable-rarete">
                        <EmblemeRarete rarity={r} className="equitable-embleme" />
                        {RARITY_META[r].label}
                      </span>
                    </th>
                    <td>
                      <b>{pourcent(rarityPercent(pack.weights, r))}</b>
                      <small>{enChances(rarityPercent(pack.weights, r))}</small>
                    </td>
                    {pourUnJoueur && (
                      <td>
                        <b>{pourcent(rarityPercent(pousses, r))}</b>
                        <small>{enChances(rarityPercent(pousses, r))}</small>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="equitable-bloc">
            <h3>La chance</h3>
            {pourUnJoueur ? (
              <p>
                Ce booster s’ouvre pour un joueur : <b>son solde de flocons pousse les raretés hautes</b>, de ×1 à 0 ❄
                jusqu’à ×{chanceMax} à {ECONOMY.soldeMax.toLocaleString('fr-FR')} ❄. Les flocons ne sont pas dépensés.
                La commune cède sa place, rien d’autre ne change : le tirage reste aléatoire.
              </p>
            ) : (
              <p>
                Ce booster est celui de la ligue : <b>la chance n’y joue pas</b>. Tout le monde est à égalité, quels que
                soient ses flocons.
              </p>
            )}
          </section>

          <section className="equitable-bloc">
            <h3>Vérifié</h3>
            <p>
              Chaque ouverture est inscrite au journal : quand, quel booster, quelle carte, pour qui. Et à chaque
              modification du site, des tests tirent chaque booster 120 000 fois pour vérifier que les taux annoncés
              sont exactement ceux qui sortent.
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
