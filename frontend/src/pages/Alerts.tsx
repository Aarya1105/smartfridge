import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Thermometer,
  Sparkles,
  Send,
  RefreshCw,
  Clock,
  Layers
} from 'lucide-react';
import { alertsApi } from '../services/api';
import { AlertItem } from '../types';
import { useNotification } from '../context/NotificationContext';

export const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [evaluating, setEvaluating] = useState(false);
  const { showToast } = useNotification();

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const data = await alertsApi.getAll({ alert_type: filterType || undefined });
      setAlerts(data);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [filterType]);

  const handleMarkRead = async (id: number) => {
    try {
      await alertsApi.markRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    } catch (err) {
      showToast('error', 'Failed to update alert');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await alertsApi.markAllRead();
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
      showToast('success', 'All alerts marked as read');
    } catch (err) {
      showToast('error', 'Failed to update alerts');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await alertsApi.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      showToast('info', 'Alert removed');
    } catch (err) {
      showToast('error', 'Failed to delete alert');
    }
  };

  const handleTriggerEvaluation = async () => {
    setEvaluating(true);
    try {
      const res = await alertsApi.evaluate();
      showToast('success', res.message, 'Rules Evaluated');
      loadAlerts();
    } catch (err) {
      showToast('error', 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleTestAlert = async () => {
    try {
      await alertsApi.testNotification('all');
      showToast('success', 'Test alert dispatched via active channels (Email, Web Push, SMS)', 'Notification Sent');
    } catch (err) {
      showToast('error', 'Failed to dispatch test notification');
    }
  };

  const getAlertIcon = (type: string, severity: string) => {
    switch (type) {
      case 'Expired / Remove Now':
        return <XCircle className="w-5 h-5 text-rose-600" />;
      case 'Expiring Soon':
        return <Clock className="w-5 h-5 text-amber-600" />;
      case 'Compatibility Warning':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'Temperature Warning':
        return <Thermometer className="w-5 h-5 text-purple-600" />;
      case 'Item Not Seen':
        return <HelpCircle className="w-5 h-5 text-blue-600" />;
      default:
        return <Sparkles className="w-5 h-5 text-emerald-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-emerald-600" />
            Alerts & Notifications
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time warnings: expiration deadlines, ethylene conflicts, and fridge door temperature spikes
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleTriggerEvaluation}
            disabled={evaluating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${evaluating ? 'animate-spin' : ''}`} />
            Evaluate Rules Now
          </button>

          <button
            onClick={handleTestAlert}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Send Test Alert
          </button>

          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
          >
            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
            Mark All Read
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { label: 'All Alerts', val: '' },
          { label: 'Expiring Soon', val: 'Expiring Soon' },
          { label: 'Expired / Remove', val: 'Expired / Remove Now' },
          { label: 'Compatibility', val: 'Compatibility Warning' },
          { label: 'Temperature', val: 'Temperature Warning' },
          { label: 'Audit Missing', val: 'Item Not Seen' }
        ].map((f) => (
          <button
            key={f.val}
            onClick={() => setFilterType(f.val)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              filterType === f.val
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center text-slate-400">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No active alerts found</p>
            <p className="text-xs text-slate-400 mt-1">Your refrigerator foods and sensors are in healthy balance!</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
                alert.is_read
                  ? 'bg-white border-slate-200/80 text-slate-700 opacity-80'
                  : 'bg-white border-emerald-300 ring-1 ring-emerald-500/20 text-slate-900 shadow-soft'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex-shrink-0 mt-0.5">
                  {getAlertIcon(alert.alert_type, alert.severity)}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      {alert.title}
                    </h3>
                    {!alert.is_read && (
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {alert.alert_type}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {alert.message}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                    <span>{new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(alert.created_at).toLocaleDateString()}</span>
                    {alert.channel_sent && (
                      <span className="capitalize">Dispatched: {alert.channel_sent}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 self-end sm:self-center">
                {!alert.is_read && (
                  <button
                    onClick={() => handleMarkRead(alert.id)}
                    className="p-1.5 rounded-lg border border-slate-200 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold"
                    title="Mark as read"
                  >
                    Mark Read
                  </button>
                )}
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Dismiss alert"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
