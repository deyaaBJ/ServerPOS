import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const emptyApproveForm = {
  code: '',
  clientName: '',
  clientPhone: ''
};

const request = async (endpoint, options = {}) => {
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

const formatDate = (value) => {
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

const statusLabel = (status) => ({
  pending: 'معلق',
  approved: 'تم ربط الكود',
  rejected: 'مرفوض',
  completed: 'تم التفعيل',
  deactivated: 'تم إلغاء التفعيل'
}[status] || status || '-');

const statusClass = (status) => ({
  pending: 'badge-primary',
  approved: 'badge-warning',
  rejected: 'badge-danger',
  completed: 'badge-success',
  deactivated: 'badge-dark'
}[status] || 'badge-dark');

function Alert({ alert, onClose }) {
  if (!alert) return null;
  return (
    <div className={`alert alert-${alert.type || 'info'}`}>
      <span>{alert.message}</span>
      <button type="button" className="alert-close" onClick={onClose}>×</button>
    </div>
  );
}

function LoginView({ onLogin }) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!key.trim()) {
      setAlert({ type: 'danger', message: 'الرجاء إدخال كلمة السر' });
      return;
    }

    setLoading(true);
    try {
      await request('/admin/login', { method: 'POST', body: { key } });
      await onLogin();
    } catch (error) {
      setAlert({ type: 'danger', message: error.message });
      setKey('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <form className="panel login-card" onSubmit={submit}>
        <div className="panel-header centered">
          <span className="eyebrow">نظام آمن</span>
          <h1>لوحة تحكم أدمن المتميز</h1>
          <p>إدارة طلبات التفعيل والأكواد المرتبطة</p>
        </div>
        <div className="panel-body">
          <Alert alert={alert} onClose={() => setAlert(null)} />
          <label className="form-group">
            <span>كلمة سر الأدمن</span>
            <input
              className="form-control"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoFocus
              autoComplete="off"
              required
            />
          </label>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'جار التحقق...' : 'تسجيل الدخول'}
          </button>
        </div>
      </form>
    </main>
  );
}

