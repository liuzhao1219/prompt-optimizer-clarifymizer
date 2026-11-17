import { describe, it, expect } from 'vitest'
import { DiscoveryService } from '../../../src/services/discovery/service'
import type { Message } from '../../../src/services/llm/types'
import type { SpecItem } from '../../../src/services/discovery/types'

/** 按调用顺序返回预设回复的假模型，用来在不联网、不需要 API key 的情况下跑完整流程 */
class FakeLLMService {
  public readonly calls: { messages: Message[]; modelKey: string }[] = []
  private readonly replies: string[]

  constructor(replies: string[]) {
    this.replies = [...replies]
  }

  async sendMessage(messages: Message[], modelKey: string): Promise<string> {
    this.calls.push({ messages, modelKey })
    return this.replies.shift() ?? '{"stage":"done"}'
  }
}

const QUESTIONS_ROUND_1 = '```json\n' + JSON.stringify({
  stage: 'questions',
  questions: [
    { id: 'q1', text: 'What is the deliverable?', why: 'Decides output format', ifSkipped: 'Output format will be guessed' },
    { id: 'q2', text: 'Who reads it?', why: 'Decides tone', ifSkipped: 'Tone will be guessed' },
  ],
  assumptions: ['You want Chinese output', 'You want a single file'],
}) + '\n```'

const QUESTIONS_ROUND_2 = JSON.stringify({
  stage: 'questions',
  questions: [{ id: 'q3', text: 'Any length limit?', why: 'Decides scope', ifSkipped: 'Length will be guessed' }],
  assumptions: [],
})

const SPEC_REPLY = JSON.stringify({
  stage: 'spec',
  items: [
    { id: 's1', dimension: 'Deliverable', value: 'One-page report', source: 'said' },
    { id: 's2', dimension: 'Audience', value: 'Product managers', source: 'confirmed' },
    // Unknown source must be downgraded to pending, never to a confirmed fact
    { id: 's3', dimension: 'Tone', value: 'Plain language', source: 'guessed' },
    { id: 's4', dimension: 'Empty', value: '', source: 'said' },
  ],
})

function setup(replies: string[]) {
  const llm = new FakeLLMService(replies)
  return { llm, service: new DiscoveryService(llm) }
}

