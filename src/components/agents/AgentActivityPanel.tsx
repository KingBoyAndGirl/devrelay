'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────

interface AgentStatus {
  id: string;
  name: string;
  type: string;
  role: string;
  enabled: boolean;
  currentTask: {
    id: string;
    title: string;
    projectId: string;
    projectName: string | null;
    priority: string;
    updatedAt: string;
  } | null;
}

interface AgentTokenInfo {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  agentVersion: string | null;
  detectedClis: string[];
  cliDetails: { bin: string; version: string | null }[];
  activeCount: number;
  maxConcurrent: number;
  queueLength: number;
  sidecarReachable: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, { gradient: string; accent: string }> = {
  developer:         { gradient: 'from-blue-400 to-blue-600',    accent: '#3b82f6' },
  architect:         { gradient: 'from-purple-400 to-purple-600', accent: '#a855f7' },
  pm:                { gradient: 'from-yellow-400 to-yellow-600', accent: '#eab308' },
  qa:                { gradient: 'from-green-400 to-green-600',   accent: '#22c55e' },
  delivery_manager:  { gradient: 'from-orange-400 to-orange-600', accent: '#f97316' },
};

const ROLE_ICON: Record<string, string> = {
  developer: '🧑‍💻',
  architect: '🏗️',
  pm: '📋',
  qa: '🧪',
  delivery_manager: '🚀',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高', critical: '紧急',
};

function elapsed(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${s % 60}秒`;
  const h = Math.floor(m / 60);
  return `${h}时${m % 60}分`;
}

// ── Role-specific screen components ──────────────────────────────

function CodeScreen() {
  return (
    <div className="h-full p-1 overflow-hidden relative">
      <div className="animate-code-scroll space-y-[2px]">
        {[
          { w: '75%', bg: 'bg-blue-400/70' },
          { w: '55%', bg: 'bg-green-400/50' },
          { w: '85%', bg: 'bg-purple-400/50' },
          { w: '40%', bg: 'bg-yellow-400/50' },
          { w: '90%', bg: 'bg-cyan-400/40' },
          { w: '60%', bg: 'bg-green-400/60' },
          { w: '70%', bg: 'bg-blue-400/40' },
          { w: '50%', bg: 'bg-orange-400/50' },
        ].map((line, i) => (
          <div key={i} className={`h-[2px] ${line.bg} rounded-full`} style={{ width: line.w }} />
        ))}
      </div>
      <div className="absolute bottom-1 right-1.5 w-[2px] h-[5px] bg-green-400 animate-blink" />
    </div>
  );
}

function ChartScreen() {
  return (
    <div className="h-full flex items-center justify-center gap-1 p-1">
      {[
        { h: '40%', delay: '0s' },
        { h: '70%', delay: '0.3s' },
        { h: '55%', delay: '0.6s' },
        { h: '85%', delay: '0.9s' },
        { h: '60%', delay: '1.2s' },
      ].map((bar, i) => (
        <div
          key={i}
          className="w-[4px] rounded-t bg-gradient-to-t from-purple-500 to-purple-300 animate-chart-pulse"
          style={{ height: bar.h, animationDelay: bar.delay }}
        />
      ))}
    </div>
  );
}

function DocScreen() {
  return (
    <div className="p-1 space-y-[3px]">
      {[
        { checked: true, w: '70%', delay: '0s' },
        { checked: true, w: '55%', delay: '0.5s' },
        { checked: false, w: '80%', delay: '1s' },
        { checked: false, w: '45%', delay: '1.5s' },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-[2px] animate-doc-tick" style={{ animationDelay: item.delay }}>
          <div className={`w-[4px] h-[4px] rounded-[1px] border ${
            item.checked ? 'bg-yellow-400 border-yellow-500' : 'border-yellow-400/40'
          }`} />
          <div className={`h-[2px] rounded-full ${item.checked ? 'bg-yellow-400/60' : 'bg-yellow-400/30'}`}
               style={{ width: item.w }} />
        </div>
      ))}
    </div>
  );
}

function TestScreen() {
  return (
    <div className="h-full grid grid-cols-4 grid-rows-3 gap-[2px] p-1.5">
      {[
        true, true, false, true,
        true, false, true, true,
        false, true, true, true,
      ].map((pass, i) => (
        <div
          key={i}
          className={`rounded-[1px] animate-test-fill ${pass ? 'bg-green-400/70' : 'bg-red-400/70'}`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function DashboardScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-1 p-1">
      <div className="w-6 h-6 rounded-full border-2 border-orange-400/60 relative animate-gauge-spin">
        <div className="absolute top-1/2 left-1/2 w-[1px] h-2 bg-orange-400 origin-bottom -translate-x-1/2 -translate-y-full" />
      </div>
      <div className="w-full flex flex-col gap-[2px]">
        <div className="h-[2px] bg-orange-400/60 rounded-full animate-dashboard-bar" style={{ width: '80%', animationDelay: '0s' }} />
        <div className="h-[2px] bg-orange-300/50 rounded-full animate-dashboard-bar" style={{ width: '60%', animationDelay: '0.3s' }} />
        <div className="h-[2px] bg-orange-400/40 rounded-full animate-dashboard-bar" style={{ width: '45%', animationDelay: '0.6s' }} />
      </div>
    </div>
  );
}

function IdleScreen() {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-gray-500 text-[8px] font-mono animate-pulse">IDLE</span>
    </div>
  );
}

function getScreenForRole(role: string) {
  switch (role) {
    case 'developer':        return <CodeScreen />;
    case 'architect':        return <ChartScreen />;
    case 'pm':               return <DocScreen />;
    case 'qa':               return <TestScreen />;
    case 'delivery_manager': return <DashboardScreen />;
    default:                 return <CodeScreen />;
  }
}

// ── Desk Scene ───────────────────────────────────────────────────

function DeskScene({ agent, slug }: { agent: AgentStatus; slug: string }) {
  const working = !!agent.currentTask;
  const disabled = !agent.enabled;
  const roleColor = ROLE_COLOR[agent.role] || ROLE_COLOR.developer;

  const armClass = disabled ? '' : working
    ? `animate-arm-${agent.role === 'developer' ? 'type'
      : agent.role === 'architect' ? 'point'
      : agent.role === 'pm' ? 'check'
      : agent.role === 'qa' ? 'click'
      : 'monitor'}`
    : '';

  return (
    <div className="flex flex-col items-center group">
      <div className="relative w-28 h-28">
        {/* ── Monitor ── */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[52px] h-[36px] rounded border-2 transition-all duration-300 z-10 ${
          working
            ? 'border-green-400 bg-gray-900 shadow-[0_0_10px_rgba(74,222,128,0.3)]'
            : disabled
              ? 'border-gray-300 bg-gray-200'
              : 'border-gray-400 bg-gray-800'
        }`}>
          {working ? getScreenForRole(agent.role) : disabled ? null : <IdleScreen />}
          {disabled && (
            <div className="absolute inset-0 bg-gray-300/60 rounded" />
          )}
        </div>

