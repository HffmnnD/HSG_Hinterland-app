const VARIANTS = {
  error: 'border-red-500/40 bg-red-500/10 text-red-200',
  info: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
};

export default function Alert({ variant = 'error', children }) {
  return (
    <div
      role="alert"
      className={`rounded-xl border px-3.5 py-3 text-sm ${VARIANTS[variant] ?? VARIANTS.error}`}
    >
      {children}
    </div>
  );
}
