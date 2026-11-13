'use client';

import { useEffect, useState } from 'react';

/**
 * Le compte à rebours du coup d'envoi, sur l'accueil : quatre glaçons — jours,
 * heures, minutes, secondes — qui s'égrènent jusqu'au début de la saison.
 *
 * Le serveur donne l'heure du rendu (`maintenant`) : la première image est la
 * même des deux côtés, puis le navigateur prend le relais, une fois par
 * seconde. Les chiffres sont décoratifs pour un lecteur d'écran, qui lit la
 * date à la place — un compteur qui change chaque seconde ne se lit pas.
 * L'heure venue, il laisse la place à une phrase.
 */
export function CompteARebours({
  jusqua,
  maintenant,
  jour,
}: {
  /** Le début de la saison, en date ISO. */
  jusqua: string;
  /** L'heure du serveur au rendu, en millisecondes. */
  maintenant: number;
  /** « 22 novembre » : la date, pour qui ne voit pas les chiffres. */
  jour: string;
}) {
  const [t, setT] = useState(maintenant);
  useEffect(() => {
    const bat = () => setT(Date.now());
    bat();
    const id = window.setInterval(bat, 1000);
    return () => window.clearInterval(id);
  }, []);

  const reste = Math.max(0, Math.floor((Date.parse(jusqua) - t) / 1000));
  if (reste === 0) {
    return (
      <p className="acc-rebours acc-rebours-lance">
        <span className="acc-rebours-point" aria-hidden="true" />
        La saison est lancée
      </p>
    );
  }

  const deux = (n: number) => String(n).padStart(2, '0');
  const cases: [string, string][] = [
    [deux(Math.floor(reste / 86_400)), 'j'],
    [deux(Math.floor((reste % 86_400) / 3_600)), 'h'],
    [deux(Math.floor((reste % 3_600) / 60)), 'min'],
    [deux(reste % 60), 's'],
  ];
  return (
    <div className="acc-rebours">
      <p className="acc-rebours-titre">
        Coup d’envoi <span aria-hidden="true">dans</span>
        <span className="sr-only">le {jour}</span>
      </p>
      <ol className="acc-rebours-cases" aria-hidden="true">
        {cases.map(([valeur, unite]) => (
          <li key={unite}>
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