        {/* Monitor stand */}
        <div className={`absolute top-[36px] left-1/2 -translate-x-1/2 w-[3px] h-[4px] z-10 ${working ? 'bg-gray-500' : 'bg-gray-300'}`} />
        <div className={`absolute top-[39px] left-1/2 -translate-x-1/2 w-6 h-[2px] rounded z-10 ${working ? 'bg-gray-500' : 'bg-gray-300'}`} />

        {/* ── Character ── */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-8 ${disabled ? 'grayscale opacity-40' : ''}`}
             style={{ top: '42px' }}>
          {/* Role badge */}
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] leading-none select-none z-20">
            {ROLE_ICON[agent.role] || '🤖'}
          </div>

          {/* Head */}
          <div className={`w-3.5 h-3.5 rounded-full mx-auto relative z-10 bg-gradient-to-br from-amber-200 to-amber-300 ${
            working ? 'animate-head-bob' : disabled ? '' : 'animate-idle-sway'
          } ${disabled ? 'animate-sleep-tilt' : ''}`}>
            <div className="absolute inset-x-0 top-0 h-[5px] rounded-t-full bg-gradient-to-r from-gray-700 to-gray-600" />
            {/* Eyes */}
            {!disabled ? (
              <>
                <div className="absolute top-[5px] left-[3px] w-[2px] h-[2px] bg-gray-800 rounded-full animate-blink-slow" />
                <div className="absolute top-[5px] right-[3px] w-[2px] h-[2px] bg-gray-800 rounded-full animate-blink-slow" />
              </>
            ) : (
              <>
                <div className="absolute top-[6px] left-[3px] w-[2px] h-0 bg-gray-600 rounded-full" style={{ borderTop: '1px solid #6b7280' }} />
                <div className="absolute top-[6px] right-[3px] w-[2px] h-0 bg-gray-600 rounded-full" style={{ borderTop: '1px solid #6b7280' }} />
              </>
            )}
          </div>

          {/* Body */}
          <div className={`w-3.5 h-2 rounded-sm mx-auto relative bg-gradient-to-b ${roleColor.gradient} -mt-0.5 z-[5]`}>
            {/* Tie */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 w-0 h-0 border-l-[2px] border-r-[2px] border-t-[4px] border-l-transparent border-r-transparent"
                 style={{ borderTopColor: roleColor.accent, filter: 'brightness(0.7)' }} />
          </div>

          {/* Arms */}
          <div className={`absolute w-2 h-[2px] rounded bg-gradient-to-r ${roleColor.gradient} left-[-4px] top-[17px] z-[8] ${armClass}`} />
          <div className={`absolute w-2 h-[2px] rounded bg-gradient-to-r ${roleColor.gradient} right-[-4px] top-[17px] z-[8] ${armClass}`}
               style={working && agent.role === 'developer' ? { animationDelay: '0.15s' } : undefined} />
        </div>

        {/* Working status light */}
        {working && (
          <div className="absolute top-0 right-1.5 z-20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </div>
        )}

        {/* Zzz for disabled */}
        {disabled && (
          <div className="absolute top-3 right-2 text-[8px] animate-zzz-float z-20 select-none">💤</div>
        )}

        {/* Coffee steam for idle */}
        {!working && !disabled && (
          <div className="absolute bottom-3 right-1 text-[7px] opacity-30 animate-pulse select-none">☕</div>
        )}

        {/* ── Keyboard ── */}
        <div className={`absolute bottom-[18px] left-1/2 -translate-x-1/2 w-14 h-[5px] rounded-sm border transition-colors z-[3] ${
          working ? 'border-gray-400 bg-gray-200' : 'border-gray-200 bg-gray-100'
        }`}>
          {working && (
            <div className="flex justify-center gap-[1px] mt-[1px]">
              <div className="w-[2px] h-[2px] bg-gray-400 rounded-sm animate-key-press" />
              <div className="w-[2px] h-[2px] bg-gray-400 rounded-sm animate-key-press" style={{ animationDelay: '0.1s' }} />
              <div className="w-[2px] h-[2px] bg-gray-400 rounded-sm animate-key-press" style={{ animationDelay: '0.2s' }} />
            </div>
          )}
        </div>

        {/* ── Desk ── */}
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1.5 rounded-sm border transition-colors ${
          working ? 'border-gray-300 bg-gray-200' : 'border-gray-200 bg-gray-100'
        }`} />
      </div>

