// Modified 2026-11-17 (need-discovery fork): register discovery locale. See NOTICE.md.
// Modifications Copyright (C) 2026 liuzhao1219, AGPL-3.0-only.
import arena from './arena'
import workspace from './workspace'
import core from './core'
import favorites from './favorites'
import prompt from './prompt'
import models from './models'
import templates from './templates'
import testing from './testing'
import context from './context'
import image from './image'
import errors from './errors'
import discovery from './discovery'

const messages = {
  ...arena,
  ...workspace,
  ...core,
  ...favorites,
  ...prompt,
  ...models,
  ...templates,
  ...testing,
  ...context,
  ...image,
  ...errors,
  ...discovery,
} as const;

export default messages;
