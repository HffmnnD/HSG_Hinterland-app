export default function FullScreenLoader() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-hsg-dark text-white">
      <div className="brand-ribbon" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-hsg-green font-display text-xl font-bold leading-none text-white">
          H
        </div>
        <div className="flex items-center gap-2.5 text-sm text-white/70">
          <span className="spinner h-4 w-4 border-white/25 border-t-hsg-green" />
          Wird geladen …
        </div>
      </div>
    </div>
  );
}
