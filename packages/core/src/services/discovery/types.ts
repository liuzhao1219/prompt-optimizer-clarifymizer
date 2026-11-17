import type { Message } from '../llm/types';

/** 规格条目的信息来源。未表达的需求不能伪装成已确认。 */
export type SpecSource = 'said' | 'confirmed' | 'pending';

export interface SpecItem {
  id: string;
  /** 每次从用户这一轮的话里临时生成，不预设检查表 */
  dimension: string;
  value: string;
  source: SpecSource;
  /** 必须由用户在界面上打勾，服务不许代填 true */
  confirmed: boolean;
}

export interface ClarifyingQuestion {
  id: string;
  text: string;
  /** 不问为什么一定会做错，用于排序和向用户解释 */
  why: string;
  /** 用户跳过时，这一项缺失会怎样影响结果 */
  ifSkipped: string;
}

/** 澄清模型每轮的结构化输出，服务靠 stage 判断下一步 */
export type DiscoveryReply =
  | {
      stage: 'questions';
      questions: ClarifyingQuestion[];
      assumptions: string[];
    }
  | { stage: 'done' };

export interface SpecCardReply {
  stage: 'spec';
  items: SpecItem[];
}

export type DiscoveryStatus = 'asking' | 'reviewing' | 'ready' | 'done';

/** 澄清完交给哪种格式化路径 */
export type DiscoveryTargetMode = 'basic' | 'pro' | 'image';

export interface DiscoverySession {
  id: string;
  createdAt: number;
  rawInput: string;
  /** 完整澄清对话历史，每轮原样传给 llmService */
  messages: Message[];
  spec: SpecItem[];
  targetMode: DiscoveryTargetMode;
  status: DiscoveryStatus;
  /** 用户主动跳过；此时直接走原有 optimizePrompt */
  skipped: boolean;
  /** 已问轮数，防止无限追问 */
  rounds: number;
  /** 当前待用户回答的问题 */
  pendingQuestions: ClarifyingQuestion[];
  /** 模型显式列出的假设，必须让用户看见 */
  assumptions: string[];
}

/** 结果被否时，先分类再回写规格卡，不许直接改提示词蒙混 */
export type RejectionReason =
  | 'unknown_before'   // 事前自己也不知道，看到结果才浮现
  | 'unclear_input'    // 我没表达清
  | 'tool_guessed'     // 工具猜错
  | 'model_failed';    // 模型没做到

export interface IDiscoveryService {
  /** 取会话（界面刷新后恢复） */
  getSession(sessionId: string): DiscoverySession | undefined;
  /** 开一轮新会话，返回第一批问题 */
  start(rawInput: string, modelKey: string): Promise<DiscoverySession>;
  /** 用户主动跳过：列出未答项的风险，确认后由界面直接走原有优化器 */
  skip(sessionId: string): Promise<{ risks: string[] }>;
  /** 提交用户答案，返回下一批问题或 done */
  answer(sessionId: string, answer: string, modelKey: string): Promise<DiscoveryReply>;
  /** 澄清结束后生成规格卡（全部 confirmed=false） */
  buildSpec(sessionId: string, modelKey: string): Promise<SpecItem[]>;
  /** 用户在界面上逐条编辑/打勾后回写 */
  updateSpec(sessionId: string, items: SpecItem[]): Promise<void>;
  /** 规格卡全绿后，拼成文本交给原有优化器 */
  toTargetPrompt(sessionId: string): Promise<string>;
  /** 结果被否 → 判定原因 → 回写规格卡；返回需要改的条目 id */
  reject(sessionId: string, reason: RejectionReason, note: string, modelKey: string): Promise<string[]>;
}
