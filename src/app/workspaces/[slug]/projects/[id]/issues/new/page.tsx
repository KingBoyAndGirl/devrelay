'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Plus, X, GripVertical, ChevronDown } from 'lucide-react';
import { STAGE_POOL, ISSUE_TEMPLATES } from '@/types';

const ISSUE_TYPES = [
  { value: 'feature', label: '功能' },
  { value: 'bug', label: 'Bug' },
  { value: 'improvement', label: '改进' },
];

const PRIORITIES = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '紧急' },
];

export default function NewIssuePage() {
  const routeParams = useParams();
  const router = useRouter();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('feature');
  const [priority, setPriority] = useState('medium');
  const [selectedTemplate, setSelectedTemplate] = useState('feature-dev');
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Set stages when template changes
  useEffect(() => {
    const template = ISSUE_TEMPLATES[selectedTemplate];
    if (template && template.stages.length > 0) {
      setSelectedStages([...template.stages]);
    }
  }, [selectedTemplate]);

  function addStage(stageName: string) {
    if (!selectedStages.includes(stageName)) {
      setSelectedStages([...selectedStages, stageName]);
    }
  }

  function removeStage(index: number) {
    setSelectedStages(selectedStages.filter((_, i) => i !== index));
  }

  function moveStage(from: number, to: number) {
    if (to < 0 || to >= selectedStages.length) return;
    const next = [...selectedStages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSelectedStages(next);
  }

  function toggleStageFromPool(stageName: string) {
    if (selectedStages.includes(stageName)) {
      setSelectedStages(selectedStages.filter((s) => s !== stageName));
    } else {
      setSelectedStages([...selectedStages, stageName]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (selectedStages.length === 0) {
      toast.error('请至少选择一个阶段');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description || null,
          type,
          priority,
          stageNames: selectedStages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Issue 已创建 (${data.stageCount} 个阶段)`);
        router.push(`/workspaces/${slug}/projects/${projectId}`);
      } else {
        const err = await res.json();
        toast.error(err.error || '创建失败');
      }
    } catch {
      toast.error('创建失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  const template = ISSUE_TEMPLATES[selectedTemplate];

  return (
    <div className="max-w-3xl mx-auto px-6 pb-8">
      {/* Header */}
      <div className="py-4">
        <button
          onClick={() => router.push(`/workspaces/${slug}/projects/${projectId}`)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回看板
        </button>
        <h1 className="text-xl font-bold text-gray-900">提 Issue</h1>
        <p className="text-sm text-gray-500 mt-1">创建功能需求、Bug 或改进提案，自定义交付阶段流程</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">基本信息</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full"
              placeholder="Issue 标题"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">详细描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full"
              rows={4}
              placeholder="描述需求或问题的背景、目标、验收条件..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="select w-full">
                {ISSUE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="select w-full">
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Template selection */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">阶段模板</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(ISSUE_TEMPLATES).map(([key, tmpl]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedTemplate(key)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedTemplate === key
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-medium text-gray-900">{tmpl.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{tmpl.description}</div>
                <div className="text-[10px] text-gray-300 mt-1">{tmpl.stages.length} 个阶段</div>
              </button>
            ))}
          </div>
        </div>

        {/* Stage customization */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-700">
              已选阶段 ({selectedStages.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowStagePicker(!showStagePicker)}
              className="btn btn-ghost btn-sm inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {showStagePicker ? '收起' : '添加阶段'}
            </button>
          </div>

          {/* Stage pool picker */}
          {showStagePicker && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
              {Object.entries(STAGE_POOL).map(([category, stages]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1.5">{category}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((name) => {
                      const isSelected = selectedStages.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleStageFromPool(name)}
                          className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected stages list */}
          <div className="space-y-1">
            {selectedStages.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">尚未选择阶段，请从模板中选择或自定义添加</p>
            ) : (
              selectedStages.map((name, idx) => (
                <div
                  key={`${name}-${idx}`}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <span className="text-gray-300 cursor-grab">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs text-gray-400 font-mono w-6">{idx + 1}</span>
                  <span className="text-sm text-gray-700 flex-1">{name}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveStage(idx, idx - 1)}
                      disabled={idx === 0}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-30 px-0.5"
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStage(idx, idx + 1)}
                      disabled={idx === selectedStages.length - 1}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-30 px-0.5"
                      title="下移"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStage(idx)}
                      className="text-gray-300 hover:text-red-400 px-0.5 ml-1"
                      title="移除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving || !title.trim() || selectedStages.length === 0} className="btn-primary">
            {saving ? '创建中...' : '创建 Issue'}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/workspaces/${slug}/projects/${projectId}`)}
            className="btn btn-ghost"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