      {/* ── Name plate ── */}
      <div className={`mt-1 px-2 py-0.5 rounded text-[10px] font-medium text-white bg-gradient-to-r ${
        ROLE_COLOR[agent.role]?.gradient || 'from-gray-400 to-gray-600'
      }`}>
        {agent.name.length > 8 ? agent.name.slice(0, 8) + '…' : agent.name}
      </div>

      {/* ── Task tooltip on hover ── */}
      {agent.currentTask && (
        <div className="mt-1 max-w-[120px] text-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Link
            href={`/workspaces/${slug}/projects/${agent.currentTask.projectId}/tasks/${agent.currentTask.id}`}
            className="text-[9px] text-blue-600 hover:underline line-clamp-2 leading-tight"
          >
            {agent.currentTask.title}
          </Link>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <span className="text-[8px] text-gray-400">
              {elapsed(agent.currentTask.updatedAt)}
            </span>
            <span className={`text-[8px] px-0.5 rounded ${
              agent.currentTask.priority === 'high' ? 'bg-red-100 text-red-600' :
              agent.currentTask.priority === 'critical' ? 'bg-red-200 text-red-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {PRIORITY_LABELS[agent.currentTask.priority] || ''}
            </span>
          </div>
        </div>
      )}

      {!agent.currentTask && agent.enabled && (
        <p className="text-[9px] text-gray-400 mt-1">空闲中</p>
      )}
    </div>
  );
}

// ── CSS Keyframes ────────────────────────────────────────────────

const ANIMATION_CSS = `
/* ── Character animations ── */
@keyframes head-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1px); }
}
@keyframes idle-sway {
  0%, 85%, 100% { transform: translateX(0); }
  90% { transform: translateX(-1px); }
  95% { transform: translateX(1px); }
}
@keyframes sleep-tilt {
  0% { transform: rotate(15deg) translateY(2px); }
  100% { transform: rotate(15deg) translateY(2px); }
}
@keyframes blink-slow {
  0%, 92%, 100% { opacity: 1; }
  95% { opacity: 0; }
}

/* ── Arm animations per role ── */
@keyframes arm-type {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}
@keyframes arm-point {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-2px) rotate(-5deg); }
}
@keyframes arm-check {
  0%, 70%, 100% { transform: translateY(0); }
  80% { transform: translateY(3px); }
}
@keyframes arm-click {
  0%, 85%, 100% { transform: translateY(0); }
  90% { transform: translateY(2px); }
}
@keyframes arm-monitor {
  0%, 90%, 100% { transform: translateY(0); }
  95% { transform: translateY(1px); }
}
.animate-arm-type    { animation: arm-type 0.3s ease-in-out infinite; }
.animate-arm-point   { animation: arm-point 1.5s ease-in-out infinite; }
.animate-arm-check   { animation: arm-check 1.2s ease-in-out infinite; }
.animate-arm-click   { animation: arm-click 0.4s ease-in-out infinite; }
.animate-arm-monitor { animation: arm-monitor 2s ease-in-out infinite; }

