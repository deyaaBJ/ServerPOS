/**
 * Admin Dashboard Application
 * Modern ES6+ JavaScript with modular architecture
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

  getDeviceUsageHtml: (request) => {
    const usage = request.deviceUsage || {};
    const activationCount = Number(usage.activationCount || 0);
    const codes = Array.isArray(usage.codes) ? usage.codes.filter(Boolean) : [];

    if (activationCount === 0) {
      return '<div class="request-note">سجل الجهاز: غير موجود مسبقًا في الأكواد المفعلة.</div>';
    }

    const codesHtml = codes.length
      ? codes.map((code) => `<span class="code-text">${code}</span>`).join(' ، ')
      : 'لا يوجد';

    return `
      <div class="request-note">
        سجل الجهاز: موجود <strong>${activationCount}</strong> ${activationCount === 1 ? 'مرة' : 'مرات'}، والأكواد المرتبطة: ${codesHtml}
      </div>
    `;
  },

  getRequestStatusBadge: (request) => {
    if (request.status === 'completed') {
      return '<span class="badge badge-success">تم التفعيل</span>';
    }

    if (request.status === 'approved') {
      return '<span class="badge badge-warning">بانتظار إدخال الكود</span>';
    }

    if (request.status === 'rejected') {
      return '<span class="badge badge-danger">مرفوض</span>';
    }

    return '<span class="badge badge-primary">معلق</span>';
  }
};

const api = {
  request: async (endpoint, options = {}) => {
    const url = `${CONFIG.API_BASE_URL}/api${endpoint}`;

    const config = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
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
    login: (key) => api.request('/admin/login', {
      method: 'POST',
      body: { key },
    }),
    logout: () => api.request('/admin/logout', { method: 'POST' }),
    changePassword: (currentPassword, newPassword, confirmPassword) =>
      api.request('/admin/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, confirmPassword },
      }),
    getStats: () => api.request('/admin/stats'),
    getActivationRequests: () => api.request('/admin/activation-requests'),
    approveRequest: (requestId, code) =>
      api.request(`/admin/activation-requests/${requestId}/approve`, {
        method: 'POST',
        body: { code },
      }),
    rejectRequest: (requestId, reason) =>
      api.request(`/admin/activation-requests/${requestId}/reject`, {
        method: 'POST',
        body: { reason },
      }),
  },

  codes: {
    getAll: () => api.request('/codes/'),
    add: (code) => api.request('/codes/add', {
      method: 'POST',
      body: { code },
    }),
    delete: (code) => api.request(`/codes/${code}`, {
      method: 'DELETE',
    }),
    getDetails: (code) => api.request(`/codes/${code}`),
  },
};

const views = {
  switch: (viewName) => {
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.add('hidden');
    });

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
    const loadingEl = elements.requestsLoadingState;
    const tableContainer = elements.requestsTableContainer;
    const emptyState = elements.requestsEmptyState;

    if (loadingEl) loadingEl.classList.add('hidden');

    if (!requests || requests.length === 0) {
      tableContainer?.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      return;
    }

    tableContainer?.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    tbody.innerHTML = requests.map((request) => `
      <tr class="${utils.isRecent(request.createdAt) ? 'highlight' : ''}">
        <td>
          <div class="request-device">
            <code class="date-text">${request.deviceId}</code>
            <div class="request-id">ID: ${request._id}</div>
            ${utils.getDeviceUsageHtml(request)}
          </div>
        </td>
        <td>${utils.getRequestStatusBadge(request)}</td>
        <td>${request.assignedCode ? `<span class="code-text">${request.assignedCode}</span>` : '<span style="color: #999;">-</span>'}</td>
        <td><span class="date-text">${utils.formatDate(request.createdAt)}</span></td>
        <td><span class="date-text">${utils.formatDate(request.updatedAt)}</span></td>
        <td>
          <div class="request-actions">
            <input
              type="text"
              class="form-control request-code-input"
              data-request-id="${request._id}"
              placeholder="أدخل كود للربط"
              value="${request.assignedCode || ''}"
              ${request.status === 'completed' ? 'disabled' : ''}
            />
            <button
              class="action-btn approve-btn"
              data-action="approve-request"
              data-request-id="${request._id}"
              ${request.status === 'completed' ? 'disabled' : ''}
            >
              ربط الكود
            </button>
            <button
              class="action-btn reject-btn"
              data-action="reject-request"
              data-request-id="${request._id}"
              ${request.status === 'completed' ? 'disabled' : ''}
            >
              رفض
            </button>
          </div>
          ${request.status === 'rejected' && request.rejectionReason
            ? `<div class="request-note">سبب الرفض: ${request.rejectionReason}</div>`
            : ''}
          ${request.status === 'approved'
            ? '<div class="request-note">بعد إرسال هذا الكود لصاحب الجهاز، لن يعمل إلا لنفس الجهاز الذي قدّم الطلب.</div>'
            : ''}
        </td>
      </tr>
    `).join('');
  },

  renderCodesTable: (codes) => {
    const tbody = elements.codesTableBody;
    const loadingEl = elements.loadingState;
    const tableContainer = elements.tableContainer;
    const emptyState = elements.emptyState;

    if (loadingEl) loadingEl.classList.add('hidden');

    if (!codes || codes.length === 0) {
      tableContainer?.classList.add('hidden');
      emptyState?.classList.remove('hidden');
      return;
    }

    tableContainer?.classList.remove('hidden');
    emptyState?.classList.add('hidden');

    tbody.innerHTML = codes.map((code) => {
      const statusBadge = code.used
        ? '<span class="badge badge-danger">🔒 مفعل</span>'
        : '<span class="badge badge-success">✅ متاح</span>';

      return `
        <tr class="${utils.isRecent(code.createdAt) ? 'highlight' : ''}">
          <td><span class="code-text">${code.code}</span></td>
          <td>${statusBadge}</td>
          <td>${code.deviceId ? `<code class="date-text">${code.deviceId}</code>` : '<span style="color: #999;">-</span>'}</td>
          <td>${code.activatedAt ? `<span class="date-text">${utils.formatDate(code.activatedAt)}</span>` : '<span style="color: #999;">-</span>'}</td>
          <td><span class="date-text">${utils.formatDate(code.createdAt)}</span></td>
          <td>
            <div class="action-buttons">
              <button
                data-action="delete"
                data-code="${encodeURIComponent(code.code)}"
                data-used="${code.used}"
                data-device-id="${encodeURIComponent(code.deviceId || '')}"
                class="action-btn delete-btn ${code.used ? 'active-code' : ''}"
              >
                🗑️ ${code.used ? 'حذف (مفعل)' : 'حذف'}
              </button>
              <button
                data-action="details"
                data-code="${encodeURIComponent(code.code)}"
                class="action-btn details-btn"
              >
                🔍 تفاصيل
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
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
    btn.innerHTML = '<span>⏳ جاري التحقق...</span>';

    try {
      await api.auth.login(key);
      state.isLoggedIn = true;
      utils.showAlert('mainAlert', '✅ تم تسجيل الدخول بنجاح', 'success', 3000);

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
      await Promise.all([
        handlers.loadCodes(),
        handlers.loadStats(),
        handlers.loadActivationRequests()
      ]);
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
        elements.dbStatus.innerHTML = `
          <span class="status-dot active"></span>
          <span>متصل</span>
        `;
      }
    } catch (error) {
      console.error('Stats error:', error);
      if (elements.dbStatus) {
        elements.dbStatus.innerHTML = `
          <span class="status-dot inactive"></span>
          <span>غير متصل</span>
        `;
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
    btn.innerHTML = '<span>⏳ جاري الإضافة...</span>';

    try {
      await api.codes.add(code);
      utils.showAlert('mainAlert', `✅ تم إضافة الكود <strong>${code.toUpperCase()}</strong> بنجاح`, 'success', 5000);
      elements.newCode.value = '';
      elements.newCode.focus();
      await Promise.all([handlers.loadCodes(), handlers.loadStats()]);
    } catch (error) {
      if (error.message.includes('موجود') || error.message.includes('already exists')) {
        utils.showAlert('mainAlert', '⚠️ هذا الكود موجود مسبقاً في النظام', 'warning', 5000);
        elements.newCode.select();
      } else {
        utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  approveRequest: async (requestId) => {
    const input = document.querySelector(`.request-code-input[data-request-id="${requestId}"]`);
    const code = input?.value.trim().toUpperCase();

    if (!code) {
      utils.showAlert('mainAlert', 'أدخل الكود الذي تريد ربطه بهذا الطلب أولاً', 'warning');
      input?.focus();
      return;
    }

    try {
      await api.auth.approveRequest(requestId, code);
      utils.showAlert('mainAlert', `✅ تم ربط الكود <strong>${code}</strong> مع الطلب بنجاح`, 'success', 5000);
      await Promise.all([
        handlers.loadActivationRequests(),
        handlers.loadCodes(),
        handlers.loadStats()
      ]);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  rejectRequest: async (requestId) => {
    const reason = prompt('سبب الرفض (اختياري):') || '';

    try {
      await api.auth.rejectRequest(requestId, reason);
      utils.showAlert('mainAlert', '✅ تم رفض طلب التفعيل', 'success', 4000);
      await Promise.all([
        handlers.loadActivationRequests(),
        handlers.loadStats()
      ]);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  deleteCode: async (code, isUsed = false, deviceId = '') => {
    let message = `هل أنت متأكد من حذف الكود "${code}"؟`;

    if (isUsed) {
      message = `⚠️ تنبيه مهم\n\nهذا الكود مفعل على جهاز بالفعل.\nالكود: ${code}\nالجهاز: ${deviceId || 'غير معروف'}\n\nحذف هذا الكود قد يسبب توقف التفعيل على هذا الجهاز.\nهل تريد المتابعة بالحذف؟`;
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
          <p><strong>الكود:</strong> <span class="code-text">${codeData.code}</span></p>
          <p><strong>الحالة:</strong> ${codeData.used ? '🔒 مفعل' : '✅ متاح'}</p>
          <p><strong>رقم الجهاز:</strong> ${codeData.deviceId || '-'}</p>
          <p><strong>تاريخ التفعيل:</strong> ${utils.formatDate(codeData.activatedAt)}</p>
          <p><strong>تاريخ الإنشاء:</strong> ${utils.formatDate(codeData.createdAt)}</p>
        </div>
      `;

      elements.detailsModal.classList.remove('hidden');
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
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
    btn.innerHTML = '<span>⏳ جاري الحفظ...</span>';

    try {
      await api.auth.changePassword(currentPassword, newPassword, confirmPassword);
      utils.showAlert('passwordAlert', '✅ تم تغيير كلمة السر بنجاح', 'success');

      setTimeout(() => {
        handlers.hidePasswordModal();
        utils.showAlert('mainAlert', '✅ تم تغيير كلمة السر. سجل الدخول مرة أخرى.', 'success', 5000);
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

  hidePasswordModal: () => {
    elements.passwordModal.classList.add('hidden');
  },

  hideDetailsModal: () => {
    elements.detailsModal.classList.add('hidden');
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
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }

    if (state.statsTimer) {
      clearInterval(state.statsTimer);
      state.statsTimer = null;
    }
  }
};

const init = () => {
  const elementIds = [
    'loginView', 'dashboardView',
    'loginForm', 'adminKey', 'loginAlert',
    'mainAlert', 'statsGrid', 'headerStats',
    'requestsLoadingState', 'requestsTableContainer', 'requestsTableBody', 'requestsEmptyState',
    'loadingState', 'codesTableBody', 'tableContainer', 'emptyState',
    'addCodeForm', 'newCode',
    'refreshBtn', 'logoutBtn', 'changePasswordBtn',
    'passwordModal', 'passwordForm', 'passwordAlert',
    'currentPassword', 'newPassword', 'confirmPassword',
    'closeModalBtn', 'cancelPasswordBtn',
    'detailsModal', 'detailsContent', 'closeDetailsBtn', 'closeDetailsFooterBtn',
    'dbStatus'
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

  elements.requestsTableBody?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.requestId;
    if (!requestId) return;

    if (button.dataset.action === 'approve-request') {
      handlers.approveRequest(requestId);
      return;
    }

    if (button.dataset.action === 'reject-request') {
      handlers.rejectRequest(requestId);
    }
  });

  elements.codesTableBody?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const code = decodeURIComponent(button.dataset.code || '');
    if (!code) return;

    if (button.dataset.action === 'delete') {
      handlers.deleteCode(
        code,
        button.dataset.used === 'true',
        decodeURIComponent(button.dataset.deviceId || '')
      );
      return;
    }

    if (button.dataset.action === 'details') {
      handlers.showDetails(code);
    }
  });

  window.addEventListener('click', (e) => {
    if (e.target === elements.passwordModal) {
      handlers.hidePasswordModal();
    }

    if (e.target === elements.detailsModal) {
      handlers.hideDetailsModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      handlers.hidePasswordModal();
      handlers.hideDetailsModal();
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
