export const request = async (endpoint, options = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || `HTTP ${response.status}`);
  }
  return data;
};

export const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const statusLabel = (status) => ({
  pending: 'معلق',
  approved: 'تم ربط الكود',
  rejected: 'مرفوض',
  completed: 'تم التفعيل',
  deactivated: 'تم إلغاء التفعيل'
}[status] || status || '-');

export const statusClass = (status) => ({
  pending: 'badge-primary',
  approved: 'badge-warning',
  rejected: 'badge-danger',
  completed: 'badge-success',
  deactivated: 'badge-dark'
}[status] || 'badge-dark');