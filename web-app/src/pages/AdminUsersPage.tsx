import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { apiRequest } from '../lib/api';
import type { UserRecord } from '../types/domain';

const roleOptions = ['admin', 'organizer', 'volunteer'];
const baseStatusOptions = ['active', 'inactive', 'suspended'];

interface UserEditDraft {
  role: string;
  status: string;
}

interface AdminUsersResponse {
  users: UserRecord[];
}

interface AdminUserUpdateResponse {
  user: UserRecord;
}

export function AdminUsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [draftByUserId, setDraftByUserId] = useState<Record<string, UserEditDraft>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      setError('No active session token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { users: nextUsers } = await apiRequest<AdminUsersResponse>('/admin/users', {
        accessToken: session.access_token,
      });

      setUsers(nextUsers);
      setDraftByUserId(
        Object.fromEntries(
          nextUsers.map((user) => [
            user.id,
            {
              role: String(user.role ?? 'volunteer'),
              status: String(user.status ?? 'active'),
            },
          ])
        )
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadUsers]);

  const statusOptions = useMemo(() => {
    const dynamicStatuses = users.map((user) => user.status).filter((status): status is string => Boolean(status));
    return Array.from(new Set([...baseStatusOptions, ...dynamicStatuses]));
  }, [users]);

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesKeyword =
        !keyword ||
        user.id.toLowerCase().includes(keyword) ||
        (user.full_name ?? '').toLowerCase().includes(keyword) ||
        (user.phone ?? '').toLowerCase().includes(keyword);

      const matchesRole = roleFilter === 'all' || String(user.role) === roleFilter;
      const matchesStatus = statusFilter === 'all' || String(user.status ?? 'active') === statusFilter;

      return matchesKeyword && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const handleDraftChange = (userId: string, field: keyof UserEditDraft, value: string) => {
    setDraftByUserId((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        [field]: value,
      },
    }));
  };

  const handleSave = async (userId: string) => {
    const draft = draftByUserId[userId];
    if (!draft) {
      return;
    }
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    if (session?.user.id === userId && draft.role !== 'admin') {
      setError('You cannot downgrade your own admin role.');
      return;
    }

    setError(null);
    setSavingUserId(userId);

    try {
      const { user: updatedUser } = await apiRequest<AdminUserUpdateResponse>(`/admin/users/${userId}`, {
        method: 'PATCH',
        accessToken: session.access_token,
        body: {
          role: draft.role,
          status: draft.status,
        },
      });

      setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update user.');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Admin User Management</h2>
          <p className="muted">Manage records in public.users (role and status).</p>
        </div>
        <button className="secondary-btn" onClick={() => void loadUsers()} type="button">
          Refresh
        </button>
      </div>

      <div className="filter-row">
        <input
          className="text-input"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by name, phone, or user id"
          value={searchTerm}
        />
        <select className="text-input" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
          <option value="all">All roles</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select
          className="text-input"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p className="muted">Loading users...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>User ID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const draft = draftByUserId[user.id] ?? {
                  role: String(user.role ?? 'volunteer'),
                  status: String(user.status ?? 'active'),
                };

                return (
                  <tr key={user.id}>
                    <td>{user.full_name ?? 'N/A'}</td>
                    <td>{user.phone ?? 'N/A'}</td>
                    <td>
                      <select
                        className="text-input small"
                        onChange={(event) => handleDraftChange(user.id, 'role', event.target.value)}
                        value={draft.role}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="text-input small"
                        onChange={(event) => handleDraftChange(user.id, 'status', event.target.value)}
                        value={draft.status}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{user.id}</td>
                    <td>
                      <button
                        className="secondary-btn"
                        disabled={savingUserId === user.id}
                        onClick={() => void handleSave(user.id)}
                        type="button"
                      >
                        {savingUserId === user.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <p className="muted">No users match the filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
