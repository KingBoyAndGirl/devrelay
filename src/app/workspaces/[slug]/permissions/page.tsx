'use client';

import { ROLE_LABELS, STAGE_NAMES, STAGE_DEFAULT_ROLES } from '@/types';

const ROLES = ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] as const;

interface PermissionRow {
  area: string;
  capability: string;
  admin: boolean | string;
  pm: boolean | string;
  architect: boolean | string;
  developer: boolean | string;
  qa: boolean | string;
  delivery_manager: boolean | string;
}

const WORKSPACE_PERMISSIONS: PermissionRow[] = [
  { area: '工作空间', capability: '删除工作空间', admin: '创建者', pm: false, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '工作空间', capability: '修改名称/描述', admin: true, pm: false, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '工作空间', capability: '邀请成员', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '工作空间', capability: '移除成员', admin: true, pm: false, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '工作空间', capability: '管理 Agent', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '工作空间', capability: '连接仓库', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
];

const PROJECT_PERMISSIONS: PermissionRow[] = [
  { area: '项目', capability: '创建项目', admin: true, pm: true, architect: true, developer: false, qa: false, delivery_manager: false },
  { area: '项目', capability: '归档/恢复项目', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '项目', capability: '删除项目', admin: true, pm: '创建者', architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '项目', capability: '分配 Agent 到项目', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '项目', capability: '修改阶段角色要求', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
];

const STAGE_PERMISSIONS: PermissionRow[] = [
  { area: '阶段', capability: '通过/驳回阶段', admin: true, pm: true, architect: true, developer: false, qa: false, delivery_manager: true },
  { area: '阶段', capability: '自动分配 Agent', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '阶段', capability: '添加阶段评论', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '阶段', capability: '执行对应阶段', admin: '—', pm: '需求/PRD/拆分/验收', architect: '原型/方案/评审', developer: '开发/监控', qa: '测试', delivery_manager: '部署' },
];

const TASK_PERMISSIONS: PermissionRow[] = [
  { area: '任务', capability: '创建任务', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '任务', capability: '删除任务', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
  { area: '任务', capability: '修改任务状态', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '任务', capability: '执行 Agent 任务', admin: true, pm: false, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '任务', capability: '创建 GitHub Issue', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '任务', capability: '创建 PR', admin: '—', pm: '—', architect: '—', developer: '自动', qa: '—', delivery_manager: '—' },
];

const OTHER_PERMISSIONS: PermissionRow[] = [
  { area: '部署', capability: '触发部署', admin: true, pm: false, architect: false, developer: false, qa: false, delivery_manager: true },
  { area: '部署', capability: '查看部署状态', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '反馈', capability: '提交反馈/Bug', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: '通知', capability: '查看通知', admin: true, pm: true, architect: true, developer: true, qa: true, delivery_manager: true },
  { area: 'GitHub', capability: '同步 Issues', admin: true, pm: true, architect: false, developer: false, qa: false, delivery_manager: false },
];

function renderCell(value: boolean | string) {
  if (value === true) {
    return <td className="px-3 py-2.5 text-center"><span className="inline-block w-5 h-5 rounded bg-green-100 text-green-700 text-xs leading-5">✓</span></td>;
  }
  if (value === false) {
    return <td className="px-3 py-2.5 text-center"><span className="inline-block w-5 h-5 rounded bg-gray-100 text-gray-400 text-xs leading-5">—</span></td>;
  }
  return <td className="px-3 py-2.5 text-center text-xs text-gray-600">{value}</td>;
}

function PermissionTable({ title, rows }: { title: string; rows: PermissionRow[] }) {
  return (
    <div className="mb-8">
      <h3 className="font-semibold mb-3 text-gray-800">{title}</h3>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs w-20">模块</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">操作</th>
              {ROLES.map(role => (
                <th key={role} className="px-3 py-2.5 font-medium text-gray-500 text-xs text-center min-w-[72px]">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2.5 text-xs text-gray-400 font-medium">{row.area}</td>
                <td className="px-3 py-2.5 text-xs text-gray-700">{row.capability}</td>
                {renderCell(row.admin)}
                {renderCell(row.pm)}
                {renderCell(row.architect)}
                {renderCell(row.developer)}
                {renderCell(row.qa)}
                {renderCell(row.delivery_manager)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <div>
      <div className="px-6 py-4 border-b border-gray-100">
        <h1 className="text-lg font-bold">角色权限说明</h1>
        <p className="text-sm text-gray-500 mt-1">各角色在工作空间中的操作权限一览</p>
      </div>

      <main className="max-w-5xl mx-auto p-6">
        {/* Legend */}
        <div className="flex items-center gap-6 mb-6 text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded bg-green-100 text-green-700 text-xs leading-4 text-center">✓</span> 可操作
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded bg-gray-100 text-gray-400 text-xs leading-4 text-center">—</span> 无权限
          </span>
          <span className="text-gray-400">文字说明 = 限制条件或特殊规则</span>
        </div>

        <PermissionTable title="工作空间管理" rows={WORKSPACE_PERMISSIONS} />
        <PermissionTable title="项目管理" rows={PROJECT_PERMISSIONS} />
        <PermissionTable title="阶段操作" rows={STAGE_PERMISSIONS} />
        <PermissionTable title="任务管理" rows={TASK_PERMISSIONS} />
        <PermissionTable title="其他" rows={OTHER_PERMISSIONS} />

        {/* Stage-Role default mapping */}
        <div className="mb-8">
          <h3 className="font-semibold mb-3 text-gray-800">13 阶段默认角色分配</h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs w-12">#</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">阶段名称</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">默认负责角色</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 13 }, (_, i) => i + 1).map(step => (
                  <tr key={step} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{String(step).padStart(2, '0')}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700">{STAGE_NAMES[step]}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        {ROLE_LABELS[STAGE_DEFAULT_ROLES[step]] || STAGE_DEFAULT_ROLES[step]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
