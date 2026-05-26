'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────

interface ParsedChunk {
  ts: number;
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'result' | 'raw';
  content: string;
  toolName?: string;
  toolInput?: string;
  sessionId?: string;
}

interface Turn {
  id: string;
  prompt: string;
  chunks: ParsedChunk[];
  diagnostics: string[];
  exitCode: number | null;
  status: 'running' | 'done' | 'timeout' | 'error';
  errorMessage?: string;
  startedAt: number;
  endedAt: number | null;
  postActions: PostAction[];
  cliSessionId?: string;
  resumedFrom?: string;
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

// ── CLI diagnostic noise filters ──────────────────────────────────

const DIAG_PATTERNS = [
  /^Reading additional input from stdin/i,
  /^OpenAI Codex v[\d.]+/,
  /^Codex CLI v[\d.]+/,
  /^workdir:/i,
  /^model:/i,
  /^provider:/i,
  /^approval:/i,
  /^sandbox:/i,
  /^reasoning effort:/i,
  /^reasoning summaries:/i,
  /^session id:/i,
  /^-{3,}/,
  /^warning:/i,
  /^tokens used/i,
  /^Tokens used/i,
  /^\d{1,3}(,\d{3})*$/,
  /^Claude Code v[\d.]+/,
  /^Hermes v[\d.]+/,
  /^user$/,
  /^assistant$/,
  /^codex$/i,
  /^owl$/i,
];

function isDiagnosticLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return DIAG_PATTERNS.some(p => p.test(trimmed));
}

function isDiagnostic(text: string): boolean {
  // Split multi-line chunks and check each line individually
  const lines = text.split('\n');
  return lines.every(l => isDiagnosticLine(l));
}

// ── Parse stream output lines ─────────────────────────────────────

