import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Database, Search, Trash2, Lock, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { Confirm } from '../../components/Modal.jsx';
import { Empty } from '../../components/NoAccess.jsx';

const TS_COLS = /(_at|^ts)$/;

export default function DataConsole() {
  const { table } = useParams();
  const nav = useNavigate();
  const [tables, setTables] = useState(null);

  useEffect(() => {
    api('/data/tables').then((d) => setTables(d.tables));
  }, [table]);

  useEffect(() => {
    if (!table && tables?.length) nav(`/app/data/${tables[0].name}`, { replace: true });
  }, [table, tables, nav]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Database</span>
          <h1>Data console</h1>
          <p className="page-sub">Browse and correct records directly. Every change is written to the audit log.</p>
        </div>
      </header>
      <div className="dc">
        <nav className="dc-tables" aria-label="Tables">
          {(tables || []).map((t) => (
            <NavLink key={t.name} to={`/app/data/${t.name}`} className={({ isActive }) => `dc-table ${isActive ? 'on' : ''}`}>
              <Database size={15} />
              <span>
                <b>{t.label}</b>
                <small>{t.rows.toLocaleString()} rows</small>
              </span>
              {!t.editable && <Lock size={13} className="muted" title="Read-only" />}
            </NavLink>
          ))}
        </nav>
        <div className="dc-main">{table && <TableView table={table} key={table} />}</div>
      </div>
    </div>
  );
}

function TableView({ table }) {
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { id, col, value }
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const limit = 50;

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = () =>
    api(`/data/${table}?limit=${limit}&offset=${offset}&q=${encodeURIComponent(query)}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, offset, query]);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <div className="skel" style={{ height: 420, borderRadius: 18 }} />;

  const canWrite = can('data.write');
  const canDelete = can('data.delete') && data.deletable;
  const cols = data.columns;

  const save = async () => {
    if (!editing) return;
    const row = data.rows.find((r) => r.id === editing.id);
    if (String(row[editing.col] ?? '') === String(editing.value ?? '')) return setEditing(null);
    setBusy(true);
    try {
      const { row: updated } = await api(`/data/${table}/${editing.id}`, { method: 'PATCH', body: { [editing.col]: editing.value } });
      setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === updated.id ? updated : r)) }));
      toast(`Saved ${editing.col} on row #${editing.id}`);
      setEditing(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (c, v) => {
    if (v == null) return <span className="null">null</span>;
    if (TS_COLS.test(c.name) && typeof v === 'number') return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return String(v);
  };

  return (
    <div className="panel panel-flush">
      <div className="dc-bar">
        <div>
          <h2>{data.label}</h2>
          <span className="muted small">
            {data.total.toLocaleString()} rows
            {canWrite && cols.some((c) => c.editable) ? ' · double-click a highlighted cell to edit' : ' · read-only for your role'}
          </span>
        </div>
        <label className="search">
          <Search size={16} />
          <input placeholder="Search this table…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {data.rows.length === 0 ? (
        <Empty icon={Database} title="No rows">
          {query ? 'Nothing matches that search.' : 'This table is empty.'}
        </Empty>
      ) : (
        <div className="table-wrap dc-scroll">
          <table className="table table-dense dc-grid">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.name} className={c.editable && canWrite ? 'th-edit' : ''}>
                    {c.name}
                    {c.editable && canWrite && <Pencil size={10} />}
                  </th>
                ))}
                {canDelete && <th aria-label="Delete" />}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  {cols.map((c) => {
                    const isEdit = editing && editing.id === r.id && editing.col === c.name;
                    const editable = c.editable && canWrite;
                    return (
                      <td
                        key={c.name}
                        className={`mono ${editable ? 'td-edit' : ''} ${isEdit ? 'td-editing' : ''}`}
                        onDoubleClick={() => editable && setEditing({ id: r.id, col: c.name, value: r[c.name] ?? '' })}
                        title={editable ? 'Double-click to edit' : undefined}
                      >
                        {isEdit ? (
                          c.options ? (
                            <select
                              autoFocus
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: c.type.includes('INT') ? Number(e.target.value) : e.target.value })}
                              onBlur={save}
                              onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                              disabled={busy}
                            >
                              {c.options.map((o) => (
                                <option key={o} value={o}>
                                  {String(o)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onBlur={save}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') save();
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              disabled={busy}
                            />
                          )
                        ) : (
                          <span className="cell-clip">{fmt(c, r[c.name])}</span>
                        )}
                      </td>
                    );
                  })}
                  {canDelete && (
                    <td className="actions-col">
                      <button className="icon-btn icon-danger" onClick={() => setDeleting(r)} title="Delete row">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        <span className="muted small">
          {data.total ? `${offset + 1}–${Math.min(offset + limit, data.total)} of ${data.total.toLocaleString()}` : ''}
        </span>
        <div>
          <button className="icon-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {deleting && (
        <Confirm
          title={`Delete row #${deleting.id}?`}
          body={`This permanently removes the record from “${data.label}”. Related rows may be removed with it.`}
          danger
          confirmLabel="Delete row"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api(`/data/${table}/${deleting.id}`, { method: 'DELETE' });
              toast('Row deleted');
              setDeleting(null);
              load();
            } catch (e) {
              toast(e.message, 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
