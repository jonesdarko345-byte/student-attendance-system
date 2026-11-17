import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { GPS_ATTENDANCE_ENABLED } from '../utils/geofence';
import { AuditLogPanel, isSensitiveAuditLog } from '../components/AuditLogPanel';
import { AuthorizedPersonnelPanel } from '../components/AuthorizedPersonnelPanel';
import { AutoLoggingSettingsPanel } from '../components/AutoLoggingSettingsPanel';
import { activeFirestoreDatabaseId } from '../lib/firebase';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Sliders,
  Database,
  Activity,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Download,
  Upload,
  Wifi,
  CalendarDays,
  ArrowRight,
  MapPin,
  FileJson,
  Loader2,
  Lock
} from 'lucide-react';

export const HodAdmin: React.FC = () => {
  const {
    verifiedRole,
    hodAdminTab,
    setHodAdminTab,
    auditLogs,
    authorizedUsers,
    students,
    courses,
    timetable,
    attendanceRecords,
    cancelledClasses,
    geofenceSettings,
    isCloudConnected,
    isSyncing,
    cloudSyncError,
    forceSyncCloudDatabase,
    pingDatabaseLatency,
    exportDatabaseJSON,
    importDatabaseJSON,
    loadOfficialL200Timetable
  } = useApp();

  const [auditSensitiveOnly, setAuditSensitiveOnly] = useState<boolean>(false);

  // Database Diagnostics Console state
  const [diagStatus, setDiagStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [latencyResult, setLatencyResult] = useState<{ connected: boolean; latencyMs: number } | null>(
    null
  );
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [confirmOverwriteL200, setConfirmOverwriteL200] = useState<boolean>(false);
  const [isLoadingL200, setIsLoadingL200] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const metrics = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const logsToday = auditLogs.filter(
      (log) => new Date(log.timestamp).getTime() >= startOfTodayMs
    ).length;

    const sensitiveLogs = auditLogs.filter((log) => isSensitiveAuditLog(log));
    const declinedUsers = authorizedUsers.filter((u) => u.status === 'declined');
    const pendingUsers = authorizedUsers.filter((u) => u.status === 'pending');
    const activeUsers = authorizedUsers.filter((u) => !u.status || u.status === 'active');

    return {
      logsToday,
      totalLogs: auditLogs.length,
      sensitiveLogs,
      declinedUsers,
      pendingUsers,
      activeUsers
    };
  }, [auditLogs, authorizedUsers]);

  // Hard security guard in UI alongside Firestore & AppContext guards
  if (verifiedRole !== 'hod') {
    return null;
  }

  const handlePing = async () => {
    setIsPinging(true);
    setDiagStatus(null);
    try {
      const res = await pingDatabaseLatency();
      setLatencyResult(res);
      setDiagStatus({
        type: res.connected ? 'success' : 'error',
        message: res.connected
          ? `Firestore Cloud reachable in ${res.latencyMs} ms.`
          : 'Could not reach Firestore server within timeout window.'
      });
    } catch (err) {
      setDiagStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Ping failed.'
      });
    } finally {
      setIsPinging(false);
    }
  };

  const handleForceSync = async () => {
    setDiagStatus(null);
    try {
      const res = await forceSyncCloudDatabase();
      if (res.success) {
        setDiagStatus({
          type: 'success',
          message: `Cloud synchronization completed (${res.count} student records verified).`
        });
      } else {
        setDiagStatus({
          type: 'error',
          message: res.error || 'Cloud sync failed.'
        });
      }
    } catch (err) {
      setDiagStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Sync failed.'
      });
    }
  };

  const handleExportBackup = () => {
    const json = exportDatabaseJSON();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uenr-department-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDiagStatus({
      type: 'success',
      message: 'Departmental JSON snapshot downloaded to your device.'
    });
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setDiagStatus(null);
    try {
      const text = await file.text();
      const res = await importDatabaseJSON(text);
      if (res.success) {
        setDiagStatus({
          type: 'success',
          message: `Backup restored cleanly (${res.count} records imported to Cloud).`
        });
      } else {
        setDiagStatus({
          type: 'error',
          message: res.error || 'Backup file could not be parsed.'
        });
      }
    } catch (err) {
      setDiagStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Restore failed.'
      });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadL200Timetable = async (overwrite: boolean) => {
    setIsLoadingL200(true);
    setDiagStatus(null);
    try {
      const res = await loadOfficialL200Timetable(overwrite);
      setConfirmOverwriteL200(false);
      setDiagStatus({
        type: res.success ? 'success' : 'error',
        message: res.success
          ? `Official L200 Timetable synchronized (${res.coursesCount} courses, ${res.slotsCount} weekly slots).`
          : 'Failed to load official L200 timetable.'
      });
    } catch (err) {
      setDiagStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load timetable.'
      });
    } finally {
      setIsLoadingL200(false);
    }
  };

  const recentSensitiveLogs = metrics.sensitiveLogs.slice(0, 3);
  const totalGovernanceAlerts =
    metrics.declinedUsers.length +
    metrics.pendingUsers.length +
    (metrics.sensitiveLogs.length > 0 ? 1 : 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Executive HOD Governance Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#0b2942] to-[#003b5c] text-white p-6 sm:p-8 shadow-xl border border-slate-700/60">
        <div className="absolute -right-12 -top-12 w-60 h-60 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-12 -bottom-12 w-52 h-52 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-200 text-[11px] font-black uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-purple-300" />
              HOD Exclusive · Oversight &amp; Activity Logs
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Department Governance Console
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Dedicated Head of Department command center for auditing staff actions, reviewing security alerts, managing Lecturer &amp; Class Rep approvals, and supervising system diagnostics. Completely isolated from Lecturer and Class Rep portals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3.5 py-2 rounded-2xl bg-black/30 border border-white/15 text-xs flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isCloudConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <div>
                <div className="font-bold text-white leading-tight">
                  {isSyncing ? 'Syncing Cloud...' : isCloudConnected ? 'Firestore Live' : 'Offline Cache'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
                  DB: {activeFirestoreDatabaseId.slice(0, 18)}...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Sensitive Governance Alerts */}
      {totalGovernanceAlerts > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {metrics.declinedUsers.length > 0 && (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    {metrics.declinedUsers.length} Staff Role Declined / Mismatch
                  </div>
                  <p className="text-xs text-rose-900 dark:text-rose-200 mt-1 truncate">
                    {metrics.declinedUsers.map((u) => u.name).join(', ')}
                  </p>
                  {metrics.declinedUsers[0]?.declinedNote && (
                    <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-0.5 line-clamp-1">
                      &ldquo;{metrics.declinedUsers[0].declinedNote}&rdquo;
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHodAdminTab('authorized')}
                className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:underline cursor-pointer"
              >
                <span>Review in Authorized Staff</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {metrics.pendingUsers.length > 0 && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {metrics.pendingUsers.length} Pending Acceptance
                  </div>
                  <p className="text-xs text-amber-900 dark:text-amber-200 mt-1 truncate">
                    {metrics.pendingUsers.map((u) => u.name).join(', ')}
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                    Awaiting Google Sign-In confirmation on portal gate.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHodAdminTab('authorized')}
                className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
              >
                <span>Inspect Pending Approvals</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {recentSensitiveLogs.length > 0 && (
            <div className="rounded-2xl bg-slate-900 dark:bg-slate-900/90 text-white border border-slate-700 p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wider text-rose-300">
                    {metrics.sensitiveLogs.length} Sensitive Audit Events Logged
                  </div>
                  <p className="text-xs text-slate-200 mt-1 truncate">
                    Latest: {recentSensitiveLogs[0].action} ({recentSensitiveLogs[0].user})
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {recentSensitiveLogs[0].details}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuditSensitiveOnly(true);
                  setHodAdminTab('audit');
                }}
                className="self-start inline-flex items-center gap-1.5 text-xs font-bold text-teal-300 hover:underline cursor-pointer"
              >
                <span>Filter Sensitive Logs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Activity Today
            </span>
            <Activity className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {metrics.logsToday}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {metrics.totalLogs} total events in audit trail
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Staff Access Health
            </span>
            <KeyRound className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {metrics.activeUsers.length}{' '}
            <span className="text-sm font-bold text-slate-400">
              / {authorizedUsers.length}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {metrics.pendingUsers.length} pending · {metrics.declinedUsers.length} declined
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sensitive Alerts
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {metrics.sensitiveLogs.length + metrics.declinedUsers.length}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Unlocks, cancellations, clears &amp; declines
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Portal Records Synced
            </span>
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {students.length}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {courses.length} courses · {attendanceRecords.length} attendance sheets
          </p>
        </div>
      </div>

      {/* HOD Exclusive Workspace Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="inline-flex items-center bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs gap-1">
          <button
            type="button"
            onClick={() => setHodAdminTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              hodAdminTab === 'audit'
                ? 'bg-[#003b5c] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Department Activity Logs ({auditLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setHodAdminTab('authorized')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              hodAdminTab === 'authorized'
                ? 'bg-[#003b5c] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Authorized Personnel ({authorizedUsers.length})</span>
            {(metrics.pendingUsers.length > 0 || metrics.declinedUsers.length > 0) && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-900">
                {metrics.pendingUsers.length + metrics.declinedUsers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setHodAdminTab('autologging')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              hodAdminTab === 'autologging'
                ? 'bg-[#003b5c] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Auto-Logging Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setHodAdminTab('database')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              hodAdminTab === 'database'
                ? 'bg-[#003b5c] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>System Database &amp; Diagnostics</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {hodAdminTab === 'audit' && (
        <AuditLogPanel
          sensitiveOnly={auditSensitiveOnly}
          onSensitiveOnlyChange={setAuditSensitiveOnly}
        />
      )}

      {hodAdminTab === 'authorized' && <AuthorizedPersonnelPanel />}

      {hodAdminTab === 'autologging' && <AutoLoggingSettingsPanel />}

      {hodAdminTab === 'database' && (
        <div className="space-y-4">
          {diagStatus && (
            <div
              className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold ${
                diagStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : diagStatus.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{diagStatus.message}</span>
            </div>
          )}

          {cloudSyncError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Last Sync Notice: {cloudSyncError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cloud Connection & Sync Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#007c82] dark:text-teal-400" />
                    Cloud Firestore Diagnostics
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Verify live server connectivity, force push cached data, and inspect collection volume.
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    isCloudConnected
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {isCloudConnected ? 'Connected' : 'Cached Mode'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Students</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{students.length}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Courses / Slots</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">
                    {courses.length} / {timetable.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 col-span-2 sm:col-span-1">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Cancelled Classes</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">
                    {cancelledClasses.length}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-[11px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">
                    Named Firestore Database ID
                  </span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 truncate max-w-[230px]">
                    {activeFirestoreDatabaseId}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-teal-600" />
                    Campus Geofence Radius
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {GPS_ATTENDANCE_ENABLED && geofenceSettings.enabled
                      ? `${geofenceSettings.radiusMeters}m (${geofenceSettings.campusName})`
                      : 'Disabled'}
                  </span>
                </div>
                {latencyResult && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 font-semibold">
                      Last Server Ping
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {latencyResult.connected ? `${latencyResult.latencyMs} ms` : 'Unreachable'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={handlePing}
                  disabled={isPinging}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isPinging ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5 text-[#007c82]" />
                  )}
                  <span>Ping Server Latency</span>
                </button>

                <button
                  type="button"
                  onClick={handleForceSync}
                  disabled={isSyncing}
                  className="px-3.5 py-2 rounded-xl bg-[#003b5c] hover:bg-[#004e75] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Force Cloud Sync</span>
                </button>
              </div>
            </div>

            {/* Backup, Restore & L200 Seed Console */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Department Backup &amp; Curriculum Seeding
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Export full JSON archives, restore snapshots into Firestore, or reset the official L200 timetable. Every restore action is automatically recorded in the HOD audit log.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON Backup</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRestoring}
                  className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isRestoring ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Restore Backup JSON</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <CalendarDays className="w-4 h-4 text-[#007c82]" />
                  <span>Official L200 IT Timetable Loader</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Merge missing Level 200 courses/slots safely, or replace existing curriculum slots with the official timetable.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleLoadL200Timetable(false)}
                    disabled={isLoadingL200}
                    className="px-3 py-1.5 rounded-lg bg-[#007c82] hover:bg-[#00666b] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Merge Missing Slots
                  </button>
                  {!confirmOverwriteL200 ? (
                    <button
                      type="button"
                      onClick={() => setConfirmOverwriteL200(true)}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold cursor-pointer"
                    >
                      Overwrite Timetable...
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleLoadL200Timetable(true)}
                        disabled={isLoadingL200}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        Confirm Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmOverwriteL200(false)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
