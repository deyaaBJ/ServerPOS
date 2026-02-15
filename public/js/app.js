/**
 * Admin Dashboard Application
 * Modern ES6+ JavaScript with modular architecture
 */

// Configuration
const CONFIG = {
  API_BASE_URL: '',
  REFRESH_INTERVAL: 60000, // 1 minute
  STATS_REFRESH_INTERVAL: 30000, // 30 seconds
  HIGHLIGHT_DURATION: 300000, // 5 minutes
};

// State Management
const state = {
  isLoggedIn: false,
  codes: [],
  stats: {},
  currentView: 'login',
  refreshTimer: null,
  statsTimer: null,
};

// DOM Elements Cache
const elements = {};

// Utility Functions
const utils = {
  /**
   * Format date to Arabic locale
   */
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

  /**
   * Show alert message
   */
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

  /**
   * Hide alert
   */
  hideAlert: (elementId) => {
    const element = elements[elementId] || document.getElementById(elementId);
    if (element) {
      element.classList.add('hidden');
    }
  },

  /**
   * Debounce function
   */
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Check if code is recently added (for highlighting)
   */
  isRecent: (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    return (now - created) < CONFIG.HIGHLIGHT_DURATION;
  },
};

// API Service
const api = {
  /**
   * Make authenticated API request
   */
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

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Auth endpoints
  auth: {
    login: (key) => api.request('/admin/login', {
      method: 'POST',
      body: { key },
    }),
    
    logout: () => api.request('/admin/logout', { method: 'POST' }),
    
    changePassword: (currentPassword, newPassword) => 
      api.request('/admin/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      }),
    
    getStats: () => api.request('/admin/stats'),
  },

  // Codes endpoints
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

  // Activation endpoint
  activate: (code, deviceId) => api.request('/activate', {
    method: 'POST',
    body: { code, deviceId },
  }),
};

// View Management
const views = {
  /**
   * Switch between views
   */
  switch: (viewName) => {
    // Hide all views
    document.querySelectorAll('.view').forEach(el => {
      el.classList.add('hidden');
    });

    // Show target view
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
      targetView.classList.remove('hidden');
      state.currentView = viewName;
    }

    // Update body class for styling
    document.body.className = `view-${viewName}`;
  },

  /**
   * Render stats cards
   */
  renderStats: (stats) => {
    const container = elements.statsGrid;
    if (!container) return;

    const statsData = [
      { icon: '📊', value: stats.totalCodes, label: 'إجمالي الأكواد', color: 'primary' },
      { icon: '✅', value: stats.usedCodes, label: 'الأكواد المفعلة', color: 'success' },
      { icon: '🆓', value: stats.availableCodes, label: 'الأكواد المتاحة', color: 'danger' },
      { icon: '📱', value: stats.uniqueDevices, label: 'الأجهزة المفعلة', color: 'warning' },
    ];

    container.innerHTML = statsData.map((stat, index) => `
      <div class="stat-card" style="animation-delay: ${index * 0.1}s">
        <div class="stat-icon">${stat.icon}</div>
        <h3>${stat.value.toLocaleString()}</h3>
        <p>${stat.label}</p>
      </div>
    `).join('');

    // Update header stats
    if (elements.headerStats) {
      elements.headerStats.innerHTML = `
        المجموع: <strong>${stats.totalCodes}</strong> كود |
        المفعلة: <strong>${stats.usedCodes}</strong> |
        المتاحة: <strong>${stats.availableCodes}</strong> |
        الأجهزة: <strong>${stats.uniqueDevices}</strong>
      `;
    }
  },

  /**
   * Render codes table
   */
  renderTable: (codes) => {
    const tbody = elements.codesTableBody;
    const loadingEl = elements.loadingState;
    const tableContainer = elements.tableContainer;
    const emptyState = elements.emptyState;

    if (loadingEl) loadingEl.classList.add('hidden');

    if (!codes || codes.length === 0) {
      if (tableContainer) tableContainer.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (tableContainer) tableContainer.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');

    tbody.innerHTML = codes.map(code => {
      const isRecent = utils.isRecent(code.createdAt);
      const statusBadge = code.used
        ? `<span class="badge badge-danger">🔒 مفعل</span>`
        : `<span class="badge badge-success">✅ متاح</span>`;

      return `
        <tr class="${isRecent ? 'highlight' : ''}">
          <td><span class="code-text">${code.code}</span></td>
          <td>${statusBadge}</td>
          <td>
            ${code.deviceId 
              ? `<code class="date-text">${code.deviceId}</code>` 
              : '<span style="color: #999;">-</span>'}
          </td>
          <td>
            ${code.activatedAt 
              ? `<span class="date-text">${utils.formatDate(code.activatedAt)}</span>` 
              : '<span style="color: #999;">-</span>'}
          </td>
          <td>
            <span class="date-text">${utils.formatDate(code.createdAt)}</span>
          </td>
          <td>
            <div class="action-buttons">
              <button 
                data-action="delete"
                data-code="${encodeURIComponent(code.code)}"
                data-used="${code.used}"
                data-device-id="${encodeURIComponent(code.deviceId || '')}"
                class="action-btn delete-btn ${code.used ? 'active-code' : ''}"
                title="${code.used ? 'حذف الكود المفعل (تحذير)' : 'حذف الكود'}">
                🗑️ ${code.used ? 'حذف (مفعل)' : 'حذف'}
              </button>
              <button 
                data-action="details"
                data-code="${encodeURIComponent(code.code)}"
                class="action-btn details-btn"
                title="عرض التفاصيل">
                🔍 تفاصيل
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },
};

// Event Handlers
const handlers = {
  /**
   * Handle login
   */
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
      const data = await api.auth.login(key);
      
      state.isLoggedIn = true;
      utils.showAlert('mainAlert', '✅ تم تسجيل الدخول بنجاح', 'success', 3000);
      
      views.switch('dashboard');
      await handlers.loadDashboard();
      
      // Start auto-refresh
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

  /**
   * Handle logout
   */
  logout: async () => {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;

    try {
      await api.auth.logout();
      handlers.stopAutoRefresh();
      state.isLoggedIn = false;
      state.codes = [];
      
      views.switch('login');
      utils.showAlert('loginAlert', 'تم تسجيل الخروج بنجاح', 'success', 3000);
      
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  /**
   * Load dashboard data
   */
  loadDashboard: async () => {
    try {
      await Promise.all([
        handlers.loadCodes(),
        handlers.loadStats(),
      ]);
    } catch (error) {
      utils.showAlert('mainAlert', '❌ خطأ في تحميل البيانات', 'danger');
    }
  },

  /**
   * Load codes
   */
  loadCodes: async () => {
    elements.loadingState?.classList.remove('hidden');
    elements.tableContainer?.classList.add('hidden');

    try {
      const data = await api.codes.getAll();
      state.codes = data.codes || [];
      views.renderTable(state.codes);
    } catch (error) {
      utils.showAlert('mainAlert', `❌ خطأ في تحميل الأكواد: ${error.message}`, 'danger');
      views.renderTable([]);
    }
  },

  /**
   * Load stats
   */
  loadStats: async () => {
    try {
      const data = await api.auth.getStats();
      state.stats = data.stats;
      views.renderStats(state.stats);
      
      // Update DB status
      const dbStatus = elements.dbStatus;
      if (dbStatus) {
        dbStatus.innerHTML = `
          <span class="status-dot active"></span>
          <span>متصل</span>
        `;
      }
    } catch (error) {
      console.error('Stats error:', error);
      const dbStatus = elements.dbStatus;
      if (dbStatus) {
        dbStatus.innerHTML = `
          <span class="status-dot inactive"></span>
          <span>غير متصل</span>
        `;
      }
    }
  },

  /**
   * Add new code
   */
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
      
      await handlers.loadCodes();
      
    } catch (error) {
      if (error.message.includes('موجود مسبقاً') || error.message.includes('already exists')) {
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

  /**
   * Delete code
   */
  deleteCode: async (code, isUsed = false, deviceId = '') => {
    let message = `هل أنت متأكد من حذف الكود "${code}"؟`;
    
    if (isUsed) {
      message = `⚠️ تنبيه مهم\n\n` +
                `هذا الكود مفعل على جهاز بالفعل.\n` +
                `الكود: ${code}\n` +
                `الجهاز: ${deviceId || 'غير معروف'}\n\n` +
                `حذف هذا الكود قد يسبب توقف التفعيل على هذا الجهاز.\n` +
                `هل تريد المتابعة بالحذف؟`;
    }

    if (!confirm(message)) return;

    try {
      const data = await api.codes.delete(code);
      utils.showAlert('mainAlert', `✅ ${data.message}`, 'success', 5000);
      await handlers.loadCodes();
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  /**
   * Show code details
   */
  showDetails: async (code) => {
    try {
      const data = await api.codes.getDetails(code);
      const codeData = data.code;
      
      const content = `
        <div class="details-grid">
          <p><strong>الكود:</strong> <span class="code-text">${codeData.code}</span></p>
          <p><strong>الحالة:</strong> ${codeData.used ? '🔒 مفعل' : '✅ متاح'}</p>
          <p><strong>رقم الجهاز:</strong> ${codeData.deviceId || '-'}</p>
          <p><strong>تاريخ التفعيل:</strong> ${utils.formatDate(codeData.activatedAt)}</p>
          <p><strong>تاريخ الإنشاء:</strong> ${utils.formatDate(codeData.createdAt)}</p>
        </div>
      `;
      
      elements.detailsContent.innerHTML = content;
      elements.detailsModal.classList.remove('hidden');
      
    } catch (error) {
      utils.showAlert('mainAlert', `❌ ${error.message}`, 'danger');
    }
  },

  /**
   * Change password
   */
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
      await api.auth.changePassword(currentPassword, newPassword);
      
      utils.showAlert('passwordAlert', '✅ تم تغيير كلمة السر بنجاح', 'success');
      
      setTimeout(() => {
        handlers.hidePasswordModal();
        utils.showAlert('mainAlert', '✅ تم تغيير كلمة السر. سجل الدخول مرة أخرى.', 'success', 5000);
        
        setTimeout(() => {
          handlers.logout();
        }, 2000);
      }, 1500);
      
    } catch (error) {
      utils.showAlert('passwordAlert', `❌ ${error.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  },

  /**
   * Show/hide password modal
   */
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

  /**
   * Hide details modal
   */
  hideDetailsModal: () => {
    elements.detailsModal.classList.add('hidden');
  },

  /**
   * Start auto-refresh timers
   */
  startAutoRefresh: () => {
    handlers.stopAutoRefresh();
    
    state.refreshTimer = setInterval(() => {
      if (state.currentView === 'dashboard' && document.visibilityState === 'visible') {
        handlers.loadCodes();
      }
    }, CONFIG.REFRESH_INTERVAL);
    
    state.statsTimer = setInterval(() => {
      if (state.currentView === 'dashboard') {
        handlers.loadStats();
      }
    }, CONFIG.STATS_REFRESH_INTERVAL);
  },

  /**
   * Stop auto-refresh timers
   */
  stopAutoRefresh: () => {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.statsTimer) {
      clearInterval(state.statsTimer);
      state.statsTimer = null;
    }
  },
};

// Initialization
const init = () => {
  // Cache DOM elements
  const elementIds = [
    'loginView', 'dashboardView',
    'loginForm', 'adminKey', 'loginAlert',
    'mainAlert', 'statsGrid', 'headerStats',
    'loadingState', 'codesTableBody', 'tableContainer', 'emptyState',
    'addCodeForm', 'newCode',
    'refreshBtn', 'logoutBtn', 'changePasswordBtn',
    'passwordModal', 'passwordForm', 'passwordAlert',
    'currentPassword', 'newPassword', 'confirmPassword',
    'closeModalBtn', 'cancelPasswordBtn',
    'detailsModal', 'detailsContent', 'closeDetailsBtn', 'closeDetailsFooterBtn',
    'dbStatus'
  ];

  elementIds.forEach(id => {
    elements[id] = document.getElementById(id);
  });

  // Event listeners
  elements.loginForm?.addEventListener('submit', handlers.login);
  elements.addCodeForm?.addEventListener('submit', handlers.addCode);
  elements.passwordForm?.addEventListener('submit', handlers.changePassword);
  
  elements.logoutBtn?.addEventListener('click', handlers.logout);
  elements.refreshBtn?.addEventListener('click', handlers.loadCodes);
  elements.changePasswordBtn?.addEventListener('click', handlers.showPasswordModal);
  
  elements.closeModalBtn?.addEventListener('click', handlers.hidePasswordModal);
  elements.cancelPasswordBtn?.addEventListener('click', handlers.hidePasswordModal);
  elements.closeDetailsBtn?.addEventListener('click', handlers.hideDetailsModal);
  elements.closeDetailsFooterBtn?.addEventListener('click', handlers.hideDetailsModal);
  elements.codesTableBody?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const code = decodeURIComponent(button.dataset.code || '');
    if (!code) return;

    if (button.dataset.action === 'delete') {
      const isUsed = button.dataset.used === 'true';
      const deviceId = decodeURIComponent(button.dataset.deviceId || '');
      handlers.deleteCode(code, isUsed, deviceId);
      return;
    }

    if (button.dataset.action === 'details') {
      handlers.showDetails(code);
    }
  });

  // Close modals on outside click
  window.addEventListener('click', (e) => {
    if (e.target === elements.passwordModal) {
      handlers.hidePasswordModal();
    }
    if (e.target === elements.detailsModal) {
      handlers.hideDetailsModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      handlers.hidePasswordModal();
      handlers.hideDetailsModal();
    }
  });

  // Focus on load
  elements.adminKey?.focus();

  // Check session on load
  api.auth.getStats()
    .then(() => {
      state.isLoggedIn = true;
      views.switch('dashboard');
      handlers.loadDashboard();
      handlers.startAutoRefresh();
    })
    .catch(() => {
      // Not logged in, stay on login view
    });

  console.log('✅ Admin Dashboard initialized');
};

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