/* ── Screen content animations ── */
@keyframes code-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-6px); }
}
@keyframes chart-pulse {
  0%, 100% { opacity: 0.4; transform: scaleY(0.7); }
  50% { opacity: 1; transform: scaleY(1); }
}
@keyframes doc-tick {
  0%, 60% { opacity: 0.3; }
  80% { opacity: 1; }
  100% { opacity: 1; }
}
@keyframes test-fill {
  0% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0.8; transform: scale(1); }
}
@keyframes gauge-spin {
  0% { transform: rotate(0deg); }
  50% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
}
@keyframes dashboard-bar {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

/* ── Misc animations ── */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes key-press {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
@keyframes zzz-float {
  0% { transform: translateY(0) rotate(0deg); opacity: 0.7; }
  50% { transform: translateY(-5px) rotate(5deg); opacity: 1; }
  100% { transform: translateY(-10px) rotate(-3deg); opacity: 0; }
}

.animate-head-bob    { animation: head-bob 1.5s ease-in-out infinite; }
.animate-idle-sway   { animation: idle-sway 4s ease-in-out infinite; }
.animate-sleep-tilt  { animation: sleep-tilt 3s ease-in-out infinite; }
.animate-blink-slow  { animation: blink-slow 3s step-end infinite; }
.animate-blink       { animation: blink 1s step-end infinite; }
.animate-code-scroll { animation: code-scroll 4s linear infinite; }
.animate-chart-pulse { animation: chart-pulse 2s ease-in-out infinite; }
.animate-doc-tick    { animation: doc-tick 3s ease-in-out infinite; }
.animate-test-fill   { animation: test-fill 0.6s ease-out forwards; }
.animate-gauge-spin  { animation: gauge-spin 3s linear infinite; }
.animate-dashboard-bar { animation: dashboard-bar 2s ease-in-out infinite; }
.animate-key-press   { animation: key-press 0.3s ease-in-out infinite; }
.animate-zzz-float   { animation: zzz-float 2.5s ease-out infinite; }
`;

// ── Main Component ───────────────────────────────────────────────

export default function AgentActivityPanel({ slug }: { slug: string }) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [agentInfos, setAgentInfos] = useState<AgentTokenInfo[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [agentUpdating, setAgentUpdating] = useState<'loading' | 'done' | 'error' | null>(null);

  async function updateAgent(pkg: string) {
    setAgentUpdating('loading');
    try {
      const res = await fetch(`/api/workspaces/${slug}/agent-info/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAgentUpdating('done');
        // Refresh agent info after update
        setTimeout(async () => {
          setAgentUpdating(null);
          try {
            const r = await fetch(`/api/workspaces/${slug}/agent-info`);
            if (r.ok) {
              const d = await r.json();
              setAgentInfos(d.tokens || []);
            }
          } catch {}
        }, 2000);
      } else {
        setAgentUpdating('error');
        setTimeout(() => setAgentUpdating(null), 3000);
      }
    } catch {
      setAgentUpdating('error');
      setTimeout(() => setAgentUpdating(null), 3000);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/workspaces/${slug}/agents/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setAgents(data.agents || []);
          setActiveCount(data.activeCount || 0);
        }
      } catch {}
    }
    async function fetchAgentInfo() {
      try {
        const res = await fetch(`/api/workspaces/${slug}/agent-info`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAgentInfos(data.tokens || []);
        }
      } catch {}
    }
    async function fetchLatestVersion() {
      try {
        const res = await fetch(`/api/workspaces/${slug}/agent-info/latest-version`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.latestVersion) setLatestVersion(data.latestVersion);
        }
      } catch {}
    }
    fetchStatus();
    fetchAgentInfo();
    fetchLatestVersion();
    const interval = setInterval(fetchStatus, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [slug]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (agents.length === 0) return null;

  // Count by state
  const workingAgents = agents.filter(a => a.currentTask);
  const idleAgents = agents.filter(a => !a.currentTask && a.enabled);
  const disabledAgents = agents.filter(a => !a.enabled);

  return (
    <>
      <style jsx global>{ANIMATION_CSS}</style>

      <div className="relative" ref={panelRef}>
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span className="text-base">🏢</span>
          <span className="text-xs text-gray-600 font-medium">工位</span>
          {agentInfos.length > 0 && agentInfos[0].agentVersion && (
            <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${
              latestVersion && latestVersion !== agentInfos[0].agentVersion
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-400'
            }`}>
              v{agentInfos[0].agentVersion}
            </span>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto ${
            activeCount > 0
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {activeCount}/{agents.length}
          </span>
          {activeCount > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
        </button>

        {/* Expanded office scene */}
        {open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
               onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl shadow-2xl border border-gray-200 w-[90vw] max-w-3xl max-h-[85vh] overflow-auto">

              {/* Header */}
              <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-100 px-5 py-3 z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏢</span>
                    <h2 className="font-bold text-sm text-gray-800">办公室</h2>
                    <span className="text-xs text-gray-400">— 实时工位状态</span>
                  </div>
                  <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                </div>
                {/* Version info row */}
                {agentInfos.length > 0 && agentInfos[0].agentVersion && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-gray-400">Agent v{agentInfos[0].agentVersion}</span>
                    {latestVersion && latestVersion !== agentInfos[0].agentVersion && (
                      <button
                        onClick={() => !agentUpdating && updateAgent(`devrelay-agent@${latestVersion}`)}
                        disabled={!!agentUpdating}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          agentUpdating === 'loading' ? 'bg-blue-200 text-blue-700 cursor-wait' :
                          agentUpdating === 'done' ? 'bg-green-200 text-green-700' :
                          agentUpdating === 'error' ? 'bg-red-200 text-red-700' :
                          'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        }`}
                      >
                        {agentUpdating === 'loading' ? '更新中...' :
                         agentUpdating === 'done' ? '已更新 ✓' :
                         agentUpdating === 'error' ? '失败' :
                         `v${latestVersion} 可用`}
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> 工作中
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400" /> 空闲
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-300" /> 已禁用
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {Object.entries(ROLE_COLOR).map(([role, { gradient }]) => (
                      <span key={role} className="flex items-center gap-0.5">
                        <span className={`w-2 h-2 rounded-sm bg-gradient-to-r ${gradient}`} />
                        {role === 'developer' ? '开发' :
                         role === 'architect' ? '架构' :
                         role === 'pm' ? '产品' :
                         role === 'qa' ? '测试' : '交付'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Office floor */}
              <div className="p-6">
                <div className="relative bg-gradient-to-b from-blue-50/50 to-gray-50 rounded-xl border border-gray-100 p-6">
                  {/* Office decorations */}
                  <div className="absolute top-2 left-3 text-xs text-gray-300 select-none">🪴</div>
                  <div className="absolute top-2 right-3 text-xs text-gray-300 select-none">☕</div>

                  {/* Working agents first */}
                  {workingAgents.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-medium text-green-700">工作中</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-5">
                        {workingAgents.map(agent => (
                          <DeskScene key={agent.id} agent={agent} slug={slug} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Idle agents */}
                  {idleAgents.length > 0 && (
                    <div className={workingAgents.length > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        <span className="text-[10px] font-medium text-gray-500">空闲中</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-5">
                        {idleAgents.map(agent => (
                          <DeskScene key={agent.id} agent={agent} slug={slug} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disabled agents */}
                  {disabledAgents.length > 0 && (
                    <div className={(workingAgents.length > 0 || idleAgents.length > 0) ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        <span className="text-[10px] font-medium text-gray-400">已禁用</span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-5 opacity-60">
                        {disabledAgents.map(agent => (
                          <DeskScene key={agent.id} agent={agent} slug={slug} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Task summary bar */}
                {activeCount > 0 && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="animate-pulse text-green-600 text-xs">⚡</span>
                      <span className="text-xs font-medium text-green-800">
                        {activeCount} 位 Agent 正在工作中
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {agents.filter(a => a.currentTask).map(agent => (
                        <Link
                          key={agent.id}
                          href={`/workspaces/${slug}/projects/${agent.currentTask!.projectId}/tasks/${agent.currentTask!.id}`}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-green-100 transition-colors"
                          onClick={() => setOpen(false)}
                        >
                          <span className="text-[10px]">{ROLE_ICON[agent.role] || '🤖'}</span>
                          <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${ROLE_COLOR[agent.role]?.gradient || 'from-gray-400 to-gray-600'}`} />
                          <span className="text-[11px] text-gray-700 truncate flex-1">{agent.currentTask!.title}</span>
                          <span className="text-[9px] text-gray-400 shrink-0">{elapsed(agent.currentTask!.updatedAt)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
