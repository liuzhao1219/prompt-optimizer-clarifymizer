import type { ILLMService, Message } from '../llm/types';
import type { Template } from '../template/types';
import { template as needDiscoveryTemplate } from '../template/default-templates/discovery/need-discovery';
import { template as specCardTemplate } from '../template/default-templates/discovery/spec-card';
import type {
  ClarifyingQuestion,
  DiscoveryReply,
  DiscoverySession,
  DiscoveryTargetMode,
  IDiscoveryService,
  RejectionReason,
  SpecCardReply,
  SpecItem,
} from './types';

const MAX_ROUNDS = 5;
const MAX_QUESTIONS = 5;

/** 内置模板可能写成字符串或多条消息，这里统一取出 system 规则 */
function systemContent(template: Template): string {
  const content = template.content;
  if (typeof content === 'string') return content;
  return content
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
}

/**
 * 模型经常在 JSON 外面包一层 ```json 或加一句解释，做一次保守的剥离。
 * 不猜内容，只找第一个 { 到最后一个 } 之间的部分，交给 JSON.parse 判定。
 */
function parseJsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Discovery: model did not return a JSON object');
  }
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Discovery: model returned invalid JSON shape');
  }
  return parsed as Record<string, unknown>;
}

function asQuestions(value: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .slice(0, MAX_QUESTIONS)
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `q${index + 1}`,
      text: typeof item.text === 'string' ? item.text : '',
      why: typeof item.why === 'string' ? item.why : '',
      ifSkipped: typeof item.ifSkipped === 'string' ? item.ifSkipped : '',
    }))
    .filter((question) => question.text.length > 0);
}

function asSpecItems(value: unknown): SpecItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => {
      // 只接受三种字面量来源，未知值一律降级为「仍待定」，不让模型把猜测写成已确认
      const source: SpecItem['source'] =
        item.source === 'said' ? 'said'
          : item.source === 'confirmed' ? 'confirmed'
            : 'pending';
      return {
        id: typeof item.id === 'string' ? item.id : `s${index + 1}`,
        dimension: typeof item.dimension === 'string' ? item.dimension : '',
        value: typeof item.value === 'string' ? item.value : '',
        source,
        // 服务绝不替用户确认，一律 false，由界面逐条打勾
        confirmed: false,
      };
    })
    .filter((item) => item.dimension.length > 0 && item.value.length > 0);
}

