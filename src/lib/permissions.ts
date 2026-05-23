export type Role = 'admin' | 'pm' | 'architect' | 'developer' | 'qa' | 'delivery_manager';

export interface PermissionItem {
  id: string;
  label: string;
  roles: Role[];
}

export interface PermissionArea {
  area: string;
  items: PermissionItem[];
}

export const ALL_ROLES: Role[] = ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  pm: '产品经理',
  architect: '架构师',
  developer: '开发工程师',
  qa: '测试工程师',
  delivery_manager: '交付经理',
};

export const ROLE_BADGES: Record<Role, string> = {
  admin: 'bg-red-100 text-red-700',
  pm: 'bg-yellow-100 text-yellow-700',
  architect: 'bg-purple-100 text-purple-700',
  developer: 'bg-blue-100 text-blue-700',
  qa: 'bg-green-100 text-green-700',
  delivery_manager: 'bg-orange-100 text-orange-700',
};

export const PERMISSIONS: PermissionArea[] = [
  {
    area: '工作空间',
    items: [
      { id: 'ws.delete',      label: '删除工作空间',       roles: ['admin'] },
      { id: 'ws.edit',        label: '修改名称/描述',     roles: ['admin'] },
      { id: 'ws.invite',      label: '邀请成员',          roles: ['admin', 'pm'] },
      { id: 'ws.remove',      label: '移除成员',          roles: ['admin'] },
      { id: 'ws.manage_agent', label: '管理 Agent',       roles: ['admin', 'pm'] },
      { id: 'ws.connect_repo', label: '连接仓库',         roles: ['admin', 'pm'] },
    ],
  },
  {
    area: '项目',
    items: [
      { id: 'proj.create',       label: '创建项目',           roles: ['admin', 'pm', 'architect'] },
      { id: 'proj.archive',      label: '归档/恢复项目',      roles: ['admin', 'pm'] },
      { id: 'proj.delete',       label: '删除项目',           roles: ['admin'] },
      { id: 'proj.assign_agent', label: '分配 Agent 到项目',   roles: ['admin', 'pm'] },
      { id: 'proj.modify_roles', label: '修改阶段角色要求',    roles: ['admin', 'pm'] },
    ],
  },
  {
    area: '阶段',
    items: [
      { id: 'stage.approve',       label: '通过/驳回阶段',   roles: ['admin', 'pm', 'architect', 'delivery_manager'] },
      { id: 'stage.auto_assign',   label: '自动分配 Agent',  roles: ['admin', 'pm'] },
      { id: 'stage.comment',       label: '添加阶段评论',    roles: ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'stage.exec_pm',       label: '执行需求/PRD/拆分/验收', roles: ['admin', 'pm'] },
      { id: 'stage.exec_arch',     label: '执行原型/方案/评审',     roles: ['admin', 'architect'] },
      { id: 'stage.exec_dev',      label: '执行开发/监控',         roles: ['admin', 'developer'] },
      { id: 'stage.exec_qa',       label: '执行测试',              roles: ['admin', 'qa'] },
      { id: 'stage.exec_deploy',   label: '执行部署',              roles: ['admin', 'delivery_manager'] },
    ],
  },
  {
    area: '任务',
    items: [
      { id: 'task.create',     label: '创建任务',         roles: ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'task.delete',     label: '删除任务',         roles: ['admin', 'pm'] },
      { id: 'task.change_status', label: '修改任务状态',  roles: ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'task.execute',    label: '执行 Agent 任务',  roles: ['admin', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'task.create_issue', label: '创建 GitHub Issue', roles: ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'task.create_pr',  label: '创建 PR（自动）',   roles: ['developer'] },
    ],
  },
  {
    area: '其他',
    items: [
      { id: 'other.trigger_deploy',  label: '触发部署',       roles: ['admin', 'delivery_manager'] },
      { id: 'other.view_deploy',     label: '查看部署状态',   roles: ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'other.feedback',        label: '提交反馈/Bug',  roles: ['admin', 'pm', 'architect', 'developer', 'qa', 'delivery_manager'] },
      { id: 'other.sync_issues',     label: '同步 Issues',   roles: ['admin', 'pm'] },
    ],
  },
];

export function getDefaultPermissions(role: Role): string[] {
  return PERMISSIONS.flatMap(area =>
    area.items.filter(item => item.roles.includes(role)).map(item => item.id)
  );
}

export function getCustomPermissions(role: Role, selected: string[]): string[] {
  const defaults = new Set(getDefaultPermissions(role));
  return selected.filter(id => !defaults.has(id));
}

export function getRemovedPermissions(role: Role, selected: string[]): string[] {
  const defaults = getDefaultPermissions(role);
  return defaults.filter(id => !selected.includes(id));
}
