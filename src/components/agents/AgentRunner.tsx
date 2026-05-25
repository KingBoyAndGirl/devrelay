'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────

interface ParsedChunk {
  ts: number;
  type: 'system' | 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'raw';
  content: string;
  toolName?: string;
  toolInput?: string;
}

interface Turn {
  id: string;
  prompt: string;
  chunks: ParsedChunk[];
  exitCode: number | null;
  status: 'running' | 'done' | 'timeout' | 'error';
  errorMessage?: string;
  startedAt: number;
  endedAt: number | null;
  postActions: PostAction[];
}

interface PostAction {
  action: string;
  status: 'started' | 'done' | 'error';
  branch?: string;
  commitSha?: string;
  prNumber?: number;
  prUrl?: string;
  message: string;
}

type PositionMode = 'inline' | 'drawer' | 'floating';

interface AgentRunnerProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
  projectId?: string;
  taskId?: string;
  positioned?: PositionMode;
}

// ── Parse Claude Code stream-json line ───────────────────────────

function parseStreamLine(line: string): ParsedChunk | null {
  try {
    const obj = JSON.parse(line);
    const ts = Date.now();
    const type = obj.type;

    // system messages (init, etc.) — skip or show compact
    if (type === 'system') {
      return { ts, type: 'system', content: obj.subtype || 'system' };
    }

    // assistant message — main text output
    if (type === 'assistant') {
      const content = obj.message?.content;
      if (!content) return null;

      for (const block of content) {
        if (block.type === 'text') {
          return { ts, type: 'text', content: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            ts,
            type: 'tool_use',
            content: block.name || 'unknown tool',
            toolName: block.name,
            toolInput: JSON.stringify(block.input, null, 2),
          };
        }
        if (block.type === 'thinking') {
          return { ts, type: 'thinking', content: block.thinking || '' };
        }
      }
      return null;
    }

    // user message — usually tool results
    if (type === 'user') {
      const content = obj.message?.content;
      if (!content) return null;
      const texts: string[] = [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          texts.push(block.content?.slice(0, 500) || '');
        }
      }
      if (texts.length > 0) {
        return { ts, type: 'tool_result', content: texts.join('\n') };
      }
      return null;
    }

    // result — end of run
    if (type === 'result') {
      return { ts, type: 'result', content: obj.subtype || 'finished' };
    }

    // fallback — show raw JSON as text
    return null;
  } catch {
    // Not JSON — raw text from CLI
    return { ts: Date.now(), type: 'raw', content: line };
  }
}

// ── Duration formatter ──────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Component ────────────────────────────────────────────────────

interface TaskContext {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
}

