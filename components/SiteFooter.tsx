export function SiteFooter({ season }: { season: string }) {
  return (
    // La marge basse dégage la barre de navigation mobile, fixée en bas.
    <footer className="relative z-10 mt-6 px-4 pb-28 sm:px-6 md:pb-8">
      <div className="glass glass-soft mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-faint">
        <span className="font-display tracking-wide uppercase">{season}</span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true">❄</span>
          Scores, tirages et enchères calculés côté serveur
        </span>
      </div>
    </footer>
  );
}
