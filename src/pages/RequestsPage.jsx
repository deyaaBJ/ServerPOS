import React from 'react';
import { formatDate, statusClass, statusLabel } from '../api';
import { useDashboardData } from '../layouts/DashboardLayout';

export default function RequestsPage() {
  const { requests, openDetails } = useDashboardData();

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
                  <button className="action-btn details-btn" type="button" onClick={() => openDetails('request', item)}>
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