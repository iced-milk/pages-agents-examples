type Lang = 'zh' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  zh: {
    // Header
    'app.title': '🚀 CrewAI Product Planner',
    'status.idle': '就绪',
    'status.running': '运行中',
    'status.completed': '已完成',
    'status.error': '出错',
    'lang.switch': 'EN',

    // InputPanel
    'input.label': '产品名称',
    'input.placeholder': '输入产品名称，如：智能日程助手',
    'input.start': '开始规划',
    'input.running': '运行中...',
    'input.examples': '快速示例',
    'input.concepts': 'CrewAI 概念',
    'concept.flow': 'Flow — 编排多步骤流程',
    'concept.crew': 'Crew — 协作团队',
    'concept.agent': 'Agent — 自主角色',
    'concept.task': 'Task — 具体任务',
    'example.1': '智能日程助手',
    'example.2': '在线教育平台',
    'example.3': '健康管理App',

    // Empty state
    'empty.title': '准备开始产品规划',
    'empty.desc': '输入产品名称，产品经理、技术主管和老板将依次协作，为你生成完整的产品规划方案。',

    // Messages
    'msg.generating': '⏳ 正在生成产品简报...',
    'msg.done': '🎉 Flow 完成',
    'msg.speaking': '开始发言',
    'msg.thinking': '思考中...',

    // Crew tags
    'crew1.tag': 'Crew1 · 产品协作团队',
    'crew2.tag': 'Crew2 · 高管评审团队',

    // Agent short names
    'agent.pm': '产品经理',
    'agent.dev': '技术主管',
    'agent.boss': '老板',

    // Locale name for LLM
    'locale.name': 'Chinese (简体中文)',

    // History
    'history.title': '历史记录',
    'history.delete': '删除',
    'history.loading': '加载中...',
  },
  en: {
    'app.title': '🚀 CrewAI Product Planner',
    'status.idle': 'Ready',
    'status.running': 'Running',
    'status.completed': 'Completed',
    'status.error': 'Error',
    'lang.switch': '中文',

    'input.label': 'Product Name',
    'input.placeholder': 'Enter product name, e.g. Smart Calendar',
    'input.start': 'Start Planning',
    'input.running': 'Running...',
    'input.examples': 'Quick Examples',
    'input.concepts': 'CrewAI Concepts',
    'concept.flow': 'Flow — Multi-step orchestration',
    'concept.crew': 'Crew — Collaborative team',
    'concept.agent': 'Agent — Autonomous role',
    'concept.task': 'Task — Specific assignment',
    'example.1': 'Smart Calendar',
    'example.2': 'Online Education Platform',
    'example.3': 'Health Management App',

    'empty.title': 'Ready to Plan',
    'empty.desc': 'Enter a product name. Product Manager, Tech Lead and Boss will collaborate in sequence to generate a full product plan.',

    'msg.generating': '⏳ Generating product brief...',
    'msg.done': '🎉 Flow Completed',
    'msg.speaking': 'is speaking',
    'msg.thinking': 'Thinking...',

    'crew1.tag': 'Crew1 · Product Team',
    'crew2.tag': 'Crew2 · Review Board',

    'agent.pm': 'Product Manager',
    'agent.dev': 'Tech Lead',
    'agent.boss': 'Boss',

    'locale.name': 'English',

    // History
    'history.title': 'History',
    'history.delete': 'Delete',
    'history.loading': 'Loading...',
  },
};

let currentLang: Lang = 'en';
let listeners: Array<() => void> = [];

export function initLang(): void {
  const browserLang = navigator.language || '';
  currentLang = browserLang.startsWith('zh') ? 'zh' : 'en';
}

export function getLang(): Lang {
  return currentLang;
}

export function toggleLang(): void {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}

export function getLocaleName(): string {
  return messages[currentLang]['locale.name'];
}

export function t(key: string): string {
  return messages[currentLang][key] || messages['en'][key] || key;
}
