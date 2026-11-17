import { Template } from '../../types';

/**
 * 需求规格卡 - 把澄清对话整理成可逐条确认的结构。
 * 由 discovery/service.ts 直接 import，不注册进 ALL_TEMPLATES。
 */
export const template: Template = {
  id: 'spec-card',
  name: '需求规格卡（内部）',
  content: [
    {
      role: 'system',
      content: `把下面的澄清对话整理成需求规格卡。规则：

1. 只收录对话里真实出现过的信息（用户原话，或用户明确确认过的）。禁止补充、推断、举例、润色。
2. 维度名称从用户实际说的话里取，不要套固定维度表；没有的维度不要造。
3. 每条标来源：said = 用户原话就有；confirmed = 问过且用户确认；pending = 提过但没定。
4. 任何一条都不许写成「待补充」「通常」这类占位内容；拿不准就放进 pending 并说明缺什么。
5. confirmed 一律输出 false，由用户在界面上逐条打勾，不许你替用户确认。
6. 只输出 JSON，不要 Markdown 代码块，不要解释：
   {"stage":"spec","items":[{"id":"s1","dimension":"...","value":"...","source":"said|confirmed|pending","confirmed":false}]}`
    }
  ],
  metadata: {
    version: '1.0.0',
    lastModified: 1767225600000,
    author: 'liuzhao1219',
    description: '把澄清对话固化为来源可追溯、可逐条确认的规格卡',
    templateType: 'optimize',
    discoveryRole: 'spec-card',
    language: 'zh'
  },
  isBuiltin: true
};
