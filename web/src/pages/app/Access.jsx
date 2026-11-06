import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { UserPlus, KeyRound, Trash2, Plus, Lock, Search, Users, ShieldCheck, ScrollText, Copy, Crown } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import Modal, { Confirm } from '../../components/Modal.jsx';
import { ago, dateTime, initials } from '../../lib/format.js';
import { useNow } from './hooks.js';

export default function Access() {
  const { tab } = useParams();
  const { can } = useAuth();
  const tabs = [
    { key: 'people', label: 'People', icon: Users, show: can('users.view') },
    { key: 'roles', label: 'Roles & permissions', icon: ShieldCheck, show: can('users.view') || can('roles.manage') },
    { key: 'audit', label: 'Audit log', icon: ScrollText, show: can('audit.view') },
  ].filter((t) => t.show);
  if (!tab || !tabs.find((t) => t.key === tab)) return <Navigate to={`/app/access/${tabs[0].key}`} replace />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Access control</h1>
          <p className="page-sub">Decide who can see, run, change and administer what. Roles bundle permissions; people hold one role.</p>
        </div>
      </header>
      <nav className="tabs" aria-label="Access sections">
        {tabs.map(({ key, label, icon: Icon }) => (
          <NavLink key={key} to={`/app/access/${key}`} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </nav>
      {tab === 'people' && <People />}
      {tab === 'roles' && <Roles />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

/* ----------------------------------- People ---------------------------------- */

function People() {
  const { can, user: me } = useAuth();
  const toast = useToast();
  const now = useNow(30000);
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState('');
  const [inviting, setInviting] = useState(false);
  const [secret, setSecret] = useState(null);
  const [removing, setRemoving] = useState(null);
  const manage = can('users.manage');
  const isSuper = me.role_key === 'super_admin';

  const load = () => Promise.all([api('/access/users'), api('/access/roles')]).then(([u, r]) => (setUsers(u.users), setRoles(r.roles)));
  useEffect(() => {
    load();
  }, []);

  const patch = async (u, body, msg) => {
    try {
      const { user } = await api(`/access/users/${u.id}`, { method: 'PATCH', body });
      setUsers((list) => list.map((x) => (x.id === user.id ? user : x)));
      toast(msg);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const reset = async (u) => {
    try {
      const { temporary_password } = await api(`/access/users/${u.id}/reset-password`, { method: 'POST' });
      setSecret({ email: u.email, password: temporary_password, title: 'Password reset' });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!users) return <div className="skel" style={{ height: 380, borderRadius: 18 }} />;
  const list = users.filter((u) => !q || `${u.name} ${u.email} ${u.role_name}`.toLowerCase().includes(q.toLowerCase()));
  const assignable = (u) => roles.filter((r) => r.key !== 'super_admin' || isSuper || u.role_key === 'super_admin');

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="muted small push">
          {users.filter((u) => u.status === 'active').length} active · {users.length} total
        </span>
        {manage && (
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            <UserPlus size={16} /> Add person
          </button>
        )}
      </div>
      <div className="panel panel-flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Access</th>
                <th className="hide-sm">Last sign-in</th>
                {manage && <th className="actions-col" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const self = u.id === me.id;
                const locked = !manage || self || (u.role_key === 'super_admin' && !isSuper);
                return (
                  <tr key={u.id} className={u.status === 'disabled' ? 'row-dim' : ''}>
                    <td>
                      <div className="person">
                        <span className={`avatar ${u.role_key === 'super_admin' ? 'avatar-lime' : ''}`}>{initials(u.name)}</span>
                        <div>
                          <b>
                            {u.name} {self && <em className="you">you</em>}
                          </b>
                          <span className="muted">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {locked ? (
                        <span className="role-chip">
                          {u.role_key === 'super_admin' && <Crown size={12} />} {u.role_name}
                        </span>
                      ) : (
                        <select className="select select-sm" value={u.role_id} onChange={(e) => patch(u, { role_id: Number(e.target.value) }, `${u.name} is now ${roles.find((r) => r.id === Number(e.target.value))?.name}`)}>
                          {assignable(u).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {locked ? (
                        <span className={`pill-state ${u.status}`}>{u.status === 'active' ? 'Active' : 'Disabled'}</span>
                      ) : (
                        <label className="switch-inline">
                          <input
                            type="checkbox"
                            className="switch"
                            checked={u.status === 'active'}
                            onChange={(e) => patch(u, { status: e.target.checked ? 'active' : 'disabled' }, e.target.checked ? `${u.name} can sign in again` : `${u.name}’s access is disabled`)}
                          />
                          <span>{u.status === 'active' ? 'Active' : 'Disabled'}</span>
                        </label>
                      )}
                    </td>
                    <td className="hide-sm muted">{u.last_login_at ? ago(u.last_login_at, now) : 'Never'}</td>
                    {manage && (
                      <td className="actions-col">
                        {!locked && (
                          <div className="row-actions">
                            <button className="icon-btn" title="Reset password" onClick={() => reset(u)}>
                              <KeyRound size={15} />
                            </button>
                            <button className="icon-btn icon-danger" title="Remove" onClick={() => setRemoving(u)}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {inviting && (
        <InviteModal
          roles={roles.filter((r) => r.key !== 'super_admin' || isSuper)}
          onClose={() => setInviting(false)}
          onCreated={(u, pw) => {
            setInviting(false);
            setSecret({ email: u.email, password: pw, title: `${u.name} has been added` });
            load();
          }}
        />
      )}
      {secret && <SecretModal {...secret} onClose={() => setSecret(null)} />}
      {removing && (
        <Confirm
          title={`Remove ${removing.name}?`}
          body="They lose access immediately. Their past actions stay in the audit log."
          danger
          confirmLabel="Remove access"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api(`/access/users/${removing.id}`, { method: 'DELETE' });
              toast(`${removing.name} removed`);
              setRemoving(null);
              load();
            } catch (e) {
              toast(e.message, 'error');
            }
          }}
        />
      )}
    </>
  );
}

function InviteModal({ roles, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', email: '', role_id: roles.find((r) => r.key === 'viewer')?.id || roles[0]?.id });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const role = roles.find((r) => r.id === Number(f.role_id));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user, temporary_password } = await api('/access/users', { method: 'POST', body: { ...f, role_id: Number(f.role_id) } });
      onCreated(user, temporary_password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Add a person" subtitle="They’ll get a temporary password to share securely." onClose={onClose} width={500}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Full name</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </label>
        <label className="field">
          <span>Work email</span>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {role && (
            <small>
              {role.description} · {role.permissions.length} permissions
            </small>
          )}
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add person'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SecretModal({ title, email, password, onClose }) {
  const toast = useToast();
  return (
    <Modal title={title} subtitle="Shown once. Share it through a secure channel." onClose={onClose} width={460}>
      <div className="secret">
        <span className="muted small">{email}</span>
        <div className="secret-box">
          <code>{password}</code>
          <button
            className="icon-btn"
            onClick={() => navigator.clipboard?.writeText(password).then(() => toast('Copied to clipboard'))}
            aria-label="Copy password"
          >
            <Copy size={16} />
          </button>
        </div>
        <p className="muted small">They can change it from their account menu after signing in.</p>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Roles & permissions --------------------------- */

function Roles() {
  const { can } = useAuth();
  const toast = useToast();
  const manage = can('roles.manage');
  const [roles, setRoles] = useState(null);
  const [perms, setPerms] = useState([]);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (selectId) => {
    const [r, p] = await Promise.all([api('/access/roles'), api('/access/permissions')]);
    setRoles(r.roles);
    setPerms(p.permissions);
    const pick = r.roles.find((x) => x.id === (selectId ?? sel)) || r.roles[0];
    setSel(pick.id);
    setDraft({ name: pick.name, description: pick.description, permissions: new Set(pick.permissions) });
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const g = {};
    for (const p of perms) (g[p.category] ||= []).push(p);
    return Object.entries(g);
  }, [perms]);

  if (!roles || !draft) return <div className="skel" style={{ height: 420, borderRadius: 18 }} />;
  const role = roles.find((r) => r.id === sel);
  const locked = !manage || role.is_system;
  const dirty =
    draft.name !== role.name ||
    draft.description !== role.description ||
    draft.permissions.size !== role.permissions.length ||
    role.permissions.some((k) => !draft.permissions.has(k));

  const pick = (r) => {
    setSel(r.id);
    setDraft({ name: r.name, description: r.description, permissions: new Set(r.permissions) });
  };

  const toggle = (key) => {
    if (locked) return;
    setDraft((d) => {
      const s = new Set(d.permissions);
      s.has(key) ? s.delete(key) : s.add(key);
      return { ...d, permissions: s };
    });
  };

  const toggleGroup = (items) => {
    if (locked) return;
    setDraft((d) => {
      const s = new Set(d.permissions);
      const all = items.every((p) => s.has(p.key));
      items.forEach((p) => (all ? s.delete(p.key) : s.add(p.key)));
      return { ...d, permissions: s };
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/access/roles/${role.id}`, { method: 'PUT', body: { name: draft.name, description: draft.description, permissions: [...draft.permissions] } });
      toast(`${draft.name} saved`);
      await load(role.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roles">
      <aside className="roles-list">
        {roles.map((r) => (
          <button key={r.id} className={`role-item ${r.id === sel ? 'on' : ''}`} onClick={() => pick(r)}>
            <span className="role-ico">{r.is_system ? <Crown size={15} /> : <ShieldCheck size={15} />}</span>
            <span className="role-text">
              <b>{r.name}</b>
              <small>
                {r.user_count} {r.user_count === 1 ? 'person' : 'people'} · {r.permissions.length} perms
              </small>
            </span>
          </button>
        ))}
        {manage && (
          <button className="role-item role-new" onClick={() => setCreating(true)}>
            <span className="role-ico">
              <Plus size={15} />
            </span>
            <span className="role-text">
              <b>New role</b>
            </span>
          </button>
        )}
      </aside>

      <section className="panel role-editor">
        <header className="role-head">
          {locked ? (
            <div>
              <h2>{role.name}</h2>
              <p className="muted">{role.description}</p>
            </div>
          ) : (
            <div className="role-fields">
              <input className="input-title" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Role name" />
              <input
                className="input-plain"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What is this role for?"
                aria-label="Role description"
              />
            </div>
          )}
          {manage && !role.is_system && (
            <div className="head-actions">
              <button className="icon-btn icon-danger" onClick={() => setDeleting(true)} title="Delete role">
                <Trash2 size={16} />
              </button>
              <button className="btn btn-ghost" disabled={!dirty || busy} onClick={() => pick(role)}>
                Discard
              </button>
              <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
                {busy ? 'Saving…' : 'Save role'}
              </button>
            </div>
          )}
        </header>

        {role.is_system ? (
          <div className="notice">
            <Lock size={16} />
            <span>Super Admin always holds every permission and can’t be edited or deleted. This keeps the workspace from being locked out.</span>
          </div>
        ) : !manage ? (
          <div className="notice">
            <Lock size={16} />
            <span>You can view roles. Only people with “Manage roles & permissions” can change them.</span>
          </div>
        ) : null}

        <div className="perm-groups">
          {groups.map(([cat, items]) => {
            const on = items.filter((p) => draft.permissions.has(p.key)).length;
            return (
              <div key={cat} className="perm-group">
                <header>
                  <h3>{cat}</h3>
                  <span className="muted small">
                    {on}/{items.length}
                  </span>
                  {!locked && (
                    <button className="link link-muted push" onClick={() => toggleGroup(items)}>
                      {on === items.length ? 'Clear all' : 'Allow all'}
                    </button>
                  )}
                </header>
                <ul>
                  {items.map((p) => (
                    <li key={p.key}>
                      <label className={`perm ${locked ? 'perm-locked' : ''}`}>
                        <span>
                          <b>{p.label}</b>
                          <small>{p.description}</small>
                        </span>
                        <input type="checkbox" className="switch" checked={draft.permissions.has(p.key)} onChange={() => toggle(p.key)} disabled={locked} />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {creating && (
        <NewRoleModal
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false);
            toast(`${r.name} created`);
            load(r.id);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Delete role “${role.name}”?`}
          body={role.user_count ? `${role.user_count} people still hold this role. Move them to another role first.` : 'This role has no members and will be removed.'}
          danger
          confirmLabel="Delete role"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await api(`/access/roles/${role.id}`, { method: 'DELETE' });
              toast('Role deleted');
              setDeleting(false);
              load(roles[0].id);
            } catch (e) {
              toast(e.message, 'error');
              setDeleting(false);
            }
          }}
        />
      )}
    </div>
  );
}

function NewRoleModal({ roles, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const base = roles.find((r) => r.id === Number(from));
      const { role } = await api('/access/roles', { method: 'POST', body: { name, description, permissions: base ? base.permissions : [] } });
      onCreated(role);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="New role" subtitle="Start empty or copy permissions from an existing role." onClose={onClose} width={480}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Role name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Database Steward" />
        </label>
        <label className="field">
          <span>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Can correct monitoring data but not manage people" />
        </label>
        <label className="field">
          <span>Start from</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">No permissions</option>
            {roles
              .filter((r) => !r.is_system)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  Copy of {r.name}
                </option>
              ))}
          </select>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary">Create role</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- Audit log -------------------------------- */

function Audit() {
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api(`/access/audit?q=${encodeURIComponent(q)}`).then((d) => setEntries(d.entries)), 250);
    return () => clearTimeout(t);
  }, [q]);

  const detail = (d) => {
    if (!d) return '';
    try {
      const o = JSON.parse(d);
      if (typeof o !== 'object' || o === null) return String(o);
      return Object.entries(o)
        .map(([k, v]) => {
          if (v && typeof v === 'object' && 'from' in v) return `${k}: ${fmtV(v.from)} → ${fmtV(v.to)}`;
          if (Array.isArray(v)) return `${k}: ${v.join(', ')}`;
          return `${k}: ${fmtV(v)}`;
        })
        .join(' · ');
    } catch {
      return d;
    }
  };

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input placeholder="Search actions, people, targets…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="panel panel-flush">
        {!entries ? (
          <div className="skel" style={{ height: 300 }} />
        ) : (
          <div className="table-wrap">
            <table className="table table-dense">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono nowrap">{dateTime(e.ts)}</td>
                    <td className="nowrap">{e.user_name || <span className="muted">System</span>}</td>
                    <td>
                      <span className={`act act-${e.action.split('.')[0]}`}>{e.action}</span>
                    </td>
                    <td className="cell-clip">{e.target}</td>
                    <td className="muted cell-clip">{detail(e.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const fmtV = (v) => (v === null || v === undefined || v === '' ? '∅' : String(v));
