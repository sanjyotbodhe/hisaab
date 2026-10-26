import { useEffect, useRef } from 'react';
import { formatINR, initials } from '../lib/format.js';
import { Icon } from './icons.jsx';

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="state state-loading">
      <Spinner />
      <span>{text}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Button({ loading, children, className = 'btn-primary', ...props }) {
  return (
    <button
      className={`btn ${className}`}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner label="Working" />}
      <span>{children}</span>
    </button>
  );
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className={`field${error ? ' field-has-error' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      {error.message ?? String(error)}
    </div>
  );
}

/** Signed money in ledger ink: green when someone gets money back, red when they owe. */
export function Money({ paise, signed = false, hand = false, className = '' }) {
  const tone = !signed || paise === 0 ? '' : paise > 0 ? 'pos' : 'neg';
  return (
    <span className={`money ${tone} ${hand ? 'hand' : ''} ${className}`}>
      {formatINR(signed ? Math.abs(paise) : paise)}
    </span>
  );
}

export function Avatar({ name, size = 'md' }) {
  // Stable hue from the name so each person keeps their colour everywhere.
  let h = 0;
  for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className={`avatar avatar-${size}`} style={{ '--h': h }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Overlapping avatars for a group's members, with a "+N" for the rest. */
export function AvatarStack({ names, max = 4 }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={names.join(', ')}>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size="sm" />
      ))}
      {rest > 0 && <span className="avatar avatar-sm avatar-more">+{rest}</span>}
    </span>
  );
}

/** Accessible modal built on the native <dialog> (focus trap + Esc for free). */
export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on backdrop
      }}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="modal-body">
          <header className="modal-head">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function confirmAction(message) {
  return window.confirm(message);
}
