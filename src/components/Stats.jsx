import React from 'react';

export default function Stats({ stats }) {
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