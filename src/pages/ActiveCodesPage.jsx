import React, { useMemo, useState } from 'react';
import { formatDate, statusClass, statusLabel } from '../api';
import { useDashboardData } from '../layouts/DashboardLayout';

export default function ActiveCodesPage() {
  const { codes, openDetails } = useDashboardData();
  const [searchTerm, setSearchTerm] = useState('');

  const activeCodes = useMemo(() => codes.filter((code) => {
    const linkedRequest = code.requestId;
    return linkedRequest?.clientName && ['approved', 'completed'].includes(linkedRequest.status);
  }), [codes]);

  const filteredActiveCodes = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return activeCodes;

    return activeCodes.filter((code) => (
      code.requestId?.clientName || ''
    ).toLowerCase().includes(search));
  }, [activeCodes, searchTerm]);

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
            onChange={(event) => setSearchTerm(event.target.value)}
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
            {filteredActiveCodes.map((code) => {
              const activationRequest = code.requestId || {};
              return (
                <tr key={code._id || code.code}>
                  <td>{activationRequest.clientName || '-'}</td>
                  <td><span className={`badge ${statusClass(activationRequest.status)}`}>{statusLabel(activationRequest.status)}</span></td>
                  <td><span className="date-text">{formatDate(activationRequest.approvedAt)}</span></td>
                  <td><span className="code-text">{code.code}</span></td>
                  <td><span className="date-text">{formatDate(code.activatedAt || activationRequest.completedAt)}</span></td>
                  <td>
                    <button className="action-btn details-btn" type="button" onClick={() => openDetails('code', code)}>
                      تفاصيل
                    </button>
                  </td>
                </tr>
              );
            })}
            {!filteredActiveCodes.length && (
              <tr><td colSpan="6" className="empty-cell">لا توجد أكواد مفعلة أو مربوطة حاليًا</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}