/**
 * Runtime smoke test for the optional need-discovery workflow.
 * Opens the built web app in a real browser, clicks the new button and
 * verifies the drawer renders without crashing the app.
 *
 * Usage (after `pnpm build:web` and a running preview server):
 *   node scripts/smoke-discovery.mjs [baseURL]
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.argv[2] || 'http://127.0.0.1:4173/'
const errors = []
const result = { baseURL, pageLoaded: false, buttonFound: false, drawerOpened: false, errors }

/** Reuse whichever Chromium is already cached locally; fall back to system Edge. */
function findCachedBrowser() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
  if (!root || !fs.existsSync(root)) return null
  for (const dir of fs.readdirSync(root).sort().reverse()) {
    const candidate = path.join(root, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

const browserExecutable = findCachedBrowser()
result.browser = browserExecutable || 'system Edge (channel)'
const launchOptions = { headless: true }
if (browserExecutable) launchOptions.executablePath = browserExecutable
else launchOptions.channel = 'msedge'
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`)
})

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('body', { timeout: 15000 })
  await page.waitForTimeout(4000)
  result.pageLoaded = true
  result.title = await page.title()
  result.bodySnippet = (await page.locator('body').innerText()).slice(0, 400)
  await page.screenshot({ path: 'D:/po-smoke-1-home.png', fullPage: false })

  const button = page.locator('[data-testid="basic-system-discovery-open"]')
  result.buttonFound = (await button.count()) > 0
  if (result.buttonFound) {
    result.buttonText = (await button.first().innerText()).trim()
    await button.first().click({ timeout: 10000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: 'D:/po-smoke-2-drawer.png', fullPage: false })
    const drawerText = await page.locator('.n-drawer').innerText().catch(() => '')
    result.drawerText = drawerText.slice(0, 600)
    result.drawerOpened = drawerText.length > 0
  }
} catch (error) {
  errors.push(`smoke: ${error.message}`)
} finally {
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
process.exit(result.pageLoaded && result.buttonFound && result.drawerOpened && errors.length === 0 ? 0 : 1)
