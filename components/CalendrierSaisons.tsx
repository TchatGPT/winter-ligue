'use client';

import { type CSSProperties, useEffect, useState } from 'react';

/** Une saison, telle que le calendrier la montre. */
export interface SaisonDuCalendrier {
  numero: number;
  /** « Mini Ligue », « Saison 2 ». */
  nom: string;
  /** « l'échauffement », « la vraie saison ». */
  role: string;
  /** « 22 nov. → 4 janv. ». */
  dates: string;
  /** « 38 games · pas de finale ». */
  detail: string;
  debut: string;
  fin: string;
}

/**
 * Le calendrier de l'accueil (13/11/2026) : le compte à rebours du prochain
 * rendez-vous, et les deux saisons de l'hiver côte à côte — la Mini Ligue,
 * pour se chauffer, puis la Saison 2, la vraie, qui part de zéro le 4 janvier.
 * Chaque saison est un bloc de glace à la longueur de sa durée ; ce qui en est
 * passé s'éclaire.
 *
 * Le serveur donne l'heure du rendu (`maintenant`) : la première image est la
 * même des deux côtés, puis le navigateur prend le relais, une fois par
 * seconde. Les chiffres qui défilent sont muets pour un lecteur d'écran, qui
 * lit la date à la place.
 */
export function CalendrierSaisons({
  saisons,
  maintenant,
}: {
  saisons: SaisonDuCalendrier[];
  /** L'heure du serveur au rendu, en millisecondes. */
  maintenant: number;
}) {
  const [t, setT] = useState(maintenant);
  useEffect(() => {
    const bat = () => setT(Date.now());
    bat();
    const id = window.setInterval(bat, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Le prochain rendez-vous : le début de la première saison pas encore
  // commencée. Une fois la dernière lancée, plus de compte à rebours.
  const prochaine = saisons.find((s) => Date.parse(s.debut) > t) ?? null;
  const enCours = saisons.find((s) => Date.parse(s.debut) <= t && t < Date.parse(s.fin)) ?? null;
  // Tant qu'une saison reste à venir après celle-ci, on dit qu'elle repart de zéro.
  const suivante = saisons.slice(1).find((s) => Date.parse(s.debut) > t) ?? null;

  return (
    <div className="calendrier">
      {prochaine ? (
        <Rebours
          titre={prochaine === saisons[0] ? `Coup d’envoi de la ${prochaine.nom}` : `La ${prochaine.nom} commence dans`}
          jour={prochaine.dates.split(' → ')[0]}
          reste={Math.max(0, Math.floor((Date.parse(prochaine.debut) - t) / 1000))}
        />
      ) : (
        <p className="calendrier-lance">
          <span className="calendrier-point" aria-hidden="true" />
          {enCours ? `${enCours.nom} en cours` : 'La saison est terminée'}
        </p>
      )}

      <ol className="calendrier-saisons" aria-label="Les saisons de l’hiver">
        {saisons.map((s) => {
          const a = Date.parse(s.debut);
          const b = Date.parse(s.fin);
          const passe = Math.min(1, Math.max(0, (t - a) / (b - a)));
          const etat = t >= b ? 'finie' : t >= a ? 'en-cours' : s === prochaine ? 'prochaine' : 'a-venir';
          return (
            <li
              key={s.numero}
              className="calendrier-saison"
              data-etat={etat}
              style={
                {
                  // La longueur du bloc suit la durée de la saison.
                  flexGrow: Math.round((b - a) / 86_400_000),
                  ['--passe' as string]: passe,
                } as CSSProperties
              }
            >
              <span className="calendrier-bloc" aria-hidden="true">
                <span className="calendrier-bloc-passe" />
              </span>
              <span className="calendrier-nom">
                <b>{s.nom}</b>
                <em>{s.role}</em>
              </span>
              <span className="calendrier-dates">{s.dates}</span>
              <span className="calendrier-detail">{s.detail}</span>
            </li>
          );
        })}
      </ol>
      {suivante && (
        <p className="calendrier-zero">
          Le {suivante.dates.split(' → ')[0]}, classement et flocons repartent de zéro : ton compte reste.
        </p>
      )}
    </div>
  );
}

/** Le compte à rebours : jours, heures, minutes, secondes, taillés dans la glace. */
function Rebours({ titre, jour, reste }: { titre: string; jour: string; reste: number }) {
  const deux = (n: number) => String(n).padStart(2, '0');
  const cases: [string, string][] = [
    [deux(Math.floor(reste / 86_400)), 'jours'],
    [deux(Math.floor((reste % 86_400) / 3_600)), 'heures'],
    [deux(Math.floor((reste % 3_600) / 60)), 'min'],
    [deux(reste % 60), 'sec'],
  ];
  return (
    <div className="rebours">
      <p className="rebours-titre">
        {titre}
        <span className="rebours-jour">le {jour}</span>
      </p>
      <ol className="rebours-cases" aria-hidden="true">
        {cases.map(([valeur, unite], i) => (
          <li key={unite} data-dernier={i === cases.length - 1 ? '' : undefined}>
            <b className="num" suppressHydrationWarning>
              {valeur}
            </b>
            <span>{unite}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
