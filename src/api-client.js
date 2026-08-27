const API_ROOT = '/api/v1';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const request = async (path, options = {}) => {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload?.error?.message ?? '本地服务请求失败');
  return payload;
};

export const api = Object.freeze({
  health: () => request('/health'),
  bootstrap: () => request('/bootstrap'),
  createProject: (project) => request('/projects', { method: 'POST', body: JSON.stringify(project) }),
  updateProject: (projectId, changes) => request(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  archiveProject: (projectId, archive) => request(`/projects/${encodeURIComponent(projectId)}/${archive ? 'archive' : 'restore'}`, { method: 'POST' }),
  createEntry: (entry) => request('/time-entries', { method: 'POST', body: JSON.stringify(entry) }),
  listEntries: () => request('/time-entries'),
  updateEntry: (entryId, changes) => request(`/time-entries/${encodeURIComponent(entryId)}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteEntry: (entryId) => request(`/time-entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' }),
  statistics: ({ from, to, projectId, includeDescendants = false, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (projectId !== undefined) query.set('projectId', projectId ?? '');
    if (includeDescendants) query.set('includeDescendants', 'true');
    if (timeZone) query.set('timeZone', timeZone);
    return request(`/statistics${query.size ? `?${query}` : ''}`);
  },
  getTimer: () => request('/timer'),
  saveTimer: (timer) => request('/timer', { method: 'PUT', body: JSON.stringify(timer) }),
  exportData: () => request('/export'),
  importData: (data) => request('/import', { method: 'POST', body: JSON.stringify({ replace: true, data }) }),
});
