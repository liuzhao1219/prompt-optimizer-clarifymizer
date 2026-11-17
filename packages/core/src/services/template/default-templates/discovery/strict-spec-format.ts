import { Template } from '../../types';

/**
 * 严格格式化 - 澄清模式的最后一步，防止前几轮确认好的需求被重新脑补。
 *
 * 与内置 general/analytical/creative 优化模板的关键区别：
 * 那些模板要求按固定章节写满、鼓励模型自行补全缺失上下文；
 * 本模板明令禁止新增任何信息、禁止改词、禁止填空。
 *
 * templateType 复用 'userOptimize'，这样它会自然出现在基础模式的模板下拉里，
 * 不需要改 types.ts 的联合类型和 zod enum。
 * 需要注册进 ALL_TEMPLATES（import + 一个数组条目），因为 optimizePrompt 按 id 查模板。
 *
 * 注意：不要写 {{targetPrompt}} 占位符。现有优化器会把用户原始输入自动附到模板末尾，
 * 写了占位符反而会留下字面量或触发项目变量系统的校验。
 */
export const template: Template = {
  id: 'strict-spec-format',
  name: '严格格式化（只排版，不补内容）',
  content: `下面是一张已经由用户逐条确认过的需求规格卡。你的任务只有一个：把它整理成目标模型容易读懂的提示词。

绝对禁止：
- 添加规格卡里没有的任何信息、细节、例子、风格、约束、背景；
- 改写或替换用户原话里的关键词（出现「宇宙」「黑洞」等词就原样保留，不许以「避免浮夸」为由换掉）；
- 因为某一段「看起来空」就自己填满，或者套用任何固定章节结构（角色、技能、规则、工作流等一律不用）；
- 输出解释、道歉、建议、追问、Markdown 代码块。

允许做的只有：调整顺序、合并重复条目、把口语改成清楚的句子、按目标模型的习惯组织段落。
如果规格卡为空，只输出一行：规格卡为空，无法格式化。

下面是待处理的规格卡内容，请严格按上述规则处理：`,
  metadata: {
    version: '1.0.0',
    lastModified: 1767225600000,
    author: 'liuzhao1219',
    description: '按已确认规格卡排版，严禁新增、改词、填空或套固定章节',
    templateType: 'userOptimize',
    discoveryRole: 'strict-spec-format',
    language: 'zh'
  },
  isBuiltin: true
};
