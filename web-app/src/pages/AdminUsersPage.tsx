import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreVertical,
  Search,
  ShieldUser,
  UserRoundCog,
  Users,
} from 'lucide-react';

import { useAuth } from '../auth/useAuth';
import { apiRequest } from '../lib/api';
import type { UserRecord } from '../types/domain';

const roleOptions = ['admin', 'organizer', 'volunteer'];
const baseStatusOptions = ['active', 'banned'];
const USERS_PER_PAGE = 10;

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

interface AdminUserDeleteResponse {
  success: boolean;
  userId: string;
}

type PageItem = number | 'ellipsis';

function formatRelativeDate(date: string | null): string {
  if (!date) {
    return 'Updated just now';
  }

  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Updated recently';
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Updated just now';
  }
  if (diffMs < hour) {
    return `Updated ${Math.floor(diffMs / minute)}m ago`;
  }
  if (diffMs < day) {
    return `Updated ${Math.floor(diffMs / hour)}h ago`;
  }
  return `Updated ${Math.floor(diffMs / day)}d ago`;
}

function getInitials(fullName: string | null, fallbackId: string): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/).slice(0, 2);
    const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
    if (initials) {
      return initials;
    }
  }
  return fallbackId.slice(0, 2).toUpperCase();
}

function getContactDisplay(user: UserRecord): string {
  const phone = String(user.phone ?? '').trim();
  if (phone.length > 0) {
    return phone;
  }

  const email = String(user.email ?? '').trim();
  return email.length > 0 ? email : 'No contact info';
}

function tokenOf(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}

function buildPaginationItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const normalized = Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);

  const items: PageItem[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const page = normalized[index];
    items.push(page);

    const next = normalized[index + 1];
    if (next && next - page > 1) {
      items.push('ellipsis');
    }
  }

  return items;
}

