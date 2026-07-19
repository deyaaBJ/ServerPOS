import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../api';
import Alert from '../components/Alert';

export default function LoginPage({ onLogin }) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    if (!key.trim()) {
      setAlert({ type: 'danger', message: 'الرجاء إدخال كلمة السر' });
      return;
    }

    setLoading(true);
    try {
      await request('/admin/login', { method: 'POST', body: { key } });
      onLogin();
      navigate('/requests', { replace: true });
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