function Stats({ stats }) {
  const rows = [
    ['إجمالي الأكواد', stats.totalCodes],
    ['الأكواد المفعلة', stats.usedCodes],
    ['الأكواد المتاحة', stats.availableCodes],
    ['الأجهزة المفعلة', stats.uniqueDevices],
    ['طلبات معلقة', stats.pendingRequests]
  ];

  return (
    <section className="stats-grid" aria-label="الإحصائيات">
      {rows.map(([label, value]) => (
        <div className="stat-card" key={label}>
          <strong>{Number(value || 0).toLocaleString('ar')}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
  );
}

function RequestsPage({ requests, onDetails }) {
  return (
    <section className="table-section">
      <div className="section-heading">
        <h2>طلبات التفعيل</h2>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>الحالة</th>
              <th>التاريخ والوقت</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((item) => (
              <tr key={item._id}>
                <td><span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></td>
                <td><span className="date-text">{formatDate(item.createdAt)}</span></td>
                <td>
                  <button className="action-btn details-btn" type="button" onClick={() => onDetails('request', item)}>
                    تفاصيل
                  </button>
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr><td colSpan="3" className="empty-cell">لا توجد طلبات تفعيل حاليًا</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActiveCodesPage({ codes, searchTerm, onSearchChange, onDetails }) {
  return (
    <section className="table-section">
      <div className="section-heading">
        <h2>الأكواد المفعلة</h2>
        <label className="table-search">
          <span>بحث باسم العميل</span>
          <input
            className="form-control"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="اسم العميل"
          />
        </label>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>اسم العميل</th>
              <th>الحالة</th>
              <th>تاريخ القبول</th>
              <th>كود الربط</th>
              <th>تاريخ التفعيل</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => {
              const activationRequest = code.requestId || {};
              return (
                <tr key={code._id || code.code}>
                  <td>{activationRequest.clientName || '-'}</td>
                  <td><span className={`badge ${statusClass(activationRequest.status)}`}>{statusLabel(activationRequest.status)}</span></td>
                  <td><span className="date-text">{formatDate(activationRequest.approvedAt)}</span></td>
                  <td><span className="code-text">{code.code}</span></td>
                  <td><span className="date-text">{formatDate(code.activatedAt || activationRequest.completedAt)}</span></td>
                  <td>
                    <button className="action-btn details-btn" type="button" onClick={() => onDetails('code', code)}>
                      تفاصيل
                    </button>
                  </td>
                </tr>
              );
            })}
            {!codes.length && (
              <tr><td colSpan="6" className="empty-cell">لا توجد أكواد مفعلة أو مربوطة حاليًا</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{children || '-'}</strong>
    </div>
  );
}

function RequestDetails({ item, approveForm, setApproveForm, onApprove, onReject, busy }) {
  const canManage = !['completed', 'deactivated'].includes(item.status);
  const previousRequests = Array.isArray(item.previousRequests) ? item.previousRequests : [];

  return (
    <>
      <div className="details-grid">
        <DetailRow label="اسم/معرف الجهاز"><code>{item.deviceId || '-'}</code></DetailRow>
        <DetailRow label="معرف الطلب"><code>{item._id}</code></DetailRow>
        <DetailRow label="الحالة"><span className={`badge ${statusClass(item.status)}`}>{statusLabel(item.status)}</span></DetailRow>
        <DetailRow label="كود الربط">{item.assignedCode ? <span className="code-text">{item.assignedCode}</span> : '-'}</DetailRow>
        <DetailRow label="اسم العميل">{item.clientName || '-'}</DetailRow>
        <DetailRow label="رقم الهاتف">{item.clientPhone || '-'}</DetailRow>
        <DetailRow label="تاريخ الطلب">{formatDate(item.createdAt)}</DetailRow>
        <DetailRow label="تاريخ القبول">{formatDate(item.approvedAt)}</DetailRow>
        <DetailRow label="آخر تحديث">{formatDate(item.updatedAt)}</DetailRow>
        <DetailRow label="عدد تفعيلات نفس الجهاز">{Number(item.deviceUsage?.activationCount || 0).toLocaleString('ar')}</DetailRow>
        <DetailRow label="أكواد نفس الجهاز">
          {item.deviceUsage?.codes?.length ? item.deviceUsage.codes.join(', ') : '-'}
        </DetailRow>
      </div>

      {previousRequests.length > 0 && (
        <section className="history-block">
          <h3>طلبات سابقة لنفس الجهاز</h3>
          {previousRequests.map((previous) => (
            <div className="history-row" key={previous.id}>
              <span>{statusLabel(previous.status)}</span>
              <strong>{previous.assignedCode || '-'}</strong>
              <small>{formatDate(previous.createdAt)}</small>
            </div>
          ))}
        </section>
      )}

      {canManage && (
        <form className="approve-form" onSubmit={(event) => onApprove(event, item._id)}>
          <h3>الموافقة على الطلب</h3>
          <label className="form-group">
            <span>كود الربط</span>
            <input
              className="form-control"
              value={approveForm.code}
              onChange={(event) => setApproveForm((current) => ({ ...current, code: event.target.value }))}
              required
            />
          </label>
          <label className="form-group">
            <span>اسم العميل</span>
            <input
              className="form-control"
              value={approveForm.clientName}
              onChange={(event) => setApproveForm((current) => ({ ...current, clientName: event.target.value }))}
              required
            />
          </label>
          <label className="form-group">
            <span>رقم الهاتف (اختياري)</span>
            <input
              className="form-control"
              value={approveForm.clientPhone}
              onChange={(event) => setApproveForm((current) => ({ ...current, clientPhone: event.target.value }))}
            />
          </label>
          <button className="btn btn-success btn-block" type="submit" disabled={busy}>
            {busy ? 'جار الاعتماد...' : 'موافقة'}
          </button>
        </form>
      )}

      <div className="modal-actions">
        {item.status !== 'completed' && item.status !== 'deactivated' && (
          <button className="btn btn-danger" type="button" onClick={() => onReject(item._id)} disabled={busy}>رفض</button>
        )}
      </div>
    </>
  );
}

function CodeDetails({ item, onDeactivate, busy }) {
  const activationRequest = item.requestId || {};
  const canDeactivate = activationRequest.status === 'completed' && activationRequest._id;
  return (
    <>
      <div className="details-grid">
        <DetailRow label="اسم العميل">{activationRequest.clientName || '-'}</DetailRow>
        <DetailRow label="رقم الهاتف">{activationRequest.clientPhone || '-'}</DetailRow>
        <DetailRow label="كود الربط"><span className="code-text">{item.code}</span></DetailRow>
        <DetailRow label="اسم/معرف الجهاز"><code>{item.deviceId || activationRequest.deviceId || '-'}</code></DetailRow>
        <DetailRow label="الحالة"><span className={`badge ${statusClass(activationRequest.status)}`}>{statusLabel(activationRequest.status)}</span></DetailRow>
        <DetailRow label="تاريخ القبول">{formatDate(activationRequest.approvedAt)}</DetailRow>
        <DetailRow label="تاريخ التفعيل">{formatDate(item.activatedAt || activationRequest.completedAt)}</DetailRow>
        <DetailRow label="آخر تحقق">{formatDate(item.lastValidatedAt)}</DetailRow>
      </div>

      {canDeactivate && (
        <div className="modal-actions">
          <button className="btn btn-danger" type="button" onClick={() => onDeactivate(activationRequest._id)} disabled={busy}>
            إلغاء التفعيل
          </button>
        </div>
      )}
    </>
  );
}

function DetailsModal(props) {
  const { modal, onClose } = props;
  if (!modal) return null;

  return (
    <div className="modal" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>{modal.type === 'request' ? 'تفاصيل طلب التفعيل' : 'تفاصيل الكود'}</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {modal.type === 'request'
            ? <RequestDetails item={modal.item} {...props} />
            : <CodeDetails item={modal.item} {...props} />}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [page, setPage] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modal, setModal] = useState(null);
  const [approveForm, setApproveForm] = useState(emptyApproveForm);
  const [activeCodeSearch, setActiveCodeSearch] = useState('');

  const activeCodes = useMemo(() => codes.filter((code) => {
    const linkedRequest = code.requestId;
    return linkedRequest?.clientName && ['approved', 'completed'].includes(linkedRequest.status);
  }), [codes]);

  const filteredActiveCodes = useMemo(() => {
    const search = activeCodeSearch.trim().toLowerCase();
    if (!search) return activeCodes;

    return activeCodes.filter((code) => (
      code.requestId?.clientName || ''
    ).toLowerCase().includes(search));
  }, [activeCodes, activeCodeSearch]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statsData, requestsData, codesData] = await Promise.all([
        request('/admin/stats'),
        request('/admin/activation-requests'),
        request('/codes/')
      ]);
      setStats(statsData.stats || {});
      setRequests(requestsData.requests || []);
      setCodes(codesData.codes || []);
    } catch (error) {
      setAlert({ type: 'danger', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openDetails = (type, item) => {
    setModal({ type, item });
    setApproveForm({
      code: item.assignedCode || item.code || '',
      clientName: item.clientName || item.requestId?.clientName || '',
      clientPhone: item.clientPhone || item.requestId?.clientPhone || ''
    });
  };

  const approve = async (event, requestId) => {
    event.preventDefault();
    if (!approveForm.clientName.trim()) {
      setAlert({ type: 'warning', message: 'اسم العميل مطلوب ولا يمكن تركه فارغًا' });
      return;
    }

    setBusy(true);
    try {
      await request(`/admin/activation-requests/${requestId}/approve`, {
        method: 'POST',
        body: approveForm
      });
      setAlert({ type: 'success', message: 'تمت الموافقة وربط الكود بنجاح' });
      setModal(null);
      await loadAll();
      setPage('active');
    } catch (error) {
      setAlert({ type: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const reject = async (requestId) => {
    const reason = window.prompt('سبب الرفض (اختياري):');
    if (reason === null) return;
    setBusy(true);
    try {
      await request(`/admin/activation-requests/${requestId}/reject`, {
        method: 'POST',
        body: { reason }
      });
      setAlert({ type: 'success', message: 'تم رفض الطلب' });
      setModal(null);
      await loadAll();
    } catch (error) {
      setAlert({ type: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (requestId) => {
    const reason = window.prompt('سبب إلغاء التفعيل (اختياري):');
    if (reason === null) return;
    setBusy(true);
    try {
      await request(`/admin/activation-requests/${requestId}/deactivate`, {
        method: 'POST',
        body: { reason }
      });
      setAlert({ type: 'success', message: 'تم إلغاء التفعيل بنجاح' });
      setModal(null);
      await loadAll();
      setPage('active');
    } catch (error) {
      setAlert({ type: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await request('/admin/logout', { method: 'POST' }).catch(() => {});
    onLogout();
  };

  return (
    <main className="dashboard-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">لوحة الإدارة</span>
            <h1>إدارة التفعيل</h1>
            <p>البيانات تُحدّث يدويًا عند الضغط على تحديث</p>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" type="button" onClick={loadAll} disabled={loading}>تحديث</button>
            <button className="btn btn-danger" type="button" onClick={logout}>تسجيل الخروج</button>
          </div>
        </div>

        <div className="panel-body">
          <Alert alert={alert} onClose={() => setAlert(null)} />
          <Stats stats={stats} />

          <nav className="tabs" aria-label="الصفحات">
            <button className={page === 'requests' ? 'active' : ''} type="button" onClick={() => setPage('requests')}>
              الطلبات
            </button>
            <button className={page === 'active' ? 'active' : ''} type="button" onClick={() => setPage('active')}>
              الأكواد المفعلة
            </button>
          </nav>

          {loading
            ? <div className="loading">جاري تحميل البيانات...</div>
            : page === 'requests'
              ? <RequestsPage requests={requests} onDetails={openDetails} />
              : (
                <ActiveCodesPage
                  codes={filteredActiveCodes}
                  searchTerm={activeCodeSearch}
                  onSearchChange={setActiveCodeSearch}
                  onDetails={openDetails}
                />
              )}
        </div>
      </section>

      <DetailsModal
        modal={modal}
        approveForm={approveForm}
        setApproveForm={setApproveForm}
        onApprove={approve}
        onReject={reject}
        onDeactivate={deactivate}
        onClose={() => setModal(null)}
        busy={busy}
      />
    </main>
  );
}

function App() {
  const [checked, setChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const verifySession = async () => {
    await request('/admin/stats');
    setLoggedIn(true);
  };

  useEffect(() => {
    verifySession()
      .catch(() => setLoggedIn(false))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return <div className="boot-screen">جاري التحميل...</div>;
  }

  return loggedIn
    ? <Dashboard onLogout={() => setLoggedIn(false)} />
    : <LoginView onLogin={verifySession} />;
}

createRoot(document.getElementById('root')).render(<App />);
