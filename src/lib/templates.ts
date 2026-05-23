import type { Priority } from '@/types';

export interface TemplateTask {
  title: string;
  description?: string;
  priority: Priority;
  stageStep: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  tasks: TemplateTask[];
}

export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  empty: {
    id: 'empty',
    name: '空白项目',
    description: '不预填充任务，从零开始',
    tasks: [],
  },
  'web-app': {
    id: 'web-app',
    name: 'Web 应用',
    description: '前后端分离的 Web 应用，包含需求、设计、开发、测试完整流程',
    tasks: [
      // Stage 1: 需求收集
      { title: '收集用户需求', description: '通过访谈、问卷等方式收集用户需求', priority: 'high', stageStep: 1 },
      { title: '编写需求文档', description: '将需求整理为结构化的需求文档', priority: 'high', stageStep: 1 },
      // Stage 2: PRD编写
      { title: '编写产品需求文档 (PRD)', description: '包含功能描述、用户故事、验收标准', priority: 'high', stageStep: 2 },
      { title: 'PRD 评审', description: '与团队评审 PRD 并修改', priority: 'high', stageStep: 2 },
      // Stage 3: 原型设计
      { title: '设计 UI 原型', description: '使用 Figma 或类似工具设计界面原型', priority: 'high', stageStep: 3 },
      { title: '原型评审', description: '与客户/团队评审原型', priority: 'medium', stageStep: 3 },
      // Stage 4: 技术方案
      { title: '编写技术方案文档', description: '包含架构设计、技术选型、数据模型', priority: 'high', stageStep: 4 },
      { title: 'API 接口设计', description: '定义 RESTful API 或 GraphQL Schema', priority: 'high', stageStep: 4 },
      // Stage 5: 方案评审
      { title: '技术方案评审', description: '架构师团队评审技术方案', priority: 'high', stageStep: 5 },
      // Stage 6: 任务拆分
      { title: '拆分开发任务', description: '将 PRD 和技术方案拆分为可执行的开发任务', priority: 'high', stageStep: 6 },
      // Stage 7: 开发实现
      { title: '搭建前端项目框架', description: '初始化前端项目、配置路由和状态管理', priority: 'high', stageStep: 7 },
      { title: '搭建后端项目框架', description: '初始化后端项目、配置数据库和中间件', priority: 'high', stageStep: 7 },
      { title: '实现核心业务逻辑', description: '开发主要功能模块', priority: 'high', stageStep: 7 },
      { title: '实现前端页面', description: '根据原型开发前端页面', priority: 'medium', stageStep: 7 },
      // Stage 8: 代码评审
      { title: '代码评审', description: '对 PR 进行代码评审', priority: 'high', stageStep: 8 },
      // Stage 9: 测试
      { title: '编写单元测试', description: '覆盖核心业务逻辑', priority: 'high', stageStep: 9 },
      { title: '编写集成测试', description: '测试 API 端到端流程', priority: 'high', stageStep: 9 },
      { title: '执行测试并修复 Bug', description: '运行测试套件，修复发现的问题', priority: 'high', stageStep: 9 },
      // Stage 10: 验收评审
      { title: '验收测试', description: '按 PRD 验收标准逐项测试', priority: 'high', stageStep: 10 },
      // Stage 11: 部署发布
      { title: '部署到生产环境', description: '执行部署流程', priority: 'high', stageStep: 11 },
      // Stage 12: 交付验收
      { title: '客户验收', description: '向客户演示最终产品', priority: 'high', stageStep: 12 },
      // Stage 13: 线上监控与反馈
      { title: '配置监控告警', description: '设置性能监控和错误告警', priority: 'medium', stageStep: 13 },
      { title: '收集用户反馈', description: '建立反馈收集渠道', priority: 'medium', stageStep: 13 },
    ],
  },
  'api-service': {
    id: 'api-service',
    name: 'API 服务',
    description: '后端 API 或微服务，侧重接口设计、性能和安全',
    tasks: [
      { title: '收集 API 需求', description: '确定 API 功能和数据模型', priority: 'high', stageStep: 1 },
      { title: '编写 PRD', description: 'API 功能清单和验收标准', priority: 'high', stageStep: 2 },
      { title: '设计 API 文档', description: 'Swagger/OpenAPI 规范文档', priority: 'high', stageStep: 3 },
      { title: '编写技术方案', description: '架构设计、数据库设计、缓存策略', priority: 'high', stageStep: 4 },
      { title: '数据库 Schema 设计', description: '表结构、索引、迁移方案', priority: 'high', stageStep: 4 },
      { title: '方案评审', priority: 'high', stageStep: 5 },
      { title: '拆分开发任务', priority: 'high', stageStep: 6 },
      { title: '搭建项目框架', description: '初始化项目、配置中间件、错误处理', priority: 'high', stageStep: 7 },
      { title: '实现 API 端点', description: '开发所有 API 端点', priority: 'high', stageStep: 7 },
      { title: '实现认证和鉴权', priority: 'high', stageStep: 7 },
      { title: '代码评审', priority: 'high', stageStep: 8 },
      { title: '编写测试', description: '单元测试 + 集成测试 + 压力测试', priority: 'high', stageStep: 9 },
      { title: '验收测试', priority: 'high', stageStep: 10 },
      { title: '部署发布', priority: 'high', stageStep: 11 },
      { title: '客户验收', priority: 'high', stageStep: 12 },
      { title: '配置 API 监控', description: '请求量、延迟、错误率监控', priority: 'medium', stageStep: 13 },
    ],
  },
  'mobile-app': {
    id: 'mobile-app',
    name: '移动应用',
    description: 'iOS/Android 移动应用，包含跨平台适配和发布流程',
    tasks: [
      { title: '收集用户需求', priority: 'high', stageStep: 1 },
      { title: '编写 PRD', priority: 'high', stageStep: 2 },
      { title: '设计移动端原型', description: 'iOS 和 Android 界面原型', priority: 'high', stageStep: 3 },
      { title: '技术方案', description: '选择跨平台方案 (React Native/Flutter) 或原生', priority: 'high', stageStep: 4 },
      { title: '方案评审', priority: 'high', stageStep: 5 },
      { title: '拆分开发任务', priority: 'high', stageStep: 6 },
      { title: '搭建项目框架', priority: 'high', stageStep: 7 },
      { title: '实现核心功能', priority: 'high', stageStep: 7 },
      { title: '适配多机型', priority: 'medium', stageStep: 7 },
      { title: '代码评审', priority: 'high', stageStep: 8 },
      { title: '测试', description: '功能测试 + 兼容性测试 + 性能测试', priority: 'high', stageStep: 9 },
      { title: '验收测试', priority: 'high', stageStep: 10 },
      { title: '发布到应用商店', description: 'App Store + Google Play 上架', priority: 'high', stageStep: 11 },
      { title: '客户验收', priority: 'high', stageStep: 12 },
      { title: '配置崩溃监控', description: '接入崩溃报告和用户反馈', priority: 'medium', stageStep: 13 },
    ],
  },
};

export function getTemplate(templateId: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES[templateId];
}

export function getTemplateList(): Array<{ id: string; name: string; description: string; taskCount: number }> {
  return Object.values(PROJECT_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    taskCount: t.tasks.length,
  }));
}
