import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Bell,
  Clock,
  Phone,
  Mail,
  Smartphone,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Send,
  Shield,
  Zap,
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { settingsApi } from '../services/api';
import { subscribeToWebPush } from '../services/pwa';
import { useNotification } from '../context/NotificationContext';
import { NotificationLog } from '../types';

export const Settings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  // Testing states
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);

  // Form fields: Profile & Contact
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Channel Master Toggles
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [hasPushSubscription, setHasPushSubscription] = useState(false);

  // Alert Category Toggles
  const [emailForExpiring, setEmailForExpiring] = useState(true);
  const [emailForExpired, setEmailForExpired] = useState(true);
  const [emailDailyDigest, setEmailDailyDigest] = useState(true);

  const [pushForExpiring, setPushForExpiring] = useState(true);
  const [pushForExpired, setPushForExpired] = useState(true);
  const [pushForTemperature, setPushForTemperature] = useState(true);

  const [smsForCritical, setSmsForCritical] = useState(false);

  // Rules & Scheduling
  const [alertLeadDays, setAlertLeadDays] = useState(2);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [auditDay, setAuditDay] = useState('Sunday');
  const [auditTime, setAuditTime] = useState('10:00');

  // Zones & Logs
  const [zones, setZones] = useState<any[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);

  const { showToast } = useNotification();

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsApi.get();
      if (data.user) {
        setFullName(data.user.full_name || '');
        setEmail(data.user.email || '');
        setPhoneNumber(data.user.phone_number || '');

        setEmailEnabled(data.user.email_notifications_enabled ?? true);
        setPushEnabled(data.user.push_notifications_enabled ?? true);
        setSmsEnabled(data.user.sms_notifications_enabled ?? false);
        setHasPushSubscription(!!data.user.has_push_subscription);

        setEmailForExpiring(data.user.email_for_expiring ?? true);
        setEmailForExpired(data.user.email_for_expired ?? true);
        setEmailDailyDigest(data.user.email_daily_digest ?? true);

        pushForExpiring !== undefined && setPushForExpiring(data.user.push_for_expiring ?? true);
        pushForExpired !== undefined && setPushForExpired(data.user.push_for_expired ?? true);
        pushForTemperature !== undefined && setPushForTemperature(data.user.push_for_temperature ?? true);

        setSmsForCritical(data.user.sms_for_critical ?? false);

        setAlertLeadDays(data.user.alert_lead_days || 2);
        setQuietHoursStart(data.user.quiet_hours_start || '22:00');
        setQuietHoursEnd(data.user.quiet_hours_end || '07:00');
        setAuditDay(data.user.audit_day || 'Sunday');
        setAuditTime(data.user.audit_time || '10:00');
      }
      if (data.zones) {
        setZones(data.zones);
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to load user settings');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLogsLoading(true);
      const data = await settingsApi.getNotificationLogs(20);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load notification logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsApi.update({
        full_name: fullName,
        phone_number: phoneNumber,
        email_notifications_enabled: emailEnabled,
        push_notifications_enabled: pushEnabled,
        sms_notifications_enabled: smsEnabled,
        email_for_expiring: emailForExpiring,
        email_for_expired: emailForExpired,
        email_daily_digest: emailDailyDigest,
        push_for_expiring: pushForExpiring,
        push_for_expired: pushForExpired,
        push_for_temperature: pushForTemperature,
        sms_for_critical: smsForCritical,
        alert_lead_days: alertLeadDays,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
        audit_day: auditDay,
        audit_time: auditTime
      });
      showToast('success', 'Preferences and notification settings saved successfully!', 'Settings Saved');
      await loadLogs();
    } catch (err) {
      showToast('error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      const res = await subscribeToWebPush();
      if (res.success) {
        setHasPushSubscription(true);
        setPushEnabled(true);
        showToast('success', res.message, 'PWA Push Enabled');
        await loadSettings();
        await loadLogs();
      } else {
        showToast('warning', res.message, 'Push Permission Notice');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to enable Web Push');
    } finally {
      setEnablingPush(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await settingsApi.testEmail(email);
      showToast('success', `Test HTML email sent to ${email}`, 'Email Sent');
      await loadLogs();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to send test email';
      showToast('error', msg, 'Email Delivery Error');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    try {
      await settingsApi.testPush();
      showToast('success', 'Test push notification dispatched to your browser/phone!', 'Web Push Dispatched');
      await loadLogs();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Push notification failed. Ensure notifications are enabled.';
      showToast('error', msg, 'Push Error');
    } finally {
      setTestingPush(false);
    }
  };

  const handleTestSms = async () => {
    if (!phoneNumber) {
      showToast('warning', 'Please enter a phone number first');
      return;
    }
    setTestingSms(true);
    try {
      await settingsApi.testSms(phoneNumber);
      showToast('success', `Test SMS dispatched to ${phoneNumber}`, 'SMS Dispatched');
      await loadLogs();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to send test SMS';
      showToast('error', msg, 'SMS Error');
    } finally {
      setTestingSms(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-emerald-600" />
          Settings & Notifications
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Configure pluggable email, PWA phone push alerts, optional SMS, lead times, and quiet hours
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* =================================================================== */}
        {/* 1. PRIMARY: EMAIL NOTIFICATIONS (SMTP / Resend / Brevo)             */}
        {/* =================================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Email Notifications</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                    Primary Channel
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Clean HTML emails with food thumbnails, expiry dates, and instant "Mark as used" action links
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testingEmail || !emailEnabled}
                className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {testingEmail ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Recipient Email Address
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-slate-50 text-slate-600 cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Default: SMTP Gmail App Password or API provider (Resend / Brevo) configured in .env
              </span>
            </div>

            <div className="space-y-2 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/60">
              <span className="text-xs font-bold text-slate-700 block mb-1">
                Email Alert Subscriptions:
              </span>
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailForExpiring}
                  onChange={(e) => setEmailForExpiring(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Expiring Soon Warnings (based on lead time)</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailForExpired}
                  onChange={(e) => setEmailForExpired(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Expired / Spoilage Critical Alerts (Instant dispatch)</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailDailyDigest}
                  onChange={(e) => setEmailDailyDigest(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Daily Digest Email (Every morning at 8:00 AM)</span>
              </label>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 2. PHONE: PWA WEB PUSH (VAPID Protocol)                             */}
        {/* =================================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">Phone Alerts (PWA Web Push)</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase tracking-wider">
                    VAPID Protocol
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Instant mobile notifications to your home-screen PWA or phone browser without native app store install
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
              <button
                type="button"
                onClick={handleTestPush}
                disabled={testingPush || !pushEnabled || !hasPushSubscription}
                className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Bell className="w-3 h-3" />
                {testingPush ? 'Sending...' : 'Send Test Push'}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Device Push Subscription:</span>
                {hasPushSubscription ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" /> Active & Registered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <AlertCircle className="w-3 h-3" /> Not Registered Yet
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Click below to request browser permission and register this device's Service Worker with VAPID keys.
              </p>
            </div>

            <button
              type="button"
              disabled={enablingPush}
              onClick={handleEnablePush}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-auto shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {enablingPush ? 'Enabling...' : hasPushSubscription ? 'Re-register Phone Notifications' : 'Enable Notifications'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer bg-white">
              <input
                type="checkbox"
                checked={pushForExpiring}
                onChange={(e) => setPushForExpiring(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Expiring Soon Alerts</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer bg-white">
              <input
                type="checkbox"
                checked={pushForExpired}
                onChange={(e) => setPushForExpired(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Expired Critical Alerts</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 cursor-pointer bg-white">
              <input
                type="checkbox"
                checked={pushForTemperature}
                onChange={(e) => setPushForTemperature(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Door Ajar / Temp Spikes</span>
            </label>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. OPTIONAL: SMS NOTIFICATIONS (Twilio / Fast2SMS)                  */}
        {/* =================================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">SMS Alerts (Twilio / Fast2SMS)</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wider">
                    Optional (Disabled by default)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Concise text messages (&lt;160 characters) with configurable DLT template ID support
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
              <button
                type="button"
                onClick={handleTestSms}
                disabled={testingSms || !smsEnabled}
                className="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {testingSms ? 'Sending...' : 'Send Test SMS'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Phone Number (E.164 format)
              </label>
              <input
                type="tel"
                placeholder="+1 555 123 4567 or +91 9876543210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Requires TWILIO_ACCOUNT_SID or FAST2SMS_API_KEY in .env
              </span>
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer p-3 rounded-xl border border-slate-200 bg-slate-50/50 w-full">
                <input
                  type="checkbox"
                  checked={smsForCritical}
                  onChange={(e) => setSmsForCritical(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Critical Alerts Only (Severe spoilage &amp; extreme temperature spikes)</span>
              </label>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 4. RULES, QUIET HOURS & AUDIT SCHEDULE                              */}
        {/* =================================================================== */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft space-y-4">
          <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            Alert Lead Times & Quiet Hours
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Expiration Lead Time
              </label>
              <select
                value={alertLeadDays}
                onChange={(e) => setAlertLeadDays(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value={1}>1 Day Before Expiry</option>
                <option value={2}>2 Days Before Expiry (Recommended)</option>
                <option value={3}>3 Days Before Expiry</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Quiet Hours Start
              </label>
              <input
                type="time"
                value={quietHoursStart}
                onChange={(e) => setQuietHoursStart(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Quiet Hours End
              </label>
              <input
                type="time"
                value={quietHoursEnd}
                onChange={(e) => setQuietHoursEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Weekly Fridge Audit Day
              </label>
              <select
                value={auditDay}
                onChange={(e) => setAuditDay(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Audit Reminder Time
              </label>
              <input
                type="time"
                value={auditTime}
                onChange={(e) => setAuditTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-7 py-3 rounded-xl shadow-md shadow-emerald-500/20 transition-all active:scale-95"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings & Preferences'}
          </button>
        </div>
      </form>

      {/* =================================================================== */}
      {/* 5. NOTIFICATION LOGS (notifications_log table)                       */}
      {/* =================================================================== */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              Notification Dispatch History &amp; Retry Logs
            </h2>
            <p className="text-xs text-slate-500">
              Audit log of all attempted notifications with retry counts (up to 3x) and delivery status
            </p>
          </div>

          <button
            type="button"
            onClick={loadLogs}
            disabled={logsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
            Refresh Logs
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No notification attempts recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Title / Message</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Retries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {logs.map((log) => {
                  const isSent = log.status === 'sent';
                  const dateStr = new Date(log.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {dateStr}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                          log.channel === 'email'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : log.channel === 'web_push'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {log.channel === 'email' && <Mail className="w-2.5 h-2.5" />}
                          {log.channel === 'web_push' && <Smartphone className="w-2.5 h-2.5" />}
                          {log.channel === 'sms' && <MessageSquare className="w-2.5 h-2.5" />}
                          {log.channel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {log.provider || 'default'}
                      </td>
                      <td className="py-2.5 px-3 max-w-[280px]">
                        <div className="font-semibold text-slate-800 truncate">{log.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">{log.message}</div>
                        {log.error_message && (
                          <div className="text-[10px] text-rose-500 truncate font-mono mt-0.5">
                            Error: {log.error_message}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          isSent ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isSent ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">
                        {log.attempts}/3
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