export function AdminUsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [draftByUserId, setDraftByUserId] = useState<Record<string, UserEditDraft>>({});
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
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

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.row-action-wrap')) {
        return;
      }
      setMenuUserId(null);
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

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
        (user.phone ?? '').toLowerCase().includes(keyword) ||
        (user.email ?? '').toLowerCase().includes(keyword);

      const matchesRole = roleFilter === 'all' || String(user.role) === roleFilter;
      const matchesStatus = statusFilter === 'all' || String(user.status ?? 'active') === statusFilter;

      return matchesKeyword && matchesRole && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((current) => (current > totalPages ? totalPages : current));
  }, [totalPages]);

  const pageStartIndex = (currentPage - 1) * USERS_PER_PAGE;
  const paginatedUsers = filteredUsers.slice(pageStartIndex, pageStartIndex + USERS_PER_PAGE);
  const showingFrom = filteredUsers.length === 0 ? 0 : pageStartIndex + 1;
  const showingTo = filteredUsers.length === 0 ? 0 : Math.min(pageStartIndex + USERS_PER_PAGE, filteredUsers.length);

  const pageItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  const stats = useMemo(
    () => ({
      total: users.length,
      volunteer: users.filter((user) => String(user.role) === 'volunteer').length,
      organizer: users.filter((user) => String(user.role) === 'organizer').length,
      admin: users.filter((user) => String(user.role) === 'admin').length,
    }),
    [users]
  );

  const handleDraftChange = (userId: string, field: keyof UserEditDraft, value: string) => {
    setDraftByUserId((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        [field]: value,
      },
    }));
  };

  const saveUserDraft = async (userId: string, draftOverride?: Partial<UserEditDraft>) => {
    const currentDraft = draftByUserId[userId];
    if (!currentDraft) {
      return;
    }
    if (!session?.access_token) {
      setError('No active session token.');
      return;
    }

    const nextDraft = {
      ...currentDraft,
      ...draftOverride,
    };

    if (session.user.id === userId && nextDraft.role !== 'admin') {
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
          role: nextDraft.role,
          status: nextDraft.status,
        },
      });

      setUsers((current) => current.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
      setDraftByUserId((current) => ({
        ...current,
        [updatedUser.id]: {
          role: String(updatedUser.role ?? 'volunteer'),
          status: String(updatedUser.status ?? 'active'),
        },
      }));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update user.');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSave = async (userId: string) => {
    const user = users.find((item) => item.id === userId);
    const draft = draftByUserId[userId];
    if (!user || !draft) {
      setMenuUserId(null);
      return;
    }

    const previousRole = String(user.role ?? 'volunteer');
    const previousStatus = String(user.status ?? 'active');
    const hasDraftChanges = draft.role !== previousRole || draft.status !== previousStatus;
    if (!hasDraftChanges) {
      setEditingUserId(null);
      setMenuUserId(null);
      return;
    }

    const confirmation = window.confirm(
      `Apply changes for ${user.full_name ?? user.id}?\nRole: ${previousRole} -> ${draft.role}\nStatus: ${previousStatus} -> ${draft.status}`
    );
    if (!confirmation) {
      setMenuUserId(null);
      return;
    }

    await saveUserDraft(userId);
    setEditingUserId(null);
    setMenuUserId(null);
  };

  const handleStartEdit = (userId: string) => {
    setEditingUserId(userId);
    setMenuUserId(null);
  };

  const handleCancelEdit = (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (user) {
      setDraftByUserId((current) => ({
        ...current,
        [userId]: {
          role: String(user.role ?? 'volunteer'),
          status: String(user.status ?? 'active'),
        },
      }));
    }
    setEditingUserId(null);
    setMenuUserId(null);
  };

  const handleDeletePlaceholder = (userId: string) => {
    if (!session?.access_token) {
      setError('No active session token.');
      setMenuUserId(null);
      return;
    }

    const target = users.find((user) => user.id === userId);
    const label = target?.full_name ?? target?.phone ?? target?.id ?? userId;
    const confirmed = window.confirm(`Delete user ${label}? This will permanently remove data.`);
    if (!confirmed) {
      setMenuUserId(null);
      return;
    }

    setMenuUserId(null);
    setError(null);
    setDeletingUserId(userId);

    void (async () => {
      try {
        await apiRequest<AdminUserDeleteResponse>(`/admin/users/${userId}`, {
          method: 'DELETE',
          accessToken: session.access_token,
        });
        setUsers((current) => current.filter((user) => user.id !== userId));
        setDraftByUserId((current) => {
          const next = { ...current };
          delete next[userId];
          return next;
        });
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete user.');
      } finally {
        setDeletingUserId(null);
      }
    })();
  };

  return (
    <section className="admin-users-page">
      <p className="users-caption">Admin User Management Main Dashboard</p>

      <div className="users-page-head">
        <div>
          <h2>User Management</h2>
          <p className="muted">Manage system users, roles, and permissions</p>
        </div>
        <div className="users-head-actions">
          <label className="users-search-wrap">
            <Search aria-hidden="true" className="users-icon users-search-icon" />
            <input
              className="text-input users-search-input"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, phone, or UUID"
              value={searchTerm}
            />
          </label>
          <button
            aria-label="Add user is not available yet"
            className="primary-btn add-user-btn"
            disabled
            title="Creating users from admin panel requires backend support."
            type="button"
          >
            + Add User (Soon)
          </button>
        </div>
      </div>

      <div className="users-stat-grid">
        <article className="users-stat-card users-stat-total">
          <div className="stat-top">
            <span aria-hidden="true" className="users-stat-icon">
              <Users className="users-icon-sm" />
            </span>
            <span className="stat-growth">+12%</span>
          </div>
          <strong>{stats.total.toLocaleString()}</strong>
          <p>Total Users</p>
        </article>
        <article className="users-stat-card users-stat-volunteer">
          <div className="stat-top">
            <span aria-hidden="true" className="users-stat-icon">
              <UserRoundCog className="users-icon-sm" />
            </span>
            <span className="stat-growth">+5%</span>
          </div>
          <strong>{stats.volunteer.toLocaleString()}</strong>
          <p>Volunteers</p>
        </article>
        <article className="users-stat-card users-stat-organizer">
          <div className="stat-top">
            <span aria-hidden="true" className="users-stat-icon">
              <BriefcaseBusiness className="users-icon-sm" />
            </span>
            <span className="stat-growth">+15%</span>
          </div>
          <strong>{stats.organizer.toLocaleString()}</strong>
          <p>Organizers</p>
        </article>
        <article className="users-stat-card users-stat-admin">
          <div className="stat-top">
            <span aria-hidden="true" className="users-stat-icon">
              <ShieldUser className="users-icon-sm" />
            </span>
            <span className="stat-growth neutral">-0%</span>
          </div>
          <strong>{stats.admin.toLocaleString()}</strong>
          <p>Admins</p>
        </article>
      </div>

      <section className="users-table-card">
        <div className="users-table-toolbar">
          <div className="users-left-toolbar">
            <button className="filter-btn" type="button">
              <Filter className="users-icon-sm" />{' '}
              Filter
            </button>
            <div className="users-filter-chips">
              <button
                className={roleFilter === 'all' ? 'chip-btn active' : 'chip-btn'}
                onClick={() => setRoleFilter('all')}
                type="button"
              >
                All Users
              </button>
              {roleOptions.map((role) => (
                <button
                  className={roleFilter === role ? 'chip-btn active' : 'chip-btn'}
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  type="button"
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="users-toolbar-right">
            <select
              className="users-status-select"
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
            <p className="users-showing-text">
              Showing {showingFrom}-{showingTo} of {filteredUsers.length}
            </p>
            <button
              className="arrow-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft className="users-icon-sm" />
            </button>
            <button
              className="arrow-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              <ChevronRight className="users-icon-sm" />
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {loading ? (
          <p className="muted">Loading users...</p>
        ) : (
          <div className="table-wrap users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th />
                  <th>User</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((user) => {
                  const draft = draftByUserId[user.id] ?? {
                    role: String(user.role ?? 'volunteer'),
                    status: String(user.status ?? 'active'),
                  };
                  const persistedRole = String(user.role ?? 'volunteer');
                  const persistedStatus = String(user.status ?? 'active');
                  const hasDraftChanges = draft.role !== persistedRole || draft.status !== persistedStatus;
                  const isEditing = editingUserId === user.id;

                  return (
                    <tr key={user.id}>
                      <td>
                        <span className="row-radio" />
                      </td>
                      <td>
                        <div className="users-identity">
                          <span className="users-avatar">{getInitials(user.full_name, user.id)}</span>
                          <div>
                            <p className="users-name">{user.full_name ?? 'Unknown user'}</p>
                            <small className="muted">{formatRelativeDate(user.updated_at ?? user.created_at)}</small>
                          </div>
                        </div>
                      </td>
                      <td>{getContactDisplay(user)}</td>
                      <td>
                        {isEditing ? (
                          <div className="users-cell-edit">
                            <select
                              className="text-input small compact-select"
                              onChange={(event) => handleDraftChange(user.id, 'role', event.target.value)}
                              value={draft.role}
                            >
                              {roleOptions.map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                            {draft.role !== persistedRole && <small className="users-draft-hint">Unsaved</small>}
                          </div>
                        ) : (
                          <span className={`users-pill role-${tokenOf(persistedRole)}`}>{persistedRole}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="users-cell-edit">
                            <select
                              className="text-input small compact-select"
                              onChange={(event) => handleDraftChange(user.id, 'status', event.target.value)}
                              value={draft.status}
                            >
                              {statusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                            {draft.status !== persistedStatus && <small className="users-draft-hint">Unsaved</small>}
                          </div>
                        ) : (
                          <span className={`users-pill status-${tokenOf(persistedStatus)}`}>{persistedStatus}</span>
                        )}
                      </td>
                      <td>
                        <div className="row-action-wrap">
                          <button
                            aria-expanded={menuUserId === user.id}
                            aria-haspopup="menu"
                            aria-label="Open row actions"
                            className="row-menu-btn"
                            disabled={savingUserId === user.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuUserId((current) => (current === user.id ? null : user.id));
                            }}
                            type="button"
                          >
                            <MoreVertical className="users-icon-sm" />
                          </button>
                          {menuUserId === user.id && (
                            <div aria-label="User row actions" className="row-action-menu" role="menu">
                              {!isEditing && (
                                <button
                                  className="row-action-item"
                                  disabled={savingUserId === user.id}
                                  onClick={() => handleStartEdit(user.id)}
                                  type="button"
                                >
                                  Edit role/status
                                </button>
                              )}
                              {isEditing && (
                                <button
                                  className="row-action-item"
                                  disabled={savingUserId === user.id || !hasDraftChanges}
                                  onClick={() => void handleSave(user.id)}
                                  type="button"
                                >
                                  {hasDraftChanges ? 'Save changes' : 'No changes'}
                                </button>
                              )}
                              {isEditing && (
                                <button
                                  className="row-action-item"
                                  disabled={savingUserId === user.id}
                                  onClick={() => handleCancelEdit(user.id)}
                                  type="button"
                                >
                                  Cancel edit
                                </button>
                              )}
                              <button
                                className="row-action-item danger"
                                disabled={deletingUserId === user.id}
                                onClick={() => handleDeletePlaceholder(user.id)}
                                type="button"
                              >
                                {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
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

        {!loading && filteredUsers.length > 0 && (
          <div className="users-table-footer">
            <button
              className="footer-nav-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft className="users-icon-sm" /> Previous
            </button>
            <div className="footer-pages">
              {pageItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span className="page-dots" key={`ellipsis-${index}`}>
                    ...
                  </span>
                ) : (
                  <button
                    className={item === currentPage ? 'page-btn active' : 'page-btn'}
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                )
              )}
            </div>
            <button
              className="footer-nav-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Next <ChevronRight className="users-icon-sm" />
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
