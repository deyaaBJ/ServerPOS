import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { request } from '../api';
import Alert from '../components/Alert';
import Stats from '../components/Stats';
import DetailsModal from '../components/DetailsModal';

const emptyApproveForm = {
  code: '',
  clientName: '',
  clientPhone: ''
};

export default function DashboardLayout({ onLogout }) {
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modal, setModal] = useState(null);
  const [approveForm, setApproveForm] = useState(emptyApproveForm);

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

          {/* روابط حقيقية بدل أزرار تبديل تبويب - كل صفحة إلها مسار مستقل */}
          <nav className="tabs" aria-label="الصفحات">
            <NavLink to="/requests" className={({ isActive }) => (isActive ? 'active' : '')}>
              الطلبات
            </NavLink>
            <NavLink to="/active-codes" className={({ isActive }) => (isActive ? 'active' : '')}>
              الأكواد المفعلة
            </NavLink>
          </nav>

          {loading
            ? <div className="loading">جاري تحميل البيانات...</div>
            : <Outlet context={{ requests, codes, openDetails }} />}
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

export function useDashboardData() {
  return useOutletContext();
}