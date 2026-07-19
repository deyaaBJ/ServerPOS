import React from 'react';

export default function Alert({ alert, onClose }) {
  if (!alert) return null;
  return (
    <div className={`alert alert-${alert.type || 'info'}`}>
      <span>{alert.message}</span>
      <button type="button" className="alert-close" onClick={onClose}>×</button>
    </div>
  );
}