export default function TextField({ label, id, hint, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="field-control" {...props} />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
