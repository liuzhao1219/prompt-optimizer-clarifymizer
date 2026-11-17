/**
 * End-to-end runtime test for the optional need-discovery workflow.
 *
 * Runs the BUILT web app in a real browser with a fake OpenAI-compatible model
 * (no API key, no network, no account). It injects a runtime model config via
 * /config.js and intercepts the model HTTP calls with Playwright routing.
 *
 * Prerequisites: `pnpm build:web` and a preview server on the given URL.
 * Usage: node scripts/smoke-discovery-e2e.mjs [baseURL]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.argv[2] || 'http://127.0.0.1:4173/'
const FAKE_BASE_URL = 'http://127.0.0.1:4999/v1'
const errors = []
const result = {
  baseURL,
  steps: [],
  pageLoaded: false,
  buttonEnabled: false,
  drawerOpened: false,
  questionsShown: false,
  specShown: false,
  specApplied: false,
  strictTemplateSelected: false,
  skipWorked: false,
  promptUnchangedAfterSkip: false,
  strictTemplateSent: false,
  generalTemplateSent: false,
  errors,
}

function step(name, detail) {
  result.steps.push({ name, detail })
}

function findCachedBrowser() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
  if (!root || !fs.existsSync(root)) return null
  for (const dir of fs.readdirSync(root).sort().reverse()) {
    const candidate = path.join(root, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

const QUESTIONS = JSON.stringify({
  stage: 'questions',
  questions: [
    { id: 'q1', text: 'What should the final image be used for?', why: 'Decides aspect ratio', ifSkipped: 'Aspect ratio will be guessed' },
    { id: 'q2', text: 'Any style you definitely do NOT want?', why: 'Avoids unwanted defaults', ifSkipped: 'Style will be guessed' },
  ],
  assumptions: ['You want a single image, not a series'],
})

const SPEC = JSON.stringify({
  stage: 'spec',
  items: [
    { id: 's1', dimension: 'Subject', value: 'Black hole accretion disk', source: 'said' },
    { id: 's2', dimension: 'Usage', value: 'Article hero image', source: 'confirmed' },
    { id: 's3', dimension: 'Excluded style', value: 'No cartoon style', source: 'pending' },
  ],
})

const browserExecutable = findCachedBrowser()
result.browser = browserExecutable || 'system Edge (channel)'
const launchOptions = { headless: true }
if (browserExecutable) launchOptions.executablePath = browserExecutable
else launchOptions.channel = 'msedge'
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 200)}`)
})

// 1) Inject a fake custom model through the app's own runtime config hook.
await page.route('**/config.js', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `window.runtime_config = ${JSON.stringify({
    VITE_CUSTOM_API_KEY: 'sk-smoke-test',
    VITE_CUSTOM_API_BASE_URL: FAKE_BASE_URL,
    VITE_CUSTOM_API_MODEL: 'fake-smoke-model',
  })};`,
}))

// 2) Answer every model call locally. Call order: questions -> done -> spec -> questions (skip round).
let modelCalls = 0
const requestBodies = []
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
await page.route('**/chat/completions*', async (route) => {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS, body: '' })
  }
  modelCalls += 1
  const requestBody = route.request().postData() || ''
  requestBodies.push(requestBody)
  // The optimizer uses streaming; answer with an SSE chunk stream like a real provider.
  if (/"stream"\s*:\s*true/.test(requestBody)) {
    const chunk = (delta, finishReason) => 'data: ' + JSON.stringify({
      id: `chatcmpl-smoke-${modelCalls}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'fake-smoke-model',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    }) + '\n\n'
    const sse = chunk({ role: 'assistant', content: 'Formatted prompt text' }, null)
      + chunk({}, 'stop') + 'data: [DONE]\n\n'
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { ...CORS, 'Cache-Control': 'no-cache' },
      body: sse,
    })
  }
  const content = modelCalls === 1 ? QUESTIONS
    : modelCalls === 2 ? '{"stage":"done"}'
      : modelCalls === 3 ? SPEC
        : modelCalls === 4 ? QUESTIONS
          : 'Formatted prompt text'
  const body = {
    id: `chatcmpl-smoke-${modelCalls}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'fake-smoke-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })
})

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4500)
  result.pageLoaded = true
  result.title = await page.title()

  // 3) The injected runtime config makes a model available automatically.
  //    We only probe the dropdown for diagnostics; no manual selection is needed.
  const modelPlaceholder = page.getByText('请选择模型', { exact: false }).first()
  if (await modelPlaceholder.count()) {
    await modelPlaceholder.click({ timeout: 8000 })
    await page.waitForTimeout(900)
    result.modelOptions = (await page.locator('.n-base-select-option, [role="option"]').allInnerTexts()).slice(0, 12)
    await page.keyboard.press('Escape')
  }
  await page.screenshot({ path: 'D:/po-e2e-1-model.png' })

  // 4) Type a deliberately vague requirement, exactly the user's scenario.
  const promptBox = page.locator('textarea').first()
  if (await promptBox.count()) {
    await promptBox.fill('I want an image of a black hole, but I am not sure what I really need.')
  }

  const button = page.locator('[data-testid="basic-system-discovery-open"]')
  result.buttonEnabled = await button.isEnabled().catch(() => false)
  result.modelReady = result.buttonEnabled
  step('model', `injected model ready=${result.modelReady}, options=${JSON.stringify(result.modelOptions || [])}`)
  step('button', `enabled=${result.buttonEnabled}`)

  if (result.buttonEnabled) {
    await button.click({ timeout: 10000 })
    await page.waitForTimeout(2500)
    const drawerText = await page.locator('.n-drawer').innerText().catch(() => '')
    result.drawerText = drawerText.slice(0, 700)
    result.drawerOpened = drawerText.length > 0
    result.questionsShown = drawerText.includes('What should the final image be used for?')
    await page.screenshot({ path: 'D:/po-e2e-2-questions.png' })
    step('questions', `drawer=${result.drawerOpened} questions=${result.questionsShown} calls=${modelCalls}`)

    // 5) Answer once; fake model replies "done" and the spec card is built.
    if (result.drawerOpened) {
      const answerBox = page.locator('.n-drawer textarea').first()
      if (await answerBox.count()) {
        await answerBox.fill('For an article hero image, definitely no cartoon style.')
      }
      const submit = page.locator('.n-drawer button').filter({ hasText: /提交|Submit/ }).first()
      if (await submit.count()) await submit.click({ timeout: 8000 })
      await page.waitForTimeout(2500)
      const specText = await page.locator('.n-drawer').innerText().catch(() => '')
      // Spec values live in <textarea>, so innerText cannot see them. Read values explicitly.
      const specValues = await page.locator('.n-drawer textarea')
        .evaluateAll((nodes) => nodes.map((node) => node.value)).catch(() => [])
      result.specValues = specValues
      result.specShown = specText.includes('需求规格卡')
        && specText.includes('Subject')
        && specText.includes('仍待定')
        && specValues.some((value) => value.includes('Black hole accretion disk'))
      result.specText = specText.slice(0, 700)
      await page.screenshot({ path: 'D:/po-e2e-3-spec.png' })
      step('spec', `shown=${result.specShown} values=${JSON.stringify(specValues)} calls=${modelCalls}`)

      // 6) Confirm every item, then generate; spec text should be filled back
      //    and the strict-formatting template should be selected automatically.
      const boxes = page.locator('.n-drawer .n-checkbox')
      const count = await boxes.count()
      for (let i = 0; i < count; i += 1) {
        await boxes.nth(i).click()
      }
      await page.waitForTimeout(400)
      const generate = page.locator('.n-drawer button').filter({ hasText: /按规格卡生成|Generate|生成/ }).first()
      if (await generate.count() && await generate.isEnabled()) {
        await generate.click({ timeout: 8000 })
        await page.waitForTimeout(1500)
        const promptValue = await page.locator('textarea').first().inputValue().catch(() => '')
        result.specApplied = promptValue.includes('Black hole accretion disk')
        result.promptAfterApply = promptValue.slice(0, 300)
        const pageText = await page.locator('body').innerText().catch(() => '')
        result.strictTemplateSelected = pageText.includes('严格格式化')
      }
      await page.screenshot({ path: 'D:/po-e2e-4-applied.png' })
      step('apply', `specApplied=${result.specApplied} strictTemplate=${result.strictTemplateSelected}`)

      // 7) Skip path: reopen the drawer, choose "just give me the result",
      //    and verify the original prompt is left completely untouched.
      await button.click({ timeout: 10000 })
      await page.waitForTimeout(1800)
      const skipButton = page.locator('.n-drawer button').filter({ hasText: /不问了|直接出结果/ }).first()
      if (await skipButton.count()) {
        await skipButton.click({ timeout: 8000 })
        await page.waitForTimeout(1000)
        result.skipWorked = !(await page.locator('.n-drawer').isVisible().catch(() => false))
        const afterSkip = await page.locator('textarea').first().inputValue().catch(() => '')
        result.promptUnchangedAfterSkip = afterSkip.includes('Black hole accretion disk')
      }
      step('skip', `closed=${result.skipWorked} promptUnchanged=${result.promptUnchangedAfterSkip}`)

      // 8) Click the original Optimize button and inspect what is actually sent
      //    to the model. The strict-formatting rules MUST be present; the
      //    general-optimizer Role/Profile/Skills scaffolding MUST NOT be present.
      const optimizeButton = page.getByRole('button', { name: '优化', exact: true }).first()
      if (await optimizeButton.count()) {
        await optimizeButton.click({ timeout: 8000 })
        await page.waitForTimeout(3000)
        const optimizeRequests = requestBodies.slice(4)
        result.strictTemplateSent = optimizeRequests.some((text) =>
          text.includes('绝对禁止') && text.includes('规格卡'))
        result.generalTemplateSent = optimizeRequests.some((text) =>
          text.includes('# Role') || text.includes('Profile') || text.includes('Skills'))
        result.optimizeRequestSnippet = optimizeRequests.map((text) => text.slice(0, 200))
        step('optimize', `strictSent=${result.strictTemplateSent} generalSent=${result.generalTemplateSent} calls=${modelCalls}`)
      }
    }
  }
} catch (error) {
  errors.push(`e2e: ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
}

result.modelCalls = modelCalls
const passed = result.pageLoaded && result.buttonEnabled && result.drawerOpened
  && result.questionsShown && result.specShown && result.specApplied
  && result.strictTemplateSelected && result.skipWorked && result.promptUnchangedAfterSkip
  && result.strictTemplateSent && !result.generalTemplateSent
  && errors.length === 0
result.passed = passed
console.log(JSON.stringify(result, null, 2))
process.exit(passed ? 0 : 1)
