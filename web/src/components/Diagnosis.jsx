import { Activity, Globe, Lock, Router, Server, MapPin, Check, X, AlertTriangle } from 'lucide-react';

const HOP_ICON = { monitor: Activity, dns: Globe, network: Lock, gateway: Router, service: Server };

/** Visual path of a request from the monitor to the service, highlighting the hop where it failed. */
export function FailurePath({ hops }) {
  return (
    <ol className="fpath">
      {hops.map((h, i) => {
        const Icon = HOP_ICON[h.key] || Server;
        const Mark = h.state === 'ok' ? Check : h.state === 'fail' ? X : h.state === 'warn' ? AlertTriangle : null;
        return (
          <li key={h.key} className={`fhop fhop-${h.state}`}>
            {i > 0 && <span className="fhop-link" aria-hidden="true" />}
            <span className="fhop-node">
              <Icon size={17} />
              {Mark && (
                <span className="fhop-mark">
                  <Mark size={10} strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="fhop-name">{h.name}</span>
            <span className="fhop-detail">{h.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Diagnosis({ diagnosis, message, compact = false }) {
  if (!diagnosis) return null;
  return (
    <section className={`diag ${compact ? 'diag-compact' : ''} ${diagnosis.kind === 'slow' ? 'diag-warn' : ''}`}>
      <header className="diag-head">
        <div>
          <span className="eyebrow">Diagnosis</span>
          <h3>{diagnosis.label}</h3>
          <p className="muted">{diagnosis.summary}</p>
        </div>
      </header>
      <FailurePath hops={diagnosis.hops} />
      <div className="diag-where">
        <MapPin size={16} />
        <div>
          <span className="eyebrow">Where to look</span>
          <strong>{diagnosis.where}</strong>
          {message && <code className="diag-msg">{message}</code>}
        </div>
      </div>
      <div className="diag-cols">
        <div>
          <h4>Likely causes</h4>
          <ul className="diag-list">
            {diagnosis.causes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Next steps</h4>
          <ol className="diag-steps">
            {diagnosis.steps.map((s) => (
              <li key={s}>{renderCode(s)}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function renderCode(text) {
  return text.split(/(`[^`]+`)/g).map((part, i) => (part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part));
}
