type Lang = 'zh' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  zh: {
    // Header
    'status.idle': '等待中',
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
    'example.1': '智能日程助手',
    'example.2': '在线教育平台',
    'example.3': '健康管理 App',

    // Chat
    'chat.send': '发送',

    // Options
    'options.custom': '或输入自己的想法…',
    'options.done': '确认完成，没有修改意见',
    'options.finalize': '确认完成，请输出最终版本的 PRD 和 Tech Spec',

    // Empty state
    'empty.title': '准备开始产品规划',
    'empty.step1': '产品经理收集需求',
    'empty.step2': '生成需求文档和技术方案',
    'empty.step3': '迭代修改，确认输出最终版',

    // Messages
    'msg.thinking': '思考中...',
    'msg.speaking': '发言中',
    'msg.ended': '对话已结束，可在左侧输入新产品名开始新规划',

    // Phases (timeline)
    'phase.discover': '需求收集',
    'phase.draft': '文档生成',
    'phase.iterate': '迭代优化',

    // Collapsible
    'doc.expand': '展开',
    'doc.collapse': '折叠',

    // Crew / agent labels
    'crew.pm.tag': 'PM 角色',
    'crew.tl.tag': 'TL 角色',
    'agent.pm': '产品经理',
    'agent.dev': '技术主管',

    // Locale name for LLM
    'locale.name': 'Chinese (简体中文)',

    // History
    'history.title': '历史记录',
    'history.delete': '删除',
    'history.loading': '加载中...',
  },
  en: {
    'status.idle': 'Waiting',
    'status.running': 'Running',
    'status.completed': 'Completed',
    'status.error': 'Error',
    'lang.switch': '中文',

    'input.label': 'Product Name',
    'input.placeholder': 'Enter product name, e.g. Smart Calendar',
    'input.start': 'Start Planning',
    'input.running': 'Running...',
    'input.examples': 'Quick Examples',
    'example.1': 'Smart Calendar',
    'example.2': 'Online Education Platform',
    'example.3': 'Health Management App',

    'chat.send': 'Send',

    'options.custom': 'Or type your own thought…',
    'options.done': 'Looks good, no changes needed',
    'options.finalize': 'Confirmed. Please output the final PRD and Tech Spec.',

    'empty.title': 'Ready to Plan',
    'empty.step1': 'PM gathers requirements',
    'empty.step2': 'Generate PRD and Tech Spec',
    'empty.step3': 'Iterate and confirm final version',

    'msg.thinking': 'Thinking...',
    'msg.speaking': 'is speaking',
    'msg.ended': 'Conversation ended. Enter a new product name on the left to start again.',

    'phase.discover': 'Discovery',
    'phase.draft': 'Drafting',
    'phase.iterate': 'Iteration',

    'doc.expand': 'expand',
    'doc.collapse': 'collapse',

    'crew.pm.tag': 'PM',
    'crew.tl.tag': 'TL',
    'agent.pm': 'Product Manager',
    'agent.dev': 'Tech Lead',

    'locale.name': 'English',

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
