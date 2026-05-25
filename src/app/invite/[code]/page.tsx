'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DetailSkeleton } from '@/components/ui/SkeletonLoader';

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;

  const [info, setInfo] = useState<{ workspaceName: string; role: string } | null>(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/invitations/${code}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setInfo(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('无法加载邀请信息');
        setLoading(false);
      });
  }, [code]);

  async function handleAccept() {
    setAccepting(true);
    setError('');
    const res = await fetch(`/api/invitations/${code}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      router.push('/workspaces');
    } else {
      setError(data.error || '接受邀请失败');
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <DetailSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card p-8 max-w-md w-full text-center">
        {error ? (
          <div>
            <div className="text-red-500 text-lg mb-4">邀请无效</div>
            <p className="text-gray-600 text-sm">{error}</p>
          </div>
        ) : info ? (
          <div>
            <h1 className="text-xl font-bold mb-2">加入工作空间</h1>
            <p className="text-gray-600 mb-4">
              你被邀请加入 <strong>{info.workspaceName}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              角色: {info.role}
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="btn-primary w-full"
            >
              {accepting ? '加入中...' : '接受邀请'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
