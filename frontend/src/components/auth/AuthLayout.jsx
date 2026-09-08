export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-2xl font-black text-slate-950">
              H
            </div>
            <h1 className="text-2xl font-bold">HSG Hinterland</h1>
            <p className="mt-1 text-sm text-slate-400">
              Vereins-App für Teams, Dienste &amp; Termine
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} HSG Hinterland
          </p>
        </div>
      </div>
    </div>
  );
}
