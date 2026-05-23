'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Member {
  id: string;
  userId: string;
  userName?: string;
  role: string;
  joinedAt: string;
}

interface Invite {
  id: string;
  code: string;
  role: string;
  expiresAt: string | null;
  usedBy: string | null;
  createdAt: string;
}

interface AgentToken {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string;
  lastSeenAt: string | null;
  online: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  pm: '产品经理',
  architect: '架构师',
  developer: '开发者',
  qa: '测试',
  delivery_manager: '交付经理',
};

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState('developer');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [newToken, setNewToken] = useState<{ id: string; name: string; token: string } | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fullTokens, setFullTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    loadWorkspace();
    loadMembers();
    loadInvites();
    loadTokens();

    // Real-time agent status via Socket.IO
    const socket: Socket = io({ transports: ['websocket', 'polling'] });
    socket.on('agent:status', (data: { workspaceSlug: string; tokenId: string; online: boolean; lastSeenAt: string | null }) => {
      if (data.workspaceSlug !== slug) return;
      setTokens(prev => prev.map(t =>
        t.id === data.tokenId ? { ...t, online: data.online, lastSeenAt: data.lastSeenAt } : t
      ));
    });
    return () => { socket.disconnect(); };
  }, [slug]);

  async function loadTokens() {
    const res = await fetch(`/api/workspaces/${slug}/agent-token`);
    if (res.ok) {
      const data = await res.json();
      setTokens(data.tokens || []);
    }
  }

  async function loadWorkspace() {
    const res = await fetch(`/api/workspaces/${slug}`);
    const data = await res.json();
    setName(data.name || '');
    setDescription(data.description || '');
  }

  async function loadMembers() {
    const res = await fetch(`/api/workspaces/${slug}`);
    const data = await res.json();
    const ms = (data.members || []).map((m: any) => ({
      id: m.id,
      userId: m.userId,
      userName: m.user?.displayName || m.user?.username || null,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
    setMembers(ms);
  }

  async function loadInvites() {
    const res = await fetch(`/api/workspaces/${slug}/invitations`);
    const data = await res.json();
    setInvites(Array.isArray(data) ? data : []);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(`/api/workspaces/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/workspaces/${data.slug}`);
    } else {
      const data = await res.json();
      setError(data.error || '更新失败');
    }
    setLoading(false);
  }

  async function handleCreateInvite() {
    setCreatingInvite(true);
    const res = await fetch(`/api/workspaces/${slug}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: inviteRole }),
    });
    if (res.ok) {
      const data = await res.json();
      setInviteLink(data.inviteUrl);
      loadInvites();
    }
    setCreatingInvite(false);
  }

  async function handleRemoveMember(memberId: string) {
    setRemovingMember(memberId);
    await fetch(`/api/workspaces/${slug}/members/${memberId}`, { method: 'DELETE' });
    setRemovingMember(null);
    loadMembers();
  }

  async function handleDeleteInvite(inviteId: string) {
    await fetch(`/api/workspaces/${slug}/invitations/${inviteId}`, { method: 'DELETE' });
    loadInvites();
  }

  async function handleGenerateToken() {
    setTokenLoading(true);
    const res = await fetch(`/api/workspaces/${slug}/agent-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTokenName || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewToken({ id: data.id, name: data.name, token: data.token });
      setFullTokens(prev => ({ ...prev, [data.id]: data.token }));
      setShowCreateForm(false);
      setNewTokenName('');
      loadTokens();
    }
    setTokenLoading(false);
  }

  async function handleRevokeToken(id: string, name: string) {
    if (!confirm(`撤销令牌 "${name}" 后，对应的 Agent 将无法连接。确定继续？`)) return;
    setTokenLoading(true);
    await fetch(`/api/workspaces/${slug}/agent-token?id=${id}`, { method: 'DELETE' });
    setFullTokens(prev => { const next = { ...prev }; delete next[id]; return next; });
    loadTokens();
    setTokenLoading(false);
  }

  async function handleDelete() {
    if (!confirm('确定要删除此空间吗？此操作不可撤销。')) return;
    setDeleting(true);
    const res = await fetch(`/api/workspaces/${slug}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/');
    } else {
      const data = await res.json();
      setError(data.error || '删除失败');
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="px-6 py-4">
        <h1 className="text-lg font-bold">空间设置</h1>
      </div>
      <div className="max-w-lg mx-auto p-6 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Basic Info */}
        <form onSubmit={handleSave} className="space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">基本信息</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">空间名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>

        <hr className="border-gray-200" />

        {/* Members */}
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-3">
            成员管理
            <span className="text-gray-400 font-normal ml-2">{members.length} 人</span>
          </h3>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">暂无成员</p>
          ) : (
            <div className="space-y-2 mb-4">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <span className="text-sm font-medium">{m.userName || m.userId}</span>
                    <span className="text-xs text-gray-500 ml-2">{ROLE_LABELS[m.role] || m.role}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(m.joinedAt).toLocaleDateString('zh-CN')} 加入
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={removingMember === m.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {removingMember === m.id ? '移除中...' : '移除'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invitations */}
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-3">邀请成员</h3>
          <div className="flex items-center gap-2 mb-3">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              onClick={handleCreateInvite}
              disabled={creatingInvite}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingInvite ? '生成中...' : '生成邀请链接'}
            </button>
          </div>

          {inviteLink && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
              <p className="text-sm text-green-700 mb-1">邀请链接已生成：</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-green-300 truncate">
                  {inviteLink}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                >
                  复制
                </button>
              </div>
            </div>
          )}

          {invites.filter(i => !i.usedBy).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">待接受的邀请：</p>
              {invites.filter(i => !i.usedBy).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <code className="text-xs bg-gray-100 px-1 rounded mr-2">{inv.code}</code>
                    <span className="text-xs text-gray-500">{ROLE_LABELS[inv.role] || inv.role}</span>
                    {inv.expiresAt && (
                      <span className="text-xs text-gray-400 ml-2">
                        过期: {new Date(inv.expiresAt).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteInvite(inv.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    撤销
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-200" />

        {/* Agent Tokens */}
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Agent 连接令牌</h3>
          <p className="text-xs text-gray-500 mb-3">
            为每台宿主机生成独立令牌，在宿主机上运行 <code className="bg-gray-100 px-1 rounded">devrelay configure --token &lt;令牌&gt;</code> 建立连接。
          </p>

          {/* New token one-time display */}
          {newToken && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
              <p className="text-xs text-yellow-800 mb-2 font-medium">令牌 "{newToken.name}" 已生成，请立即复制（仅显示一次）：</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white px-2 py-1.5 rounded border border-yellow-300 font-mono break-all">
                  {newToken.token}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(newToken.token); }}
                  className="px-3 py-1.5 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 shrink-0"
                >
                  复制
                </button>
              </div>
              <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded p-2">
                <p className="font-medium mb-1">在宿主机上运行：</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-green-700 bg-white px-2 py-1.5 rounded border border-gray-200 break-all select-all">
                    devrelay configure --token {newToken.token} --url {window.location.origin}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`devrelay configure --token ${newToken.token} --url ${window.location.origin}`); }}
                    className="px-2 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 shrink-0"
                  >
                    复制
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewToken(null)}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                关闭
              </button>
            </div>
          )}

          {/* Token list */}
          {tokens.length > 0 && (
            <div className="space-y-2 mb-3">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${t.online ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{t.tokenPreview}</code>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${t.online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.online ? '在线' : '离线'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        创建: {new Date(t.createdAt).toLocaleDateString('zh-CN')}
                        {t.lastSeenAt && (
                          <span className="ml-2">最后连接: {new Date(t.lastSeenAt).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {fullTokens[t.id] && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(`devrelay configure --token ${fullTokens[t.id]} --url ${window.location.origin}`); }}
                        className="text-xs text-blue-500 hover:text-blue-700"
                        title="复制配置命令"
                      >
                        复制
                      </button>
                    )}
                    <button
                      onClick={() => handleRevokeToken(t.id, t.name)}
                      disabled={tokenLoading}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      撤销
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tokens.length === 0 && !showCreateForm && (
            <p className="text-sm text-gray-400 mb-3">暂无令牌</p>
          )}

          {/* Create form */}
          {showCreateForm ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="令牌名称（如：生产服务器）"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleGenerateToken}
                disabled={tokenLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {tokenLoading ? '生成中...' : '确认'}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTokenName(''); }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              生成令牌
            </button>
          )}
        </div>

        <hr className="border-gray-200" />

        {/* Danger zone */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800">危险区域</h3>
          <p className="text-sm text-red-600 mt-1 mb-4">删除空间将同时删除所有关联的项目、仓库和智能体。</p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '删除中...' : '删除此空间'}
          </button>
        </div>
      </div>
    </div>
  );
}
