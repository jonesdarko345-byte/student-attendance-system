import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AuditLog } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  CalendarCheck,
  Fingerprint,
  UserPlus,
  Clock,
  Search,
  Sliders,
  Database,
  AlertTriangle,
  Download,
  User,
  RotateCcw
} from 'lucide-react';

export const isSensitiveAuditLog = (log: AuditLog): boolean => {
  const haystack = `${log.action} ${log.details}`.toLowerCase();
  return /unlock|cancel|declin|revok|clear|restor|geofence|mismatch|unauthoriz|fail|delete/.test(
    haystack
  );
};

interface AuditLogPanelProps {
  sensitiveOnly?: boolean;
  onSensitiveOnlyChange?: (value: boolean) => void;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({
  sensitiveOnly: controlledSensitiveOnly,
  onSensitiveOnlyChange
}) => {
  const { auditLogs, setHodAdminTab } = useApp();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterActor, setFilterActor] = useState<string>('all');
  const [timeWindow, setTimeWindow] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [internalSensitiveOnly, setInternalSensitiveOnly] = useState<boolean>(false);

  const sensitiveOnly =
    controlledSensitiveOnly !== undefined ? controlledSensitiveOnly : internalSensitiveOnly;

  const setSensitiveOnly = (next: boolean) => {
    if (onSensitiveOnlyChange) {
      onSensitiveOnlyChange(next);
    } else {
      setInternalSensitiveOnly(next);
    }
  };

  const uniqueActors = useMemo(() => {
    const names = new Set<string>();
    auditLogs.forEach((log) => {
      if (log.user?.trim()) {
        names.add(log.user.trim());
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();
    const sevenDaysMs = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = now - 30 * 24 * 60 * 60 * 1000;
    const q = searchQuery.trim().toLowerCase();

    return auditLogs.filter((log) => {
      if (filterType !== 'all' && log.type !== filterType) return false;
      if (filterActor !== 'all' && log.user.trim() !== filterActor) return false;
      if (sensitiveOnly && !isSensitiveAuditLog(log)) return false;

      if (timeWindow !== 'all') {
        const logMs = new Date(log.timestamp).getTime();
        if (Number.isNaN(logMs)) return false;
        if (timeWindow === 'today' && logMs < startOfTodayMs) return false;
        if (timeWindow === '7d' && logMs < sevenDaysMs) return false;
        if (timeWindow === '30d' && logMs < thirtyDaysMs) return false;
      }

      if (q !== '') {
        const match =
          log.action.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q) ||
          log.user.toLowerCase().includes(q) ||
          log.type.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [auditLogs, filterType, filterActor, timeWindow, searchQuery, sensitiveOnly]);

  const sensitiveCount = useMemo(
    () => auditLogs.filter((log) => isSensitiveAuditLog(log)).length,
    [auditLogs]
  );

  const hasActiveFilters =
    filterType !== 'all' ||
    filterActor !== 'all' ||
    timeWindow !== 'all' ||
    searchQuery.trim() !== '' ||
    sensitiveOnly;

  const resetFilters = () => {
    setFilterType('all');
    setFilterActor('all');
    setTimeWindow('all');
    setSearchQuery('');
    setSensitiveOnly(false);
  };

  const escapeCsvCell = (value: string) => {
    const safe = String(value ?? '').replace(/"/g, '""');
    return `"${safe}"`;
  };

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Category', 'Priority', 'Action', 'Actor', 'Details'];
    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toISOString(),
      log.type,
      isSensitiveAuditLog(log) ? 'HIGH_PRIORITY' : 'STANDARD',
      log.action,
      log.user,
      log.details
    ]);
    const csvContent =
      [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n') + '\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `uenr-hod-audit-logs-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getLogIcon = (type: AuditLog['type']) => {
    switch (type) {
      case 'attendance':
        return <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'biometric':
        return <Fingerprint className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
      case 'student':
        return <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'timetable':
        return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'security':
        return <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case 'system':
        return <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    }
  };

  const getBadgeStyle = (type: AuditLog['type']) => {
    switch (type) {
      case 'attendance':
        return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'biometric':
        return 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case 'student':
        return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'timetable':
        return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'security':
        return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'system':
        return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
      default:
        return 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header & Controls */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#007c82] dark:text-teal-400" />
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                Department Activity & Audit Trail
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                {filteredLogs.length} / {auditLogs.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Immutable HOD ledger covering lecturer sign-ins, attendance unlocks, cancellations, roster edits, and exports.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSensitiveOnly(!sensitiveOnly)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                sensitiveOnly
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70'
              }`}
              title="Toggle filter to show only sensitive actions (unlocks, cancellations, declinations, revocations, clears, geofence changes)"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Sensitive Alerts Only ({sensitiveCount})</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Export currently filtered audit logs to CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#007c82] dark:text-teal-400" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setHodAdminTab('autologging')}
              className="px-3 py-1.5 text-xs font-bold bg-[#007c82]/10 hover:bg-[#007c82]/20 text-[#007c82] dark:text-teal-300 border border-[#007c82]/20 dark:border-teal-700/40 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
              title="Configure Automated Audit Logging Policies"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auto-Logging Policy</span>
            </button>
          </div>
        </div>

        {/* Multi-Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search action, details, user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007c82]"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter by event category"
            className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007c82]"
          >
            <option value="all">All Categories</option>
            <option value="security">Security &amp; Auth</option>
            <option value="attendance">Attendance &amp; Sessions</option>
            <option value="timetable">Timetable &amp; Cancellations</option>
            <option value="student">Students &amp; Roster</option>
            <option value="biometric">Biometrics</option>
            <option value="system">Reports &amp; System</option>
          </select>

          <div className="relative">
            <User className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              aria-label="Filter by actor or staff member"
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007c82]"
            >
              <option value="all">All Staff / Actors ({uniqueActors.length})</option>
              {uniqueActors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value as 'all' | 'today' | '7d' | '30d')}
              aria-label="Filter by time window"
              className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#007c82]"
            >
              <option value="all">All Time</option>
              <option value="today">Today Only</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-1 cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[580px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              No audit logs found matching your active filters.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-bold text-[#007c82] dark:text-teal-400 hover:underline cursor-pointer"
              >
                Clear filters to view all {auditLogs.length} events
              </button>
            )}
          </div>
        ) : (
          filteredLogs.map((log) => {
            const sensitive = isSensitiveAuditLog(log);
            return (
              <div
                key={log.id}
                className={`p-4 transition-colors flex items-start gap-3 ${
                  sensitive
                    ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/80 dark:hover:bg-rose-950/30 border-l-4 border-l-rose-500'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                }`}
              >
                <div
                  className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${
                    sensitive
                      ? 'bg-rose-100 dark:bg-rose-950/60'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  {getLogIcon(log.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {log.action}
                    </span>
                    {sensitive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider shadow-xs">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        High Priority
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getBadgeStyle(
                        log.type
                      )}`}
                    >
                      {log.type}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      by {log.user}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 break-words">
                    {log.details}
                  </p>
                </div>

                <div className="text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0 text-right whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
