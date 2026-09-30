import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Zones } from './pages/Zones';
import { FoodManagement } from './pages/FoodManagement';
import { AddFood } from './pages/AddFood';
import { WeeklyAudit } from './pages/WeeklyAudit';
import { Alerts } from './pages/Alerts';
import { History } from './pages/History';
import { DatasetReview } from './pages/DatasetReview';
import { Settings } from './pages/Settings';
import { alertsApi } from './services/api';

const AppContent: React.FC = () => {
  const [unreadAlerts, setUnreadAlerts] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const fetchUnreadAlerts = async () => {
    try {
      const all = await alertsApi.getAll({ is_read: false });
      setUnreadAlerts(all.length);
    } catch (err) {
      // Fallback
    }
  };

  useEffect(() => {
    fetchUnreadAlerts();
    const interval = setInterval(fetchUnreadAlerts, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        unreadAlertsCount={unreadAlerts}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          unreadAlertsCount={unreadAlerts}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/foods" element={<FoodManagement />} />
            <Route path="/add-food" element={<AddFood />} />
            <Route path="/audit" element={<WeeklyAudit />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/history" element={<History />} />
            <Route path="/dataset" element={<DatasetReview />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
