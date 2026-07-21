import React, { useState } from 'react';
import { formatDate } from '../api';
import { useDashboardData } from '../layouts/DashboardLayout';
import { request } from '../api';

const activationTypeLabel = (log) => {
  if (log?.metadata?.directActivation) return 'تفعيل مباشر';
  if (log?.metadata?.source === 'device-status') return 'تفعيل عبر الكود';
  return 'تفعيل من طلب';
};

export default function ActivationLogsPage() {
  const { openDetails } = useDashboardData();
  const [searchName, setSearchName] = useState('');
  const [submittedName, setSubmittedName] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (event) => {
    event.preventDefault();
    const exactName = searchName.trim();
    if (!exactName) {
      setError('الرجاء إدخال اسم العميل كاملًا قبل البحث');
      setLogs([]);
      setSubmittedName('');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await request(`/admin/activation-logs?clientName=${encodeURIComponent(exactName)}`);
      setLogs(response.logs || []);
      setSubmittedName(exactName);
    } catch (fetchError) {
      setError(fetchError.message);
      setLogs([]);
      setSubmittedName(exactName);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="table-section">
      <div className="section-heading">
        <h2>سجل التفعيل</h2>
        <form className="table-search" onSubmit={handleSearch}>
          <span>بحث بالاسم الكامل للعميل</span>
          <div className="search-row">
            <input
              className="form-control"
              type="search"
              value={searchName}
              onChange={(event) => setSearchName(event.target.value)}
              placeholder="اكتب اسم العميل كما هو"
            />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'جاري البحث...' : 'بحث'}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="alert alert-danger"><span>{error}</span></div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>اسم العميل</th>
              <th>اسم/معرف الجهاز</th>
              <th>نوع التفعيل</th>
              <th>الكود</th>
              <th>الوقت</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {!submittedName ? (
              <tr>
                <td colSpan="6" className="empty-cell">لن تظهر أي سجلات قبل تنفيذ بحث باسم العميل بالكامل</td>
              </tr>
            ) : logs.length ? (
              logs.map((log) => {
                const activationRequest = log.requestId || {};
                return (
                  <tr key={log._id}>
                    <td>{activationRequest.clientName || submittedName || '-'}</td>
                    <td><code>{activationRequest.deviceId || log.deviceId || '-'}</code></td>
                    <td>{activationTypeLabel(log)}</td>
                    <td><span className="code-text">{log.code || activationRequest.assignedCode || '-'}</span></td>
                    <td><span className="date-text">{formatDate(log.createdAt)}</span></td>
                    <td>
                      <button
                        className="action-btn details-btn"
                        type="button"
                        onClick={() => openDetails('code', { ...log, requestId: activationRequest })}
                      >
                        تفاصيل
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="empty-cell">
                  لا توجد سجلات مطابقة للاسم المدخل
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
