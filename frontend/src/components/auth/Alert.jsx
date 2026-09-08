const VARIANTS = {
  error: 'alert-error',
  info: 'alert-info',
  success: 'alert-success',
};

export default function Alert({ variant = 'error', children }) {
  return (
    <div role="alert" className={`alert ${VARIANTS[variant] ?? VARIANTS.error}`}>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
