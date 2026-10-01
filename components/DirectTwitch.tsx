import { Suspense } from 'react';
import { IconTwitch } from '@/components/icons';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { flakes } from '@/components/ui';
import { etatDuDirect, nomDeLaChaine, type EtatDirect } from '@/lib/services/twitchDirect';

/**
 * La streameuse est-elle en live ? Une tuile du hero, qui mène à sa chaîne.
 *
 * Elle arrive à part (`Suspense`) : la page s'affiche sans attendre Twitch, et
 * la tuile se complète dès qu'il répond. Tant qu'il n'a rien dit, ou s'il se
 * tait, elle n'affirme rien — c'est un lien vers la chaîne, sans plus.
 */
export function DirectTwitch() {
  const chaine = chaineDeLaLigue();
  return (
    <Suspense fallback={<TuileDirect chaine={chaine} etat={undefined} />}>
      <DirectRepondu chaine={chaine} />
    </Suspense>
  );
}

async function DirectRepondu({ chaine }: { chaine: string }) {
  return <TuileDirect chaine={chaine} etat={await etatDuDirect()} />;
}

/** `etat` : undefined tant que Twitch n'a pas répondu, null s'il ne répondra pas. */
function TuileDirect({ chaine, etat }: { chaine: string; etat: EtatDirect | null | undefined }) {
  const nom = etat?.nom ?? nomDeLaChaine(chaine);
  const statut = etat ? (etat.enDirect ? 'direct' : 'hors-ligne') : 'inconnu';
  const detail =
    etat?.enDirect === true
      ? [etat.titre, etat.spectateurs !== null ? `${flakes(etat.spectateurs)} spectateur${etat.spectateurs > 1 ? 's' : ''}` : null]
          .filter(Boolean)
          .join(' · ')
      : statut === 'hors-ligne'
        ? 'Sa chaîne Twitch'
        : 'Ouvrir sur Twitch';

  return (
    <a
      href={`https://www.twitch.tv/${chaine}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hero-direct glass glass-soft"
      data-statut={statut}
      aria-label={
        statut === 'direct'
          ? `${nom} est en live : ouvrir sa chaîne Twitch`
          : statut === 'hors-ligne'
            ? `${nom} n’est pas en live : ouvrir sa chaîne Twitch`
            : `Ouvrir la chaîne Twitch de ${nom}`
      }
    >
      <span className="hero-direct-medaillon" aria-hidden="true">
        <IconTwitch className="h-[22px] w-[22px]" />
        <i className="hero-direct-point" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="hero-direct-statut">
          {statut === 'direct' ? 'En direct' : statut === 'hors-ligne' ? 'Hors ligne' : 'Twitch'}
        </span>
        <span className="hero-direct-nom">
          {statut === 'direct'
            ? `${nom} est en live`
            : statut === 'hors-ligne'
              ? `${nom} n’est pas en live`
              : `La chaîne de ${nom}`}
        </span>
        <span className="hero-direct-detail">{detail}</span>
      </span>
      <span className="hero-direct-fleche" aria-hidden="true">
        ›
      </span>
    </a>
  );
}
