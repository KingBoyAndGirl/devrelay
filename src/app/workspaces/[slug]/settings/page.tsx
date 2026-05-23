'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

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

  useEffect(() => {
    loadWorkspace();
    loadMembers();
    loadInvites();
  }, [slug]);

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
