// The permission catalogue. Roles are bundles of these keys; the super admin role implicitly holds all of them.
export const PERMISSIONS = [
  { key: 'monitors.view', category: 'Monitoring', label: 'View monitors', description: 'See endpoints, live health, latency and check history.' },
  { key: 'monitors.run', category: 'Monitoring', label: 'Run checks on demand', description: 'Trigger an immediate health check for any endpoint.' },
  { key: 'monitors.create', category: 'Monitoring', label: 'Create monitors', description: 'Register new endpoints to watch.' },
  { key: 'monitors.edit', category: 'Monitoring', label: 'Edit monitors', description: 'Change URL, thresholds, intervals, ownership or pause a monitor.' },
  { key: 'monitors.delete', category: 'Monitoring', label: 'Delete monitors', description: 'Remove a monitor and its full history.' },

  { key: 'incidents.view', category: 'Incidents', label: 'View incidents', description: 'See active and past incidents with their timelines.' },
  { key: 'incidents.manage', category: 'Incidents', label: 'Acknowledge & resolve', description: 'Take ownership, add notes and close incidents.' },

  { key: 'data.read', category: 'Database', label: 'Browse records', description: 'Read tables in the data console.' },
  { key: 'data.write', category: 'Database', label: 'Edit records', description: 'Change values directly in the database.' },
  { key: 'data.delete', category: 'Database', label: 'Delete records', description: 'Permanently delete rows from the database.' },

  { key: 'users.view', category: 'Administration', label: 'View people', description: 'See who has access and which role they hold.' },
  { key: 'users.manage', category: 'Administration', label: 'Manage people', description: 'Invite people, change roles, reset passwords, disable access.' },
  { key: 'roles.manage', category: 'Administration', label: 'Manage roles & permissions', description: 'Create roles and decide what each one is allowed to do.' },
  { key: 'audit.view', category: 'Administration', label: 'View audit log', description: 'See the trail of every change made in the workspace.' },
];

export const ALL_KEYS = PERMISSIONS.map((p) => p.key);
export const SUPER_ADMIN = 'super_admin';

export const DEFAULT_ROLES = [
  {
    key: SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full control of the workspace, including who can do what.',
    is_system: 1,
    permissions: ALL_KEYS,
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Runs day-to-day operations and people, but cannot redefine roles.',
    permissions: ALL_KEYS.filter((k) => k !== 'roles.manage'),
  },
  {
    key: 'sre',
    name: 'SRE / On-call',
    description: 'Owns monitors and incidents. Can read and correct monitoring data.',
    permissions: [
      'monitors.view', 'monitors.run', 'monitors.create', 'monitors.edit',
      'incidents.view', 'incidents.manage', 'data.read', 'data.write',
    ],
  },
  {
    key: 'developer',
    name: 'Developer',
    description: 'Investigates failures for the services they build.',
    permissions: ['monitors.view', 'monitors.run', 'incidents.view', 'data.read'],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only view of health and incidents.',
    permissions: ['monitors.view', 'incidents.view'],
  },
];
