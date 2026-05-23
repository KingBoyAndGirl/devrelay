'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

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

const AVATAR_EMOJI: Record<string, string> = {
  claude_code: '🧑‍💻',
  codex: '👨‍💻',
  hermes: '👩‍💻',
  openclaw: '🧑‍🔬',
  custom: '🤖',
};

const ROLE_COLOR: Record<string, string> = {
  developer: 'from-blue-400 to-blue-600',
  architect: 'from-purple-400 to-purple-600',
  pm: 'from-yellow-400 to-yellow-600',
  qa: 'from-green-400 to-green-600',
  delivery_manager: 'from-orange-400 to-orange-600',
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

function DeskScene({ agent, slug }: { agent: AgentStatus; slug: string }) {
  const working = !!agent.currentTask;
  const disabled = !agent.enabled;

  return (
    <div className="flex flex-col items-center group">
      {/* Person + Desk + Screen */}
      <div className="relative w-28 h-28 flex items-end justify-center">
        {/* Monitor */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-20 h-14 rounded-md border-2 transition-all duration-300 ${
          working
            ? 'border-green-400 bg-gray-900 shadow-[0_0_12px_rgba(74,222,128,0.4)]'
            : disabled
              ? 'border-gray-300 bg-gray-200'
              : 'border-gray-400 bg-gray-800'
        }`}>
          {/* Screen content */}
          {working ? (
            <div className="p-1.5 overflow-hidden h-full">
              <div className="space-y-0.5 animate-screen-scroll">
                <div className="h-1 bg-green-400/60 rounded-full" style={{ width: '80%' }} />
                <div className="h-1 bg-blue-400/50 rounded-full" style={{ width: '60%' }} />
                <div className="h-1 bg-green-400/40 rounded-full" style={{ width: '90%' }} />
                <div className="h-1 bg-yellow-400/50 rounded-full" style={{ width: '45%' }} />
                <div className="h-1 bg-green-400/60 rounded-full" style={{ width: '70%' }} />
                <div className="h-1 bg-purple-400/40 rounded-full" style={{ width: '55%' }} />
                <div className="h-1 bg-green-400/50 rounded-full" style={{ width: '85%' }} />
              </div>
              {/* Cursor blink */}
              <div className="absolute bottom-2 right-3 w-1 h-2 bg-green-400 animate-blink" />
            </div>
          ) : disabled ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-lg">
              💤
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-gray-500 text-xs">IDLE</span>
            </div>
          )}
        </div>

        {/* Monitor stand */}
        <div className={`absolute top-14 left-1/2 -translate-x-1/2 w-2 h-2 ${
          working ? 'bg-gray-500' : 'bg-gray-300'
        }`} />
        <div className={`absolute top-16 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded ${
          working ? 'bg-gray-500' : 'bg-gray-300'
        }`} />

        {/* Person */}
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-3xl transition-transform duration-300 ${
          working ? 'animate-bob' : disabled ? 'opacity-40 grayscale' : ''
        }`}>
          {AVATAR_EMOJI[agent.type] || '🤖'}
        </div>

        {/* Keyboard */}
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-14 h-2.5 rounded-sm border transition-colors ${
          working
            ? 'border-gray-400 bg-gray-200'
            : 'border-gray-200 bg-gray-100'
        }`}>
          {working && (
            <div className="flex justify-center gap-0.5 mt-0.5 animate-typing">
              <div className="w-1 h-1 bg-gray-400 rounded-sm" />
              <div className="w-1 h-1 bg-gray-400 rounded-sm" />
              <div className="w-1 h-1 bg-gray-400 rounded-sm" />
            </div>
          )}
        </div>

        {/* Working status light */}
        {working && (
          <div className="absolute top-0 right-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </div>
        )}

        {/* Zzz for idle */}
        {disabled && (
          <div className="absolute top-1 right-1 text-xs animate-float-z">
            💤
          </div>
        )}
      </div>

      {/* Name plate */}
      <div className={`mt-1 px-2 py-0.5 rounded text-[10px] font-medium text-white bg-gradient-to-r ${
        ROLE_COLOR[agent.role] || 'from-gray-400 to-gray-600'
      }`}>
        {agent.name.length > 8 ? agent.name.slice(0, 8) + '…' : agent.name}
      </div>

      {/* Task info (tooltip on hover) */}
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

export default function AgentActivityPanel({ slug }: { slug: string }) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
    fetchStatus();
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

  return (
    <>
      <style jsx global>{`
        @keyframes bob {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-2px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes screen-scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-4px); }
        }
        @keyframes typing-keys {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes float-z {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.6; }
          50% { transform: translateY(-6px) rotate(5deg); opacity: 1; }
          100% { transform: translateY(-12px) rotate(-3deg); opacity: 0; }
        }
        .animate-bob { animation: bob 2s ease-in-out infinite; }
        .animate-blink { animation: blink 1s step-end infinite; }
        .animate-screen-scroll { animation: screen-scroll 3s linear infinite; }
        .animate-typing > div:nth-child(1) { animation: typing-keys 0.4s ease-in-out infinite; }
        .animate-typing > div:nth-child(2) { animation: typing-keys 0.4s ease-in-out 0.1s infinite; }
        .animate-typing > div:nth-child(3) { animation: typing-keys 0.4s ease-in-out 0.2s infinite; }
        .animate-float-z { animation: float-z 2s ease-out infinite; }
      `}</style>

      <div className="relative" ref={panelRef}>
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span className="text-base">🏢</span>
          <span className="text-xs text-gray-600 font-medium">工位</span>
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
            <div className="bg-gradient-to-b from-gray-50 to-white rounded-2xl shadow-2xl border border-gray-200 w-[90vw] max-w-2xl max-h-[80vh] overflow-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <h2 className="font-bold text-sm text-gray-800">办公室</h2>
                  <span className="text-xs text-gray-400">— 实时工位状态</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> 工作中
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-300" /> 空闲
                    </span>
                  </div>
                  <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                </div>
              </div>

              {/* Office floor */}
              <div className="p-6">
                {/* Floor pattern */}
                <div className="relative bg-gradient-to-b from-blue-50/50 to-gray-50 rounded-xl border border-gray-100 p-6">
                  {/* Office decorations */}
                  <div className="absolute top-2 left-3 text-xs text-gray-300 select-none">🪴</div>
                  <div className="absolute top-2 right-3 text-xs text-gray-300 select-none">☕</div>

                  {/* Desk grid */}
                  <div className="flex flex-wrap justify-center gap-6">
                    {agents.map(agent => (
                      <DeskScene key={agent.id} agent={agent} slug={slug} />
                    ))}
                  </div>
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
                          <span className="text-sm">{AVATAR_EMOJI[agent.type] || '🤖'}</span>
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