describe('DiscoveryService runtime flow', () => {
  it('rejects empty input or missing model key', async () => {
    const { service } = setup([])
    await expect(service.start('', 'model-a')).rejects.toThrow('rawInput is empty')
    await expect(service.start('draw a black hole', '')).rejects.toThrow('modelKey is required')
    expect(() => new DiscoveryService(undefined as never)).toThrow('ILLMService is required')
  })

  it('starts a session, strips JSON fences and exposes assumptions without guessing', async () => {
    const { llm, service } = setup([QUESTIONS_ROUND_1])
    const session = await service.start('draw a black hole', 'model-a')

    expect(session.status).toBe('asking')
    expect(session.rounds).toBe(1)
    expect(session.pendingQuestions).toHaveLength(2)
    expect(session.assumptions).toEqual(['You want Chinese output', 'You want a single file'])
    expect(session.spec).toEqual([])
    // system rules + original requirement are actually sent to the model
    expect(llm.calls[0].messages[0].role).toBe('system')
    expect(llm.calls[0].messages[0].content).toContain('需求澄清官')
    expect(llm.calls[0].messages[1].content).toContain('draw a black hole')
    expect(llm.calls[0].modelKey).toBe('model-a')
  })

  it('caps questions at 5 per round and keeps the conversation history', async () => {
    const many = JSON.stringify({
      stage: 'questions',
      questions: Array.from({ length: 8 }, (_, i) => ({
        id: `q${i}`, text: `Question ${i}?`, why: 'why', ifSkipped: 'risk',
      })),
      assumptions: [],
    })
    const { llm, service } = setup([many, QUESTIONS_ROUND_2])
    const session = await service.start('a vague idea', 'model-a')
    expect(session.pendingQuestions).toHaveLength(5)

    const reply = await service.answer(session.id, 'It is for a poster', 'model-a')
    expect(reply.stage).toBe('questions')
    expect(session.rounds).toBe(2)
    // The answer and the previous assistant reply must be visible to the model
    const history = llm.calls[1].messages
    expect(history.some((m) => m.role === 'user' && m.content.includes('It is for a poster'))).toBe(true)
    expect(history.some((m) => m.role === 'assistant')).toBe(true)
  })

  it('moves to spec review when the model says done', async () => {
    const { service } = setup([QUESTIONS_ROUND_1, '{"stage":"done"}'])
    const session = await service.start('a vague idea', 'model-a')
    const reply = await service.answer(session.id, 'No more questions', 'model-a')
    expect(reply.stage).toBe('done')
    expect(session.status).toBe('reviewing')
    expect(session.pendingQuestions).toEqual([])
  })

  it('builds a spec card, downgrades unknown sources and never auto-confirms', async () => {
    const { service } = setup([QUESTIONS_ROUND_1, '{"stage":"done"}', SPEC_REPLY])
    const session = await service.start('a vague idea', 'model-a')
    await service.answer(session.id, 'done', 'model-a')
    const items = await service.buildSpec(session.id, 'model-a')

    expect(items).toHaveLength(3) // empty value filtered out
    expect(items.every((item) => item.confirmed === false)).toBe(true)
    expect(items.find((item) => item.id === 's3')?.source).toBe('pending')
    expect(items.find((item) => item.id === 's1')?.source).toBe('said')
  })

  it('blocks generation until every spec item is confirmed', async () => {
    const { service } = setup([QUESTIONS_ROUND_1, '{"stage":"done"}', SPEC_REPLY])
    const session = await service.start('a vague idea', 'model-a')
    await service.answer(session.id, 'done', 'model-a')
    const items = await service.buildSpec(session.id, 'model-a')

    const partial: SpecItem[] = items.map((item, index) => ({ ...item, confirmed: index === 0 }))
    await service.updateSpec(session.id, partial)
    expect(service.getSession(session.id)?.status).toBe('reviewing')
    await expect(service.toTargetPrompt(session.id)).rejects.toThrow('not fully confirmed')

    await service.updateSpec(session.id, items.map((item) => ({ ...item, confirmed: true })))
    expect(service.getSession(session.id)?.status).toBe('ready')
    const text = await service.toTargetPrompt(session.id)
    expect(text).toContain('- Deliverable：One-page report')
    expect(text).toContain('- Audience：Product managers')
    expect(service.getSession(session.id)?.status).toBe('done')
  })

  it('skip reports unresolved risks before clearing them', async () => {
    const { service } = setup([QUESTIONS_ROUND_1])
    const session = await service.start('a vague idea', 'model-a')
    const { risks } = await service.skip(session.id)
    expect(risks).toContain('Output format will be guessed')
    expect(risks).toContain('Tone will be guessed')
    expect(risks).toContain('unverified assumption: You want Chinese output')
    expect(service.getSession(session.id)?.skipped).toBe(true)
    expect(service.getSession(session.id)?.pendingQuestions).toEqual([])
  })

  it('reject writes back to the spec card instead of patching the prompt', async () => {
    const { service } = setup([QUESTIONS_ROUND_1, '{"stage":"done"}', SPEC_REPLY])
    const session = await service.start('a vague idea', 'model-a')
    await service.answer(session.id, 'done', 'model-a')
    const items = await service.buildSpec(session.id, 'model-a')
    await service.updateSpec(session.id, items.map((item) => ({ ...item, confirmed: true })))

    const touched = await service.reject(session.id, 'tool-guessed', 'The tone is wrong', 'model-a')
    expect(touched).toContain('s3')
    expect(service.getSession(session.id)?.status).toBe('reviewing')
    // Statements taken from the user's own words stay confirmed; only inferred
    // items are sent back for review. Nothing is silently rewritten in the prompt.
    const spec = service.getSession(session.id)?.spec ?? []
    expect(spec.find((item) => item.id === 's1')?.confirmed).toBe(true)
    expect(spec.filter((item) => item.source !== 'said').every((item) => item.confirmed === false)).toBe(true)
  })

  it('stops asking after 5 rounds', async () => {
    const round = JSON.stringify({
      stage: 'questions',
      questions: [{ id: 'q', text: 'More detail?', why: 'why', ifSkipped: 'risk' }],
      assumptions: [],
    })
    const { service } = setup(Array(8).fill(round))
    const session = await service.start('a vague idea', 'model-a')
    for (let i = 0; i < 6; i += 1) {
      await service.answer(session.id, `answer ${i}`, 'model-a')
    }
    expect(session.rounds).toBe(5)
    expect(session.status).toBe('reviewing')
  })

  it('explains malformed model output instead of silently guessing', async () => {
    const { service } = setup(['Sorry, I cannot help with that'])
    await expect(service.start('a vague idea', 'model-a')).rejects.toThrow('did not return a JSON object')
  })
})
