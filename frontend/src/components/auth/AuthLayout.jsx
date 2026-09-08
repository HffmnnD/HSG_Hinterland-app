export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-hsg-dark text-white">
      <div className="brand-ribbon" />

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-hsg-green font-display text-2xl font-bold leading-none text-white">
              H
            </div>
            <p className="eyebrow text-hsg-green">
              Ehrlicher Sport &middot; Direkt vor Ort
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-[0.03em] text-white">
              HSG Hinterland
            </h1>
            <p className="mt-1.5 text-sm text-white/60">
              Vereins-App für Mannschaften, Dienste &amp; Termine
            </p>
          </div>

          <div className="rounded-md border-t-[3px] border-t-hsg-green bg-paper p-6 text-ink-soft shadow-pop">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-white/45">
            © {new Date().getFullYear()} HSG Hinterland
          </p>
        </div>
      </div>
    </div>
  );
}
