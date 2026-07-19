import React from 'react';
import { formatDate, statusClass, statusLabel } from '../api';

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

export default function DetailsModal(props) {
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