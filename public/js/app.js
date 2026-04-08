/**
 * Admin Dashboard Application
 */

const CONFIG = {
  API_BASE_URL: '',
  REFRESH_INTERVAL: 60000,
  STATS_REFRESH_INTERVAL: 30000,
  HIGHLIGHT_DURATION: 300000,
};

const state = {
  isLoggedIn: false,
  codes: [],
  requests: [],
  stats: {},
  currentView: 'login',
  refreshTimer: null,
  statsTimer: null,
};

const elements = {};

const utils = {
  formatDate: (dateString) => {
    if (!dateString) return '-';

    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  escapeHtml: (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;'),

  showAlert: (elementId, message, type = 'info', duration = 5000) => {
    const element = elements[elementId] || document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = message;
    element.className = `alert alert-${type}`;
    element.classList.remove('hidden');

    if (duration > 0) {
      setTimeout(() => {
        element.classList.add('hidden');
      }, duration);
    }
  },

  hideAlert: (elementId) => {
    const element = elements[elementId] || document.getElementById(elementId);
    if (element) {
      element.classList.add('hidden');
    }
  },

  isRecent: (createdAt) => {
    const created = new Date(createdAt);
    return (new Date() - created) < CONFIG.HIGHLIGHT_DURATION;
  },

  canManageRequest: (request) => request.status !== 'completed',
  canArchiveRequest: (request) => request.status !== 'pending',

  getDeviceUsageHtml: (request) => {
    const usage = request.deviceUsage || {};
    const activationCount = Number(usage.activationCount || 0);
    const codes = Array.isArray(usage.codes) ? usage.codes.filter(Boolean) : [];

    if (activationCount === 0) {
      return '<div class="request-note">سجل الجهاز: غير موجود مسبقًا في الأكواد المفعلة.</div>';
    }

    const codesHtml = codes.length
      ? codes.map((code) => `<span class="code-text">${utils.escapeHtml(code)}</span>`).join('، ')
      : 'لا يوجد';

    return `
      <div class="request-note">
        سجل الجهاز: موجود <strong>${activationCount}</strong> ${activationCount === 1 ? 'مرة' : 'مرات'}، والأكواد المرتبطة: ${codesHtml}
      </div>
    `;
  },

  getRequestStatusBadge: (request) => {
    if (request.status === 'completed') return '<span class="badge badge-success">تم التفعيل</span>';
    if (request.status === 'approved') return '<span class="badge badge-warning">بانتظار إدخال الكود</span>';
    if (request.status === 'rejected') return '<span class="badge badge-danger">مرفوض</span>';
    return '<span class="badge badge-primary">معلق</span>';
  },

  getRequestExtraNotesHtml: (request) => {
    const notes = [];

    if (request.status === 'rejected' && request.rejectionReason) {
      notes.push(`<div class="request-note">سبب الرفض: ${utils.escapeHtml(request.rejectionReason)}</div>`);
    }

    if (request.status === 'approved') {
      notes.push('<div class="request-note">حذف الطلب من لوحة الأدمن سيخفيه فقط من الإدارة ولن يلغي الكود المربوط أو يوقف التفعيل.</div>');
    }

    return notes.join('');
  },

  getRequestActionsHtml: (request, options = {}) => {
    const { compact = false } = options;
    const disabled = utils.canManageRequest(request) ? '' : 'disabled';
    const inputHtml = utils.canManageRequest(request)
      ? `
        <input
          type="text"
          class="form-control request-code-input"
          data-request-id="${request._id}"
          placeholder="أدخل كود للربط"
          value="${utils.escapeHtml(request.assignedCode || '')}"
        />
      `
      : '';

    if (compact) {
      return `
        <div class="request-menu-list">
          ${request.status !== 'completed' ? `<button class="request-menu-item" data-action="approve-request" data-request-id="${request._id}">ربط الكود</button><button class="request-menu-item" data-action="reject-request" data-request-id="${request._id}">رفض</button>` : ''}
          ${utils.canArchiveRequest(request) ? `<button class="request-menu-item danger" data-action="delete-request" data-request-id="${request._id}">حذف الطلب</button>` : ''}
        </div>
      `;
    }

    return `
      <div class="request-actions">
        ${inputHtml}
        <button class="action-btn approve-btn" data-action="approve-request" data-request-id="${request._id}" ${disabled}>ربط الكود</button>
        <button class="action-btn reject-btn" data-action="reject-request" data-request-id="${request._id}" ${disabled}>رفض</button>
        ${utils.canArchiveRequest(request) ? `<button class="action-btn delete-btn" data-action="delete-request" data-request-id="${request._id}">حذف الطلب</button>` : ''}
      </div>
    `;
  },

  getRequestDetailsHtml: (request) => `
    <div class="details-grid request-details-grid">
      <p><strong>رقم الجهاز:</strong> <code class="date-text">${utils.escapeHtml(request.deviceId || '-')}</code></p>
      <p><strong>معرف الطلب:</strong> <span class="request-id-inline">${utils.escapeHtml(request._id)}</span></p>
      <p><strong>الحالة:</strong> ${utils.getRequestStatusBadge(request)}</p>
      <p><strong>الكود المربوط:</strong> ${request.assignedCode ? `<span class="code-text">${utils.escapeHtml(request.assignedCode)}</span>` : '-'}</p>
      <p><strong>تاريخ الطلب:</strong> ${utils.formatDate(request.createdAt)}</p>
      <p><strong>آخر تحديث:</strong> ${utils.formatDate(request.updatedAt)}</p>
      ${request.completedAt ? `<p><strong>تاريخ التفعيل:</strong> ${utils.formatDate(request.completedAt)}</p>` : ''}
      ${utils.getDeviceUsageHtml(request)}
      ${utils.getRequestExtraNotesHtml(request)}
    </div>
  `,

  getCodeStatusBadge: (code) => code.used
    ? '<span class="badge badge-danger">مفعل</span>'
    : '<span class="badge badge-success">متاح</span>',
};

const api = {
  request: async (endpoint, options = {}) => {
    const url = `${CONFIG.API_BASE_URL}/api${endpoint}`;
    const config = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    return data;
  },

  auth: {
    login: (key) => api.request('/admin/login', { method: 'POST', body: { key } }),
    logout: () => api.request('/admin/logout', { method: 'POST' }),
    changePassword: (currentPassword, newPassword, confirmPassword) => api.request('/admin/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword, confirmPassword },
    }),
    getStats: () => api.request('/admin/stats'),
    getActivationRequests: () => api.request('/admin/activation-requests'),
    approveRequest: (requestId, code) => api.request(`/admin/activation-requests/${requestId}/approve`, { method: 'POST', body: { code } }),
    rejectRequest: (requestId, reason) => api.request(`/admin/activation-requests/${requestId}/reject`, { method: 'POST', body: { reason } }),
    deleteRequest: (requestId) => api.request(`/admin/activation-requests/${requestId}`, { method: 'DELETE' }),
  },

  codes: {
    getAll: () => api.request('/codes/'),
    add: (code) => api.request('/codes/add', { method: 'POST', body: { code } }),
    delete: (code) => api.request(`/codes/${code}`, { method: 'DELETE' }),
    getDetails: (code) => api.request(`/codes/${code}`),
  },
};

const views = {
  switch: (viewName) => {
    document.querySelectorAll('.view').forEach((el) => el.classList.add('hidden'));
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
      targetView.classList.remove('hidden');
      state.currentView = viewName;
    }
    document.body.className = `view-${viewName}`;
  },

  renderStats: (stats) => {
    const container = elements.statsGrid;
    if (!container) return;

    const statsData = [
      { icon: '📊', value: stats.totalCodes, label: 'إجمالي الأكواد' },
      { icon: '✅', value: stats.usedCodes, label: 'الأكواد المفعلة' },
      { icon: '🆓', value: stats.availableCodes, label: 'الأكواد المتاحة' },
      { icon: '📱', value: stats.uniqueDevices, label: 'الأجهزة المفعلة' },
      { icon: '📨', value: stats.pendingRequests || 0, label: 'طلبات معلقة' },
    ];

    container.innerHTML = statsData.map((stat, index) => `
      <div class="stat-card" style="animation-delay: ${index * 0.1}s">
        <div class="stat-icon">${stat.icon}</div>
        <h3>${Number(stat.value || 0).toLocaleString()}</h3>
        <p>${stat.label}</p>
      </div>
    `).join('');

    if (elements.headerStats) {
      elements.headerStats.innerHTML = `
        المجموع: <strong>${stats.totalCodes}</strong> كود |
        المفعلة: <strong>${stats.usedCodes}</strong> |
        المتاحة: <strong>${stats.availableCodes}</strong> |
        الأجهزة: <strong>${stats.uniqueDevices}</strong> |
        الطلبات المعلقة: <strong>${stats.pendingRequests || 0}</strong>
      `;
    }
  },

  renderRequestsTable: (requests) => {
    const tbody = elements.requestsTableBody;
    const cardsContainer = elements.requestsCardsContainer;
    const loadingEl = elements.requestsLoadingState;
    const tableContainer = elements.requestsTableContainer;
    const emptyState = elements.requestsEmptyState;

    loadingEl?.classList.add('hidden');

    if (!requests || requests.length === 0) {
      tableContainer?.classList.add('hidden');
      cardsContainer?.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      return;
    }

    tableContainer?.classList.remove('hidden');
    cardsContainer?.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    tbody.innerHTML = requests.map((request) => `
      <tr class="${utils.isRecent(request.createdAt) ? 'highlight' : ''}">
        <td>
          <div class="request-device">
            <code class="date-text">${utils.escapeHtml(request.deviceId)}</code>
            <div class="request-id">ID: ${utils.escapeHtml(request._id)}</div>
            ${utils.getDeviceUsageHtml(request)}
          </div>
        </td>
        <td>${utils.getRequestStatusBadge(request)}</td>
        <td>${request.assignedCode ? `<span class="code-text">${utils.escapeHtml(request.assignedCode)}</span>` : '<span class="muted-text">-</span>'}</td>
        <td><span class="date-text">${utils.formatDate(request.createdAt)}</span></td>
        <td><span class="date-text">${utils.formatDate(request.updatedAt)}</span></td>
        <td>${utils.getRequestActionsHtml(request)}${utils.getRequestExtraNotesHtml(request)}</td>
      </tr>
    `).join('');

    cardsContainer.innerHTML = requests.map((request) => `
  <article class="request-card ${utils.isRecent(request.createdAt) ? 'highlight' : ''}">
    <div class="request-card-header">
      <div class="request-card-main">
        <div class="request-card-label">رقم الجهاز</div>
        <div class="request-card-device">${utils.escapeHtml(request.deviceId || '—')}</div>
        <div class="request-card-meta">
          <span>${utils.formatDate(request.createdAt)}</span>
        </div>
      </div>
      <div class="request-card-top-actions">
        ${utils.getRequestStatusBadge(request)}
        <div class="request-menu">
          <button class="request-menu-trigger" type="button" aria-label="الإجراءات"
            data-action="toggle-request-menu" data-request-id="${request._id}">⋮</button>
          ${utils.getRequestActionsHtml(request, { compact: true })}
        </div>
      </div>
    </div>
    <div class="request-card-body">
      <div class="request-card-row">
        <span>سجل الجهاز</span>
        <strong>${Number(request.deviceUsage?.activationCount || 0)}</strong>
      </div>
      <div class="request-card-row">
        <span>الكود</span>
        <strong>${request.assignedCode ? utils.escapeHtml(request.assignedCode) : '—'}</strong>
      </div>
    </div>
    <div class="request-card-footer">
      <button class="btn btn-secondary request-details-btn" type="button"
        data-action="show-request-details" data-request-id="${request._id}">تفاصيل</button>
    </div>
  </article>
`).join('');
  },

  renderCodesTable: (codes) => {
    const tbody = elements.codesTableBody;
    const cardsContainer = elements.codesCardsContainer;
    const loadingEl = elements.loadingState;
    const tableContainer = elements.tableContainer;
    const emptyState = elements.emptyState;

    loadingEl?.classList.add('hidden');

    if (!codes || codes.length === 0) {
      tableContainer?.classList.add('hidden');
      cardsContainer?.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      return;
    }

    tableContainer?.classList.remove('hidden');
    cardsContainer?.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    tbody.innerHTML = codes.map((code) => {
      const statusBadge = utils.getCodeStatusBadge(code);

      return `
        <tr class="${utils.isRecent(code.createdAt) ? 'highlight' : ''}">
          <td><span class="code-text">${utils.escapeHtml(code.code)}</span></td>
          <td>${statusBadge}</td>
          <td>${code.deviceId ? `<code class="date-text">${utils.escapeHtml(code.deviceId)}</code>` : '<span class="muted-text">-</span>'}</td>
          <td>${code.activatedAt ? `<span class="date-text">${utils.formatDate(code.activatedAt)}</span>` : '<span class="muted-text">-</span>'}</td>
          <td><span class="date-text">${utils.formatDate(code.createdAt)}</span></td>
          <td>
            <div class="action-buttons">
              <button data-action="delete" data-code="${encodeURIComponent(code.code)}" data-used="${code.used}" data-device-id="${encodeURIComponent(code.deviceId || '')}" class="action-btn delete-btn ${code.used ? 'active-code' : ''}">${code.used ? 'حذف (مفعل)' : 'حذف'}</button>
              <button data-action="details" data-code="${encodeURIComponent(code.code)}" class="action-btn details-btn">تفاصيل</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

   cardsContainer.innerHTML = codes.map((code) => `
  <article class="code-card ${utils.isRecent(code.createdAt) ? 'highlight' : ''}">
    <div class="code-card-header">
      <div>
        <div class="code-card-label">الكود</div>
        <div class="code-card-value">${utils.escapeHtml(code.code)}</div>
      </div>
      ${utils.getCodeStatusBadge(code)}
    </div>
    <div class="code-card-body">
      <div class="code-card-row">
        <span>الجهاز</span>
        <strong class="code-card-device-id">${utils.escapeHtml(code.deviceId || '—')}</strong>
      </div>
      <div class="code-card-row">
        <span>الإنشاء</span>
        <strong>${utils.formatDate(code.createdAt)}</strong>
      </div>
    </div>
    <div class="code-card-footer">
      <button data-action="delete" data-code="${encodeURIComponent(code.code)}"
        data-used="${code.used}" data-device-id="${encodeURIComponent(code.deviceId || '')}"
        class="action-btn delete-btn ${code.used ? 'active-code' : ''}">
        ${code.used ? 'حذف (مفعل)' : 'حذف'}
      </button>
      <button data-action="details" data-code="${encodeURIComponent(code.code)}"
        class="action-btn details-btn">تفاصيل</button>
    </div>
  </article>
`).join('');
  },
};

const handlers = {
  login: async (e) => {
    e.preventDefault();
    const key = elements.adminKey?.value.trim();
    if (!key) {
      utils.showAlert('loginAlert', 'الرجاء إدخال كلمة السر', 'danger');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>جار التحقق...</span>';

    try {
      await api.auth.login(key);
      state.isLoggedIn = true;
      utils.showAlert('mainAlert', 'تم تسجيل الدخول بنجاح', 'success', 3000);
      views.switch('dashboard');
      await handlers.loadDashboard();
      handlers.startAutoRefresh();
    } catch (error) {
      utils.showAlert('loginAlert', `❌ ${error.message}`, 'danger');
      elements.adminKey.value = '';
      elements.adminKey.focus();
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  logout: async () => {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;

    try {
      await api.auth.logout();
      handlers.stopAutoRefresh();
      state.isLoggedIn = false;
      state.codes = [];
      state.requests = [];
      views.switch('login');
      utils.showAlert('loginAlert', 'تم تسجيل الخروج بنجاح', 'success', 3000);
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  forceLogout: async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Force logout error:', error);
    } finally {
      handlers.stopAutoRefresh();
      state.isLoggedIn = false;
      state.codes = [];
      state.requests = [];
      views.switch('login');
      utils.showAlert('loginAlert', 'تم تسجيل الخروج بنجاح', 'success', 3000);
    }
  },

  loadDashboard: async () => {
    try {
      await Promise.all([handlers.loadCodes(), handlers.loadStats(), handlers.loadActivationRequests()]);
    } catch (error) {
      utils.showAlert('mainAlert', '❌ خطأ في تحميل البيانات', 'danger');
    }
  },

  loadCodes: async () => {
    elements.loadingState?.classList.remove('hidden');
    elements.tableContainer?.classList.add('hidden');

    try {
      const data = await api.codes.getAll();
      state.codes = data.codes || [];
      views.renderCodesTable(state.codes);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ خطأ في تحميل الأكواد: ${error.message}`, 'danger');
      views.renderCodesTable([]);
    }
  },

  loadActivationRequests: async () => {
    elements.requestsLoadingState?.classList.remove('hidden');
    elements.requestsTableContainer?.classList.add('hidden');
    elements.requestsCardsContainer?.classList.add('hidden');

    try {
      const data = await api.auth.getActivationRequests();
      state.requests = data.requests || [];
      views.renderRequestsTable(state.requests);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ خطأ في تحميل طلبات التفعيل: ${error.message}`, 'danger');
      views.renderRequestsTable([]);
    }
  },

  loadStats: async () => {
    try {
      const data = await api.auth.getStats();
      state.stats = data.stats || {};
      views.renderStats(state.stats);
      if (elements.dbStatus) {
        elements.dbStatus.innerHTML = '<span class="status-dot active"></span><span>متصل</span>';
      }
    } catch (error) {
      console.error('Stats error:', error);
      if (elements.dbStatus) {
        elements.dbStatus.innerHTML = '<span class="status-dot inactive"></span><span>غير متصل</span>';
      }
    }
  },

  addCode: async (e) => {
    e.preventDefault();
    const code = elements.newCode?.value.trim();

    if (!code || code.length < 3) {
      utils.showAlert('mainAlert', 'الكود يجب أن يكون 3 أحرف على الأقل', 'danger');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>جار الإضافة...</span>';

    try {
      await api.codes.add(code);
      utils.showAlert('mainAlert', `تمت إضافة الكود <strong>${utils.escapeHtml(code.toUpperCase())}</strong> بنجاح`, 'success', 5000);
      elements.newCode.value = '';
      elements.newCode.focus();
      await Promise.all([handlers.loadCodes(), handlers.loadStats()]);
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('موجود')) {
        utils.showAlert('mainAlert', 'هذا الكود موجود مسبقًا في النظام', 'warning', 5000);
        elements.newCode.select();
      } else {
        utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  approveRequest: async (requestId, sourceButton = null) => {
    const scopedInput = sourceButton?.closest('.request-actions, .modal-request-actions, .request-details-modal, .modal-content')
      ?.querySelector(`.request-code-input[data-request-id="${requestId}"]`);
    const input = scopedInput || document.querySelector(`.request-code-input[data-request-id="${requestId}"]`);
    const code = input?.value.trim().toUpperCase();

    if (!code) {
      utils.showAlert('mainAlert', 'أدخل الكود الذي تريد ربطه بهذا الطلب أولًا', 'warning');
      input?.focus();
      return;
    }

    try {
      await api.auth.approveRequest(requestId, code);
      utils.showAlert('mainAlert', `تم ربط الكود <strong>${utils.escapeHtml(code)}</strong> مع الطلب بنجاح`, 'success', 5000);
      await Promise.all([handlers.loadActivationRequests(), handlers.loadCodes(), handlers.loadStats()]);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  rejectRequest: async (requestId) => {
    const reasonInput = prompt('سبب الرفض (اختياري):');

    if (reasonInput === null) {
      return;
    }

    const reason = reasonInput.trim();

    try {
      await api.auth.rejectRequest(requestId, reason);
      utils.showAlert('mainAlert', 'تم رفض طلب التفعيل', 'success', 4000);
      await Promise.all([handlers.loadActivationRequests(), handlers.loadStats()]);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  deleteRequest: async (requestId) => {
    const request = state.requests.find((item) => item._id === requestId);
    if (!request) return;

    if (!utils.canArchiveRequest(request)) {
      utils.showAlert('mainAlert', 'لا يمكن حذف الطلب وهو ما زال معلقًا', 'warning');
      return;
    }

    const message = request.status === 'approved'
      ? 'سيتم إخفاء الطلب من لوحة الأدمن فقط، ولن يتم إلغاء التفعيل أو الربط الحالي. هل تريد المتابعة؟'
      : 'سيتم حذف الطلب من لوحة الأدمن فقط. هل تريد المتابعة؟';

    if (!confirm(message)) return;

    try {
      await api.auth.deleteRequest(requestId);
      handlers.hideRequestDetailsModal();
      utils.showAlert('mainAlert', 'تم حذف الطلب من لوحة الأدمن', 'success', 4000);
      await Promise.all([handlers.loadActivationRequests(), handlers.loadStats()]);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  deleteCode: async (code, isUsed = false, deviceId = '') => {
    let message = `هل أنت متأكد من حذف الكود "${code}"؟`;

    if (isUsed) {
      message = `تنبيه مهم\n\nهذا الكود مفعل على جهاز بالفعل.\nالكود: ${code}\nالجهاز: ${deviceId || 'غير معروف'}\n\nحذف هذا الكود قد يسبب توقف التفعيل على هذا الجهاز.\nهل تريد المتابعة بالحذف؟`;
    }

    if (!confirm(message)) return;

    try {
      const data = await api.codes.delete(code);
      utils.showAlert('mainAlert', `✅ ${data.message}`, 'success', 5000);
      await Promise.all([handlers.loadCodes(), handlers.loadStats()]);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  showDetails: async (code) => {
    try {
      const data = await api.codes.getDetails(code);
      const codeData = data.code;

      elements.detailsContent.innerHTML = `
        <div class="details-grid">
          <p><strong>الكود:</strong> <span class="code-text">${utils.escapeHtml(codeData.code)}</span></p>
          <p><strong>الحالة:</strong> ${codeData.used ? '🔒 مفعل' : '✅ متاح'}</p>
          <p><strong>رقم الجهاز:</strong> ${utils.escapeHtml(codeData.deviceId || '-')}</p>
          <p><strong>تاريخ التفعيل:</strong> ${utils.formatDate(codeData.activatedAt)}</p>
          <p><strong>تاريخ الإنشاء:</strong> ${utils.formatDate(codeData.createdAt)}</p>
        </div>
      `;

      elements.detailsModal.classList.remove('hidden');
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  showRequestDetails: (requestId) => {
    const request = state.requests.find((item) => item._id === requestId);
    if (!request || !elements.requestDetailsContent || !elements.requestDetailsModal) return;

    elements.requestDetailsContent.innerHTML = utils.getRequestDetailsHtml(request);
    elements.requestDetailsActions.innerHTML = utils.getRequestActionsHtml(request).replace('request-actions', 'request-actions modal-request-actions');
    elements.requestDetailsModal.classList.remove('hidden');
  },

  hideRequestDetailsModal: () => elements.requestDetailsModal?.classList.add('hidden'),

  toggleRequestMenu: (button) => {
    const menu = button.closest('.request-menu');
    if (!menu) return;

    document.querySelectorAll('.request-menu.open').forEach((item) => {
      if (item !== menu) item.classList.remove('open');
    });

    menu.classList.toggle('open');
  },

  closeRequestMenus: () => {
    document.querySelectorAll('.request-menu.open').forEach((item) => item.classList.remove('open'));
  },

  changePassword: async (e) => {
    e.preventDefault();

    const currentPassword = elements.currentPassword?.value;
    const newPassword = elements.newPassword?.value;
    const confirmPassword = elements.confirmPassword?.value;

    if (newPassword !== confirmPassword) {
      utils.showAlert('passwordAlert', 'كلمتا السر غير متطابقتين', 'danger');
      return;
    }

    if (newPassword.length < 6) {
      utils.showAlert('passwordAlert', 'كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل', 'danger');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>جار الحفظ...</span>';

    try {
      await api.auth.changePassword(currentPassword, newPassword, confirmPassword);
      utils.showAlert('passwordAlert', 'تم تغيير كلمة السر بنجاح', 'success');
      setTimeout(() => {
        handlers.hidePasswordModal();
        utils.showAlert('mainAlert', 'تم تغيير كلمة السر. سجل الدخول مرة أخرى.', 'success', 5000);
        setTimeout(() => handlers.forceLogout(), 2000);
      }, 1500);
    } catch (error) {
      utils.showAlert('passwordAlert', `❌ ${error.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  showPasswordModal: () => {
    elements.passwordModal.classList.remove('hidden');
    elements.currentPassword.value = '';
    elements.newPassword.value = '';
    elements.confirmPassword.value = '';
    utils.hideAlert('passwordAlert');
  },

  hidePasswordModal: () => elements.passwordModal.classList.add('hidden'),
  hideDetailsModal: () => elements.detailsModal.classList.add('hidden'),

  handleRequestAction: (button) => {
    const { action, requestId } = button.dataset;
    if (!action || !requestId) return;

    if (action === 'toggle-request-menu') {
      handlers.toggleRequestMenu(button);
      return;
    }

    handlers.closeRequestMenus();

    if (action === 'approve-request') return handlers.approveRequest(requestId, button);
    if (action === 'reject-request') return handlers.rejectRequest(requestId);
    if (action === 'delete-request') return handlers.deleteRequest(requestId);
    if (action === 'show-request-details') return handlers.showRequestDetails(requestId);
  },

  startAutoRefresh: () => {
    handlers.stopAutoRefresh();

    state.refreshTimer = setInterval(() => {
      if (state.currentView === 'dashboard' && document.visibilityState === 'visible') {
        handlers.loadCodes();
        handlers.loadActivationRequests();
      }
    }, CONFIG.REFRESH_INTERVAL);

    state.statsTimer = setInterval(() => {
      if (state.currentView === 'dashboard') {
        handlers.loadStats();
      }
    }, CONFIG.STATS_REFRESH_INTERVAL);
  },

  stopAutoRefresh: () => {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    if (state.statsTimer) clearInterval(state.statsTimer);
    state.refreshTimer = null;
    state.statsTimer = null;
  },
};

const init = () => {
  const elementIds = [
    'loginView', 'dashboardView',
    'loginForm', 'adminKey', 'loginAlert',
    'mainAlert', 'statsGrid', 'headerStats',
    'requestsLoadingState', 'requestsTableContainer', 'requestsTableBody', 'requestsCardsContainer', 'requestsEmptyState',
    'loadingState', 'codesTableBody', 'codesCardsContainer', 'tableContainer', 'emptyState',
    'addCodeForm', 'newCode',
    'refreshBtn', 'logoutBtn', 'changePasswordBtn',
    'passwordModal', 'passwordForm', 'passwordAlert',
    'currentPassword', 'newPassword', 'confirmPassword',
    'closeModalBtn', 'cancelPasswordBtn',
    'detailsModal', 'detailsContent', 'closeDetailsBtn', 'closeDetailsFooterBtn',
    'requestDetailsModal', 'requestDetailsContent', 'requestDetailsActions', 'closeRequestDetailsBtn', 'closeRequestDetailsFooterBtn',
    'dbStatus',
  ];

  elementIds.forEach((id) => {
    elements[id] = document.getElementById(id);
  });

  elements.loginForm?.addEventListener('submit', handlers.login);
  elements.addCodeForm?.addEventListener('submit', handlers.addCode);
  elements.passwordForm?.addEventListener('submit', handlers.changePassword);

  elements.logoutBtn?.addEventListener('click', handlers.logout);
  elements.refreshBtn?.addEventListener('click', handlers.loadDashboard);
  elements.changePasswordBtn?.addEventListener('click', handlers.showPasswordModal);

  elements.closeModalBtn?.addEventListener('click', handlers.hidePasswordModal);
  elements.cancelPasswordBtn?.addEventListener('click', handlers.hidePasswordModal);
  elements.closeDetailsBtn?.addEventListener('click', handlers.hideDetailsModal);
  elements.closeDetailsFooterBtn?.addEventListener('click', handlers.hideDetailsModal);
  elements.closeRequestDetailsBtn?.addEventListener('click', handlers.hideRequestDetailsModal);
  elements.closeRequestDetailsFooterBtn?.addEventListener('click', handlers.hideRequestDetailsModal);

  elements.requestsTableBody?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (button) handlers.handleRequestAction(button);
  });

  elements.requestsCardsContainer?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (button) handlers.handleRequestAction(button);
  });

  elements.requestDetailsActions?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (button) handlers.handleRequestAction(button);
  });

  elements.codesTableBody?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const code = decodeURIComponent(button.dataset.code || '');
    if (!code) return;

    if (button.dataset.action === 'delete') {
      handlers.deleteCode(code, button.dataset.used === 'true', decodeURIComponent(button.dataset.deviceId || ''));
      return;
    }

    if (button.dataset.action === 'details') {
      handlers.showDetails(code);
    }
  });

  elements.codesCardsContainer?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const code = decodeURIComponent(button.dataset.code || '');
    if (!code) return;

    if (button.dataset.action === 'delete') {
      handlers.deleteCode(code, button.dataset.used === 'true', decodeURIComponent(button.dataset.deviceId || ''));
      return;
    }

    if (button.dataset.action === 'details') {
      handlers.showDetails(code);
    }
  });

  window.addEventListener('click', (e) => {
    if (e.target === elements.passwordModal) handlers.hidePasswordModal();
    if (e.target === elements.detailsModal) handlers.hideDetailsModal();
    if (e.target === elements.requestDetailsModal) handlers.hideRequestDetailsModal();
    if (!e.target.closest('.request-menu')) handlers.closeRequestMenus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      handlers.hidePasswordModal();
      handlers.hideDetailsModal();
      handlers.hideRequestDetailsModal();
      handlers.closeRequestMenus();
    }
  });

  elements.adminKey?.focus();

  api.auth.getStats()
    .then(() => {
      state.isLoggedIn = true;
      views.switch('dashboard');
      handlers.loadDashboard();
      handlers.startAutoRefresh();
    })
    .catch(() => {
      // Not logged in.
    });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
