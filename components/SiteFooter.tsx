export function SiteFooter({ season }: { season: string }) {
  return (
    <footer className="relative z-10 mt-8 border-t border-line py-5">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 text-xs text-faint sm:px-6">
        <span>{season}</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">❄</span>
          Scores, tirages et enchères calculés côté serveur
        </span>
      </div>
    </footer>
  );
}
