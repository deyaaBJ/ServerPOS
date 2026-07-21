import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { request } from './api';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import RequestsPage from './pages/RequestsPage';
import ActiveCodesPage from './pages/ActiveCodesPage';
import ActivationLogsPage from './pages/ActivationLogsPage';

function RequireAuth({ loggedIn, children }) {
  if (!loggedIn) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [checked, setChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const verifySession = async () => {
    try {
      await request('/admin/stats');
      setLoggedIn(true);
    } catch (error) {
      setLoggedIn(false);
      throw error;
    }
  };

  useEffect(() => {
    verifySession()
      .catch(() => setLoggedIn(false))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return <div className="boot-screen">جاري التحميل...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={loggedIn ? <Navigate to="/requests" replace /> : <LoginPage onLogin={() => setLoggedIn(true)} />}
        />
        <Route
          path="/"
          element={(
            <RequireAuth loggedIn={loggedIn}>
              <DashboardLayout onLogout={() => setLoggedIn(false)} />
            </RequireAuth>
          )}
        >
          <Route index element={<Navigate to="/requests" replace />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="active-codes" element={<ActiveCodesPage />} />
          <Route path="activation-logs" element={<ActivationLogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/requests" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