function parseLine(line: string, cliType?: string): ParsedChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Try to parse as JSON (Claude Code stream-json format)
  try {
    const obj = JSON.parse(trimmed);
    const ts = Date.now();
    const type = obj.type;

    if (type === 'assistant') {
      const content = obj.message?.content;
      if (!content) return null;
      for (const block of content) {
        if (block.type === 'text') {
          return { ts, type: 'text', content: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            ts, type: 'tool_use',
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

    if (type === 'result') {
      return { ts, type: 'result', content: obj.subtype || 'finished', sessionId: obj.session_id };
    }

    return null;
  } catch {
    // Not JSON — raw text from CLI
    if (isDiagnostic(trimmed)) return null;
    return { ts: Date.now(), type: 'raw', content: line };
  }
}

// ── Format helpers ────────────────────────────────────────────────

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
  const [showDiag, setShowDiag] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const seenContentRef = useRef<Set<string>>(new Set());
  const userPromptRef = useRef<string>('');

  useEffect(() => {
    if (!taskId) return;
    fetch(`/api/tasks/${taskId}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setTaskContext(data);
          if (!contextUsed) {
            const parts = [`请完成以下任务：${data.title}`];
            if (data.description) parts.push(`\n任务描述：${data.description}`);
            parts.push('\n');
            setPrompt(parts.join(''));
          }
        }
      });
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (activeTurn?.status === 'running') scrollToBottom(false);
  }, [activeTurn?.chunks, scrollToBottom]);

  async function handleRun() {
    const text = prompt.trim();
    if (!text) return;

    abortRef.current?.abort();
    setPrompt('');
    if (taskContext && !contextUsed) setContextUsed(true);

    const lastSessionTurn = [...turns].reverse().find(t => t.cliSessionId);
    const resumeSessionId = lastSessionTurn?.cliSessionId;

    const result = await doExecute(text, resumeSessionId);
    if (!result) return;

    // Auto-retry: resume failed with stale session, fall back to fresh start
    if (resumeSessionId && !result.cliSessionId && result.status !== 'done') {
      const retryResult = await doExecute(text, undefined);
      if (!retryResult) return;
      // Update turns with the fallback notice prepended
      const updatedRetry: Turn = {
        ...retryResult,
        resumedFrom: undefined,
        chunks: [
          { ts: Date.now(), type: 'raw', content: '会话已过期，已自动重新连接' },
          ...retryResult.chunks,
        ],
      };
      setTurns(prev => prev.map(t => t.id === retryResult.id ? updatedRetry : t));
      setActiveTurn(updatedRetry);
    }
  }

  async function doExecute(text: string, resumeSessionId: string | undefined): Promise<Turn | null> {
    const controller = new AbortController();
    abortRef.current = controller;

    const turn: Turn = {
      id: Math.random().toString(36).slice(2, 8),
      prompt: text,
      chunks: [],
      diagnostics: [],
      exitCode: null,
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      postActions: [],
      resumedFrom: resumeSessionId,
    };

    const reqBody: Record<string, unknown> = { prompt: text };
    if (projectId) reqBody.projectId = projectId;
    if (taskId) reqBody.taskId = taskId;
    if (resumeSessionId) reqBody.sessionId = resumeSessionId;

    setActiveTurn(turn);
    userScrolledUp.current = false;
    seenContentRef.current = new Set();
    userPromptRef.current = text;

    let streamResult: string | null = null;

    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const data = await res.json();
        const finished: Turn = { ...turn, status: 'error', errorMessage: `并发已满，队列位置: #${data.queuePosition}`, endedAt: Date.now() };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
        return finished;
      }

      if (!res.ok) {
        const data = await res.json();
        const finished: Turn = { ...turn, status: 'error', errorMessage: data.error || `HTTP ${res.status}`, endedAt: Date.now() };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
        return finished;
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

            if (sseData.type === 'exit') {
              const success = streamResult === 'success';
              const finished: Turn = {
                ...turn, chunks: [...turn.chunks], diagnostics: [...turn.diagnostics],
                exitCode: sseData.exitCode ?? null,
                status: success ? 'done' : (sseData.exitCode === 0 ? 'done' : 'error'),
                endedAt: Date.now(),
              };
              setActiveTurn(finished);
              setTurns(prev => [...prev, finished]);
              return finished;
            }

            if (sseData.type === 'timeout') {
              const finished: Turn = {
                ...turn, chunks: [...turn.chunks], diagnostics: [...turn.diagnostics],
                status: 'timeout', endedAt: Date.now(),
              };
              setActiveTurn(finished);
              setTurns(prev => [...prev, finished]);
              return finished;
            }

            if (sseData.type === 'error') {
              const finished: Turn = {
                ...turn, chunks: [...turn.chunks], diagnostics: [...turn.diagnostics],
                status: 'error', errorMessage: sseData.error || sseData.message, endedAt: Date.now(),
              };
              setActiveTurn(finished);
              setTurns(prev => [...prev, finished]);
              return finished;
            }

            if (sseData.type === 'stdout' && sseData.data) {
              // Split multi-line chunks and process each line individually
              const stdoutLines = sseData.data.split('\n');
              let stdoutUpdated = false;
              for (const rawLine of stdoutLines) {
                const parsed = parseLine(rawLine);
                if (!parsed) continue;
                if (parsed.type === 'result' && parsed.content === 'success') streamResult = 'success';
                if (parsed.sessionId) turn.cliSessionId = parsed.sessionId;
                if (parsed.type === 'raw' || parsed.type === 'text') {
                  const text = parsed.content.trim();
                  // Skip echoed user prompt and duplicates
                  if (!text || text === userPromptRef.current || seenContentRef.current.has(text)) continue;
                  seenContentRef.current.add(text);
                }
                turn.chunks = [...turn.chunks, parsed];
                stdoutUpdated = true;
              }
              if (stdoutUpdated) {
                setActiveTurn({ ...turn, chunks: [...turn.chunks] });
                scrollToBottom(false);
              }
            }

            if (sseData.type === 'stderr' && sseData.data) {
              // Split multi-line chunks and process each line individually
              const stderrLines = sseData.data.split('\n');
              let stderrUpdated = false;
              for (const line of stderrLines) {
                const text = line.trim();
                if (!text) continue;
                if (isDiagnosticLine(text)) {
                  turn.diagnostics = [...turn.diagnostics, text];
                } else if (text !== userPromptRef.current && !seenContentRef.current.has(text)) {
                  seenContentRef.current.add(text);
                  turn.chunks = [...turn.chunks, { ts: Date.now(), type: 'raw', content: text }];
                  stderrUpdated = true;
                }
              }
              if (turn.diagnostics.length) {
                setActiveTurn({ ...turn, diagnostics: [...turn.diagnostics] });
              }
              if (stderrUpdated) {
                setActiveTurn({ ...turn, chunks: [...turn.chunks] });
                scrollToBottom(false);
              }
            }

            if (sseData.type === 'post_action') {
              turn.postActions = [...turn.postActions, sseData as PostAction];
              setActiveTurn({ ...turn, postActions: [...turn.postActions] });
              scrollToBottom(false);
            }
          } catch { /* skip malformed */ }
        }
      }

      const finalStatus = streamResult === 'success' ? 'done' : 'error';
      const finished: Turn = { ...turn, chunks: [...turn.chunks], diagnostics: [...turn.diagnostics], status: finalStatus, endedAt: Date.now() };
      setActiveTurn(finished);
      setTurns(prev => [...prev, finished]);
      return finished;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const finished: Turn = { ...turn, chunks: [...turn.chunks], diagnostics: [...turn.diagnostics], status: 'done', endedAt: Date.now() };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
        return finished;
      } else {
        const finished: Turn = { ...turn, chunks: [...turn.chunks], diagnostics: [...turn.diagnostics], status: 'error', errorMessage: `连接错误: ${err.message}`, endedAt: Date.now() };
        setActiveTurn(finished);
        setTurns(prev => [...prev, finished]);
        return finished;
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

  const allTurns = [...turns];
  if (activeTurn && !turns.find(t => t.id === activeTurn.id)) {
    allTurns.push(activeTurn);
  }

  const hasDiag = allTurns.some(t => t.diagnostics.length > 0);

  const terminal = (
    <div className={`flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden transition-all ${
      positioned === 'floating' ? 'shadow-2xl' : ''
    }`} style={positioned === 'inline' ? { height: '70vh', maxHeight: '800px' } : undefined}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            {agentName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{agentName}</p>
            {activeTurn?.status === 'running' && (
              <p className="text-xs text-blue-600">正在执行...</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasDiag && (
            <button
              onClick={() => setShowDiag(!showDiag)}
              className={`text-xs px-2 py-1 rounded transition-colors ${showDiag ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:text-gray-600'}`}
            >
              诊断信息
            </button>
          )}
          {turns.length > 0 && (
            <button
              onClick={() => { setTurns([]); setActiveTurn(null); }}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              清空
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
        {allTurns.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                <span className="text-xl">→</span>
              </div>
              <p className="font-medium text-gray-500">向 {agentName} 发送指令</p>
              <p className="text-xs text-gray-400">Ctrl + Enter 发送</p>
            </div>
          </div>
        )}

        {allTurns.map(turn => (
          <div key={turn.id} className="space-y-4">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
                <p className="text-sm whitespace-pre-wrap break-words">{turn.prompt}</p>
                <p className="text-xs text-blue-200 mt-1">{formatTime(turn.startedAt)}</p>
              </div>
            </div>

            {/* Agent response */}
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                {agentName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500">{agentName}</span>
                    {turn.status === 'running' && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        执行中
                      </span>
                    )}
                    {turn.status === 'done' && (
                      <span className="text-xs text-green-600">完成</span>
                    )}
                    {turn.status === 'timeout' && (
                      <span className="text-xs text-amber-600">超时</span>
                    )}
                    {turn.status === 'error' && (
                      <span className="text-xs text-red-600">错误</span>
                    )}
                    {turn.endedAt && (
                      <span className="text-xs text-gray-400">耗时 {formatDuration(turn.endedAt - turn.startedAt)}</span>
                    )}
                    {turn.exitCode !== null && turn.exitCode !== 0 && (
                      <span className="text-xs text-red-400">退出码 {turn.exitCode}</span>
                    )}
                    {turn.resumedFrom && (
                      <span className="text-xs text-purple-500 font-medium">会话恢复</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="text-sm text-gray-800 space-y-2">
                    {turn.chunks.map((chunk, i) => (
                      <div key={i}>
                        {chunk.type === 'thinking' && (
                          <details className="group">
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500">思考过程</summary>
                            <p className="text-xs text-gray-400 mt-1 pl-2 border-l-2 border-gray-200 whitespace-pre-wrap">{chunk.content}</p>
                          </details>
                        )}
                        {chunk.type === 'tool_use' && (
                          <details className="group">
                            <summary className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 cursor-pointer hover:bg-purple-100 font-mono">
                              <span>🔧</span> {chunk.content}
                            </summary>
                            {chunk.toolInput && (
                              <pre className="text-xs text-gray-500 mt-1 pl-4 whitespace-pre-wrap font-mono">{chunk.toolInput}</pre>
                            )}
                          </details>
                        )}
                        {chunk.type === 'tool_result' && (
                          <p className="text-xs text-gray-400 pl-2 border-l-2 border-gray-200 whitespace-pre-wrap line-clamp-3">{chunk.content}</p>
                        )}
                        {chunk.type === 'text' && (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{chunk.content}</p>
                        )}
                        {chunk.type === 'raw' && (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{chunk.content}</p>
                        )}
                        {chunk.type === 'result' && (
                          <p className="text-xs text-green-600 font-medium">{chunk.content}</p>
                        )}
                      </div>
                    ))}

                    {turn.chunks.length === 0 && turn.status === 'running' && (
                      <div className="flex items-center gap-2 text-gray-400 text-xs">
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        等待输出...
                      </div>
                    )}

                    {turn.errorMessage && (
                      <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-xs">{turn.errorMessage}</div>
                    )}
                  </div>

                  {/* Post actions */}
                  {turn.postActions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                      {turn.postActions.map((pa, i) => (
                        <div key={i} className={`text-xs flex items-center gap-1.5 ${
                          pa.status === 'error' ? 'text-red-500' : pa.status === 'started' ? 'text-amber-500' : 'text-green-600'
                        }`}>
                          {pa.status === 'started' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                          {pa.status === 'done' && <span>✓</span>}
                          {pa.status === 'error' && <span>✕</span>}
                          <span>{pa.message}</span>
                          {pa.prUrl && (
                            <a href={pa.prUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-1">
                              #{pa.prNumber}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Diagnostics panel */}
      {showDiag && (
        <div className="border-t border-amber-200 bg-amber-50/50 px-4 py-2 max-h-32 overflow-y-auto shrink-0">
          <div className="text-xs text-amber-700 font-medium mb-1">诊断信息</div>
          {allTurns.map(turn =>
            turn.diagnostics.map((d, i) => (
              <div key={`${turn.id}-d${i}`} className="text-xs text-amber-600 font-mono whitespace-pre-wrap break-all">{d}</div>
            ))
          )}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
        {taskContext && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
              {taskContext.title}
            </span>
            {taskContext.priority && (
              <span className="text-xs text-gray-400">{taskContext.priority}</span>
            )}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 placeholder-gray-400 resize-none bg-gray-50"
            placeholder={`向 ${agentName} 发送指令... (Ctrl+Enter 发送)`}
            rows={2}
            disabled={activeTurn?.status === 'running'}
          />
          <div className="flex gap-1.5">
            {activeTurn?.status === 'running' ? (
              <button onClick={handleCancel} className="px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 whitespace-nowrap transition-colors">
                取消
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!prompt.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Positioned wrappers ───────────────────────────────────

  if (positioned === 'drawer') {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-50" style={{ maxHeight: '60vh' }}>
          {terminal}
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