export default function AgentRunner({ agentId, agentName, onClose, projectId, taskId, positioned = 'inline' }: AgentRunnerProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeTurn, setActiveTurn] = useState<Turn | null>(null);
  const [prompt, setPrompt] = useState('');
  const [taskContext, setTaskContext] = useState<TaskContext | null>(null);
  const [contextUsed, setContextUsed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch task context when taskId is provided
  useEffect(() => {
    if (!taskId) return;
    fetch(`/api/tasks/${taskId}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setTaskContext(data);
          if (!contextUsed) {
            const parts = [`请完成以下任务：${data.title}`];
            if (data.description) {
              parts.push(`\n任务描述：${data.description}`);
            }
            parts.push('\n');
            setPrompt(parts.join(''));
          }
        }
      });
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smart scroll — auto-scroll unless user scrolled up
  const scrollToBottom = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force || !userScrolledUp.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(() => {
    if (activeTurn?.status === 'running') {
      scrollToBottom(false);
    }
  }, [activeTurn?.chunks, scrollToBottom]);

  async function handleRun() {
    const text = prompt.trim();
    if (!text) return;

    // Cancel existing run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPrompt('');
    if (taskContext && !contextUsed) setContextUsed(true);

    const turn: Turn = {
      id: Math.random().toString(36).slice(2, 8),
      prompt: text,
      chunks: [],
      exitCode: null,
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      postActions: [],
    };

    const reqBody: Record<string, unknown> = { prompt: text };
    if (projectId) reqBody.projectId = projectId;
    if (taskId) reqBody.taskId = taskId;

    setActiveTurn(turn);
    userScrolledUp.current = false;

    let streamResult: string | null = null; // track stream-json result subtype

    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const data = await res.json();
        const finished: Turn = {
          ...turn,
          status: 'error',
          errorMessage: `并发已满，队列位置: #${data.queuePosition}`,
          endedAt: Date.now(),
        };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        const finished: Turn = {
          ...turn,
          status: 'error',
          errorMessage: data.error || `HTTP ${res.status}`,
          endedAt: Date.now(),
        };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const sseData = JSON.parse(trimmed.slice(6));

            // Terminal events
            if (sseData.type === 'exit') {
              // Trust stream-json result event over exit code
              const success = streamResult === 'success';
              const finished: Turn = {
                ...turn,
                chunks: [...turn.chunks],
                exitCode: sseData.exitCode ?? null,
                status: success ? 'done' : (sseData.exitCode === 0 ? 'done' : 'error'),
                endedAt: Date.now(),
              };
              setActiveTurn(finished);
              setTurns(prev => [...prev, finished]);
              return;
            }

            if (sseData.type === 'timeout') {
              const finished: Turn = {
                ...turn,
                chunks: [...turn.chunks],
                status: 'timeout',
                endedAt: Date.now(),
              };
              setActiveTurn(finished);
              setTurns(prev => [...prev, finished]);
              return;
            }

            if (sseData.type === 'error') {
              const finished: Turn = {
                ...turn,
                chunks: [...turn.chunks],
                status: 'error',
                errorMessage: sseData.error || sseData.message,
                endedAt: Date.now(),
              };
              setActiveTurn(finished);
              setTurns(prev => [...prev, finished]);
              return;
            }

            // stdout data — parse stream-json
            if (sseData.type === 'stdout' && sseData.data) {
              const parsed = parseStreamLine(sseData.data.trim());
              if (parsed) {
                // Track stream-json result for success determination
                if (parsed.type === 'result' && parsed.content === 'success') {
                  streamResult = 'success';
                }
                turn.chunks = [...turn.chunks, parsed];
                setActiveTurn({ ...turn, chunks: [...turn.chunks] });
                scrollToBottom(false);
              }
            }

            // stderr data
            if (sseData.type === 'stderr' && sseData.data) {
              turn.chunks = [...turn.chunks, {
                ts: Date.now(),
                type: 'raw' as const,
                content: sseData.data,
              }];
              setActiveTurn({ ...turn, chunks: [...turn.chunks] });
              scrollToBottom(false);
            }

            // post_action events
            if (sseData.type === 'post_action') {
              turn.postActions = [...turn.postActions, sseData as PostAction];
              setActiveTurn({ ...turn, postActions: [...turn.postActions] });
              scrollToBottom(false);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Stream ended without explicit exit event — check result
      const finalStatus = streamResult === 'success' ? 'done' : 'error';
      const finished: Turn = {
        ...turn,
        chunks: [...turn.chunks],
        status: finalStatus,
        endedAt: Date.now(),
      };
      setActiveTurn(finished);
      setTurns(prev => [...prev, finished]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // If we already have a success result, mark as done even on cancel
        const success = streamResult === 'success';
        const finished: Turn = {
          ...turn,
          chunks: [...turn.chunks],
          status: success ? 'done' : 'done',
          endedAt: Date.now(),
        };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
      } else {
        const finished: Turn = {
          ...turn,
          chunks: [...turn.chunks],
          status: 'error',
          errorMessage: `连接错误: ${err.message}`,
          endedAt: Date.now(),
        };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
      }
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRun();
    }
  }

  function copyTurn(turn: Turn) {
    const text = turn.chunks.map(c => c.content).join('');
    navigator.clipboard.writeText(text);
  }

  const statusBadge = (turn: Turn) => {
    switch (turn.status) {
      case 'running': return (
        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          执行中
        </span>
      );
      case 'done': return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">完成</span>;
      case 'timeout': return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">超时</span>;
      case 'error': return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">错误</span>;
    }
  };

  const chunkClass = (type: ParsedChunk['type']) => {
    switch (type) {
      case 'system': return 'text-gray-500 text-xs italic';
      case 'thinking': return 'text-gray-400 text-xs italic border-l-2 border-gray-600 pl-3';
      case 'tool_use': return 'text-cyan-400 text-xs';
      case 'tool_result': return 'text-gray-300 text-xs';
      case 'result': return 'text-yellow-400 text-xs font-semibold';
      case 'raw': return 'text-green-400';
      default: return 'text-green-400';
    }
  };

  const chunkPrefix = (type: ParsedChunk['type']) => {
    switch (type) {
      case 'thinking': return '💭 ';
      case 'tool_use': return '🔧 ';
      case 'tool_result': return '  └─ ';
      case 'result': return '✓ ';
      default: return '';
    }
  };

  // Flatten all turns + active turn for display
  const allTurns = [...turns];
  if (activeTurn && !turns.find(t => t.id === activeTurn.id)) {
    allTurns.push(activeTurn);
  }

  const terminal = (
    <div
      className={`bg-gray-900 rounded-xl overflow-hidden border border-gray-700 flex flex-col transition-all
        ${positioned === 'drawer' ? 'rounded-b-none animate-slide-up' : ''}
        ${positioned === 'floating' ? (minimized ? 'h-auto' : 'shadow-2xl') : ''}`}
      style={positioned === 'inline' ? { height: '70vh', maxHeight: '800px' } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-green-400 font-mono text-sm truncate">▶ {agentName}</span>
          {activeTurn?.status === 'running' && statusBadge(activeTurn)}
          {positioned !== 'floating' && (
            <span className="text-xs text-gray-500 font-mono">{turns.length} 轮对话</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {turns.length > 0 && positioned !== 'floating' && (
            <button
              onClick={() => { setTurns([]); setActiveTurn(null); }}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              清空历史
            </button>
          )}
          {positioned === 'floating' && (
            <button
              onClick={() => setMinimized(!minimized)}
              className="text-gray-400 hover:text-white text-sm"
              title={minimized ? '展开' : '最小化'}
            >
              {minimized ? '□' : '_'}
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm">✕</button>
        </div>
      </div>

      {/* Conversation + Input — hidden when minimized in floating mode */}
      {!(positioned === 'floating' && minimized) && (<>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`overflow-y-auto p-4 space-y-6 ${positioned === 'floating' ? 'max-h-72' : 'flex-1'}`}
      >
        {allTurns.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            <div className="text-center space-y-2">
              <div className="text-4xl">&#8203;</div>
              <p>向 {agentName} 发送指令开始对话</p>
              <p className="text-xs text-gray-700">Ctrl + Enter 发送</p>
            </div>
          </div>
        )}

        {allTurns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            {/* User prompt */}
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5">
                <p className="text-sm whitespace-pre-wrap break-words">{turn.prompt}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-blue-200">{formatTime(turn.startedAt)}</span>
                </div>
              </div>
            </div>

            {/* Agent response */}
            <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">{agentName}</span>
                  {statusBadge(turn)}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {turn.endedAt && (
                    <span>耗时 {formatDuration(turn.endedAt - turn.startedAt)}</span>
                  )}
                  {turn.exitCode !== null && (
                    <span className={turn.exitCode === 0 ? 'text-green-400' : 'text-red-400'}>
                      退出码 {turn.exitCode}
                    </span>
                  )}
                  {turn.chunks.length > 0 && (
                    <button
                      onClick={() => copyTurn(turn)}
                      className="text-gray-500 hover:text-gray-300"
                      title="复制输出"
                    >
                      ⎘
                    </button>
                  )}
                </div>
              </div>

              <div className="font-mono text-sm space-y-0.5">
                {turn.chunks.map((chunk, i) => (
                  <div key={i} className={chunkClass(chunk.type)}>
                    {chunk.type === 'tool_use' ? (
                      <details className="inline">
                        <summary className="cursor-pointer inline">
                          {chunkPrefix(chunk.type)}{chunk.content}
                        </summary>
                        <pre className="text-xs text-gray-500 mt-1 pl-4 whitespace-pre-wrap">
                          {chunk.toolInput}
                        </pre>
                      </details>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">
                        {chunkPrefix(chunk.type)}{chunk.content}
                      </span>
                    )}
                  </div>
                ))}

                {turn.chunks.length === 0 && turn.status === 'running' && (
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    等待输出...
                  </div>
                )}

                {turn.errorMessage && (
                  <div className="text-red-400 text-xs mt-1">{turn.errorMessage}</div>
                )}

                {turn.postActions.map((pa, i) => (
                  <div key={i} className={`text-xs mt-1 flex items-center gap-1.5 ${
                    pa.status === 'error' ? 'text-red-400' :
                    pa.status === 'started' ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    {pa.status === 'started' && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />}
                    {pa.status === 'done' && <span>✓</span>}
                    {pa.status === 'error' && <span>✕</span>}
                    <span>{pa.message}</span>
                    {pa.prUrl && (
                      <a href={pa.prUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
                        #{pa.prNumber}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 shrink-0">
        {taskContext && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded bg-purple-900 text-purple-300 font-mono">
              📋 {taskContext.title}
            </span>
            {taskContext.priority && (
              <span className="text-xs text-gray-500">{taskContext.priority}</span>
            )}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-gray-900 text-green-400 border border-gray-600 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-green-500 placeholder-gray-600 resize-none"
            placeholder={`向 ${agentName} 发送指令... (Ctrl+Enter 发送)`}
            rows={2}
            disabled={activeTurn?.status === 'running'}
          />
          <div className="flex flex-col gap-1">
            {activeTurn?.status === 'running' ? (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 font-mono whitespace-nowrap"
              >
                取消
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!prompt.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 font-mono whitespace-nowrap"
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
      </>)}
    </div>
  );

  // ── Positioning wrapper ─────────────────────────────────

  if (positioned === 'drawer') {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-50 max-md:top-0" style={{ maxHeight: '60vh' }}>
          <div className="max-md:h-screen max-md:max-h-full" style={{ maxHeight: '60vh' }}>
            {terminal}
          </div>
        </div>
      </>
    );
  }

  if (positioned === 'floating') {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-96 max-md:inset-0 max-md:w-full">
        {terminal}
      </div>
    );
  }

  return terminal;
}
