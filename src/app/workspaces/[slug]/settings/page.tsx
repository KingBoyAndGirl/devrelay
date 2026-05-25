'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CopyButton from '@/components/ui/CopyButton';

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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

    const res = await fetch(`/api/workspaces/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success('设置已保存');
      router.push(`/workspaces/${data.slug}`);
    } else {
      const data = await res.json();
      toast.error(data.error || '更新失败');
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
    setDeleting(true);
    const res = await fetch(`/api/workspaces/${slug}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('空间已删除');
      router.push('/');
    } else {
      const data = await res.json();
      toast.error(data.error || '删除失败');
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="px-6 py-4">
        <h1 className="text-lg font-bold">空间设置</h1>
      </div>
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {error && (
          <div className="alert-error">{error}</div>
        )}

        {/* Basic Info */}
        <form onSubmit={handleSave} className="space-y-4">
          <h3 className="section-title">基本信息</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">空间名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={3}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>

        <hr className="border-gray-200" />

        {/* Members */}
        <div>
          <h3 className="section-title mb-3">
            成员管理
            <span className="text-gray-400 font-normal ml-2">{members.length} 人</span>
          </h3>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">暂无成员</p>
          ) : (
            <div className="space-y-2 mb-4">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between card px-4 py-3">
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
          <h3 className="section-title mb-3">邀请成员</h3>
          <div className="flex items-center gap-2 mb-3">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="select"
            >
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button
              onClick={handleCreateInvite}
              disabled={creatingInvite}
              className="btn-primary"
            >
              {creatingInvite ? '生成中...' : '生成邀请链接'}
            </button>
          </div>

          {inviteLink && (
            <div className="alert-success p-3 mb-3">
              <p className="text-sm text-green-700 mb-1">邀请链接已生成：</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-green-300 truncate">
                  {inviteLink}
                </code>
                <CopyButton text={inviteLink} className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 inline-flex items-center gap-1" />
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
        <div className="alert-error p-5 rounded-xl">
          <h3 className="font-semibold">危险区域</h3>
          <p className="text-sm mt-1 mb-4">删除空间将同时删除所有关联的项目、仓库和智能体。</p>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="btn-danger"
          >
            {deleting ? '删除中...' : '删除此空间'}
          </button>
        </div>
      </div>
      <ConfirmModal
        open={confirmDelete}
        title="删除空间"
        message="确定要删除此空间吗？此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