function newId(): string {
  return `disc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 需求澄清服务。
 *
 * 边界：只负责「问清楚 → 规格卡 → 拼成文本」。不生成提示词、不调用优化器。
 * 最后一步由界面拿着 toTargetPrompt() 的结果去调原有 optimizePrompt()，
 * 并指定 templateId='strict-spec-format'，避免确认好的需求被重新脑补。
 */
export class DiscoveryService implements IDiscoveryService {
  private readonly sessions = new Map<string, DiscoverySession>();

  constructor(private readonly llmService: ILLMService) {
    if (!llmService) throw new Error('Discovery: ILLMService is required');
  }

  getSession(sessionId: string): DiscoverySession | undefined {
    return this.sessions.get(sessionId);
  }

  /** 把会话状态还原成给模型看的消息：规则 + 原始需求 + 逐轮问答 */
  private buildMessages(session: DiscoverySession): Message[] {
    const messages: Message[] = [
      { role: 'system', content: systemContent(needDiscoveryTemplate) },
      { role: 'user', content: `原始需求：\n${session.rawInput}` },
    ];
    for (const message of session.messages) {
      if (message.role === 'user' || message.role === 'assistant') {
        messages.push({ role: message.role, content: message.content });
      }
    }
    return messages;
  }

  /** 把模型这一轮的回复追加进会话，同时把问题/假设落到可展示的字段 */
  private applyReply(session: DiscoverySession, reply: DiscoveryReply): void {
    session.messages.push({ role: 'assistant', content: JSON.stringify(reply) });
    if (reply.stage === 'questions') {
      session.pendingQuestions = reply.questions;
      session.assumptions = reply.assumptions;
      session.status = 'asking';
    } else {
      session.pendingQuestions = [];
      session.status = 'reviewing';
    }
  }

  private async ask(session: DiscoverySession, modelKey: string): Promise<DiscoveryReply> {
    if (session.rounds >= MAX_ROUNDS) {
      return { stage: 'done' };
    }
    const messages = this.buildMessages(session);
    const raw = await this.llmService.sendMessage(messages, modelKey);
    const parsed = parseJsonObject(raw);

    if (parsed.stage === 'done') {
      return { stage: 'done' };
    }
    if (parsed.stage !== 'questions') {
      throw new Error('Discovery: unexpected reply stage');
    }
    const questions = asQuestions(parsed.questions);
    if (questions.length === 0) {
      return { stage: 'done' };
    }
    session.rounds += 1;
    const assumptions = Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((item): item is string => typeof item === 'string')
      : [];
    return { stage: 'questions', questions, assumptions };
  }

  async start(rawInput: string, modelKey: string): Promise<DiscoverySession> {
    if (!rawInput?.trim()) throw new Error('Discovery: rawInput is empty');
    if (!modelKey?.trim()) throw new Error('Discovery: modelKey is required');

    const session: DiscoverySession = {
      id: newId(),
      createdAt: Date.now(),
      rawInput,
      messages: [],
      spec: [],
      targetMode: 'basic' as DiscoveryTargetMode,
      status: 'asking',
      skipped: false,
      rounds: 0,
      pendingQuestions: [],
      assumptions: [],
    };
    this.sessions.set(session.id, session);

    const reply = await this.ask(session, modelKey);
    this.applyReply(session, reply);
    return session;
  }

  async answer(sessionId: string, answer: string, modelKey: string): Promise<DiscoveryReply> {
    const session = this.requireSession(sessionId);
    if (!answer?.trim()) throw new Error('Discovery: answer is empty');

    session.messages.push({ role: 'user', content: answer.trim() });
    const reply = await this.ask(session, modelKey);
    this.applyReply(session, reply);
    return reply;
  }

  async skip(sessionId: string): Promise<{ risks: string[] }> {
    const session = this.requireSession(sessionId);
    // 先取风险再清空，否则清空后拿不到未答问题
    const risks = [
      ...session.pendingQuestions.map((question) => question.ifSkipped || question.text),
      ...session.assumptions.map((item) => `unverified assumption: ${item}`),
    ];
    session.skipped = true;
    session.status = 'done';
    session.pendingQuestions = [];
    return { risks };
  }

  async buildSpec(sessionId: string, modelKey: string): Promise<SpecItem[]> {
    const session = this.requireSession(sessionId);
    const transcript = session.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
    const messages: Message[] = [
      { role: 'system', content: systemContent(specCardTemplate) },
      { role: 'user', content: `原始需求：\n${session.rawInput}\n\n澄清对话：\n${transcript}` },
    ];
    const raw = await this.llmService.sendMessage(messages, modelKey);
    const parsed = parseJsonObject(raw) as unknown as SpecCardReply;
    if (parsed.stage !== 'spec') throw new Error('Discovery: spec stage expected');

    session.spec = asSpecItems(parsed.items);
    session.status = 'reviewing';
    return session.spec;
  }

  async updateSpec(sessionId: string, items: SpecItem[]): Promise<void> {
    const session = this.requireSession(sessionId);
    session.spec = items;
    session.status = items.length > 0 && items.every((item) => item.confirmed) ? 'ready' : 'reviewing';
  }

  async toTargetPrompt(sessionId: string): Promise<string> {
    const session = this.requireSession(sessionId);
    const confirmed = session.spec.filter((item) => item.confirmed);
    if (confirmed.length === 0) throw new Error('Discovery: no confirmed spec items');
    if (!session.spec.every((item) => item.confirmed)) {
      throw new Error('Discovery: spec card is not fully confirmed');
    }
    session.status = 'done';
    return confirmed.map((item) => `- ${item.dimension}：${item.value}`).join('\n');
  }

  /**
   * 结果被否时，先归因再回写规格卡。
   * 当前实现保守：把非「用户原话」的条目标回待确认，返回需要复核的 id，
   * 由界面引导用户改条目，而不是直接改提示词蒙混。
   */
  async reject(
    sessionId: string,
    _reason: RejectionReason,
    note: string,
    _modelKey: string,
  ): Promise<string[]> {
    const session = this.requireSession(sessionId);
    const touched: string[] = [];
    session.spec = session.spec.map((item) => {
      if (item.source === 'said' && !note.includes(item.dimension)) return item;
      touched.push(item.id);
      return { ...item, confirmed: false };
    });
    session.status = 'reviewing';
    return touched;
  }

  private requireSession(sessionId: string): DiscoverySession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Discovery: session not found (${sessionId})`);
    return session;
  }
}
