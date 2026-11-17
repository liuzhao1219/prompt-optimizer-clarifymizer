# 关于这个 fork：动机、改动与后续

> 一句话对外表述：**这是 [Prompt Optimizer](https://github.com/linshenkx/prompt-optimizer) 的一个非官方分支，在原项目「把一段提示词整理、补全、结构化」的能力之前，加了一个可跳过的「先把需求问清楚、逐条确认、再严格按规格输出」环节。**

本文写给两类人：想弄明白「这个分支跟原项目到底差在哪」的使用者，以及想在此基础上继续改的人。英文 README 与中文 README 顶部各有一段精简版。

---

## 1. 上游做了什么（我们保留了全部）

上游 `linshenkx/prompt-optimizer` 是一个**提示词优化器**：你写好一段提示词（或从模板导入），它调用大模型把这段话改写得更完整、更结构化，之后可以测试、对比、评估、收藏、管理版本。

- 形态：Web、桌面、Chrome 插件、Docker、MCP；纯前端、数据存浏览器本地；支持直连自定义模型与本地 Ollama。
- 能力：系统/用户提示词优化、迭代优化、多模型对比与评测、文生图 / 图生图 / 多图、模板管理与导入导出、收藏与历史、多语言界面。
- 内置模板：`optimize/general-optimize`（固定六段 `Role / Profile / Skills / Rules / Workflows / Initialization`）、`optimize/analytical-optimize`、`image-optimize/text2image/*` 等，另有针对用户提示词与不同图像模型的适配模板。

**准确概括**：把一段话（不论清晰或模糊、完整或片面）按内置框架，补成更完整的结构化输出。整理和结构化是它做的；**「补」的内容来自模型的默认，不是来自用户**。

本分支保留了上述全部内容：四个原有模式、全部内置模板、优化按钮、对比评测、收藏、MCP、构建与测试脚本，一行未删。仓库里自「项目简介」以下的 README 正文、文档站链接、徽章、官网与赞助信息都是上游原始材料，归上游所有。

## 2. 我们为什么做（想解决什么问题）

三类具体场景暴露出同一个缺口：

1. **「我想法很乱，想让 AI 帮我写个提示词」** —— 上游能把混乱变成看起来整齐的一页纸，但整齐来自那六个固定段落，不是需求被理清了。
2. **「我想生成一张图，希望它深刻理解我要什么、以及我潜在想要什么」** —— 上游有多套图像模板，但那是「用哪种写法适配哪个模型」，不是「问你想要什么画面」。
3. **「需求我已经说清了」** —— 最后一步仍可能被模板按框架重新补满。

内置模板里的原句是最直接的证据：

| 模板 | 原句 | 后果 |
|---|---|---|
| `general-optimize` | 输出必须是 `# Role / Profile / Skills / Rules / Workflows / Initialization` 六段 | 结构先于需求 |
| `analytical-optimize` | 「每个部分都要有具体内容，不要使用空泛模板占位符」；「Suggestions 部分应该专注于角色内在的工作方法，而不是与用户互动的策略」 | 明令禁止与用户互动；每节必须填满，只能编 |
| `creative-text2image` | 「缺失上下文：视为开启史诗级奇思妙想的创作契机」；「仅输出提示词，不添加任何多余解释」；「避免使用宇宙、星空等浮夸词汇」 | 用户没说的由模型补，甚至把用户原词改掉，且不解释 |

所以问题不是「模板不够多」，而是**缺口信息由谁补**：工具问出来、模型猜、还是看结果再改。上游在「目标模型的脾气」上做了很多工作，在「用户的意图」上几乎没有交互。多几套模板只是组合数变多，不是理解变深。

还有一个必须承认的边界：**没说出口的需求分三种**——心里有只是没写（能问出来）、事前自己也不知道、看到结果才反弹「不对」（问不出来，只能靠看到结果再改）、只认某张参考图（只能靠举例逼近）。「先问清楚」只对第一类直接有效，第二类必须留「生成 → 看 → 回写规格」的回路。

## 3. 我们做了什么

### 3.1 流程

| 步骤 | 行为 | 对应实现 |
|---|---|---|
| 0 入口 | 基础模式输入区标题栏新增「先问清楚」按钮，默认关闭、不拦人 | `BasicSystemWorkspace.vue` 的 `header-extra` |
| 1 动态提问 | 不预设固定维度表单；从用户这一轮的话里临时生成缺口，一次最多 5 问，按「不问就一定做错」排序，开放式、不给选项 | `need-discovery.ts`、`discovery/service.ts` |
| 2 暴露假设 | 明确区分「我明确说的 / 我需要但没说的 / 你准备替我猜的」；不许把猜测写成事实，不许用「通常来说」代替提问 | 同上 |
| 3 继续追问 | 根据回答里新冒出来的缺口再问一轮，最多 5 轮；「跳过」前先列出未答项会怎样影响结果 | 同上 |
| 4 规格卡 | 每条标明来源（我说的 / 我确认的 / 仍待定），逐条可改、可删、可打勾；**没全绿不许写提示词** | `spec-card.ts`、`DiscoveryPanel.vue` |
| 5 严格格式化 | 新增模板，硬规则只有一条：只按规格卡已有条目组织语言，**禁止新增、禁止改词、禁止填空、禁止套固定章节** | `strict-spec-format.ts` |
| 6 结果回写 | 结果被否时先判原因（我事前不知道 / 我没表达清 / 工具猜错 / 模型没做到），回写规格卡，不许直接改提示词蒙混 | `service.ts` 的 `reject()` |
| 跳过 | 每一轮常驻「不问了，直接出结果」，点了只关抽屉、输入框原样不动，完全走上游原流程 | `DiscoveryPanel.vue` 的 `skip` |

**为什么必须有第 5 步**：确认好的规格卡如果丢给内置优化模板，会被六段框架把没说的补回来，甚至把「宇宙」改掉，前面几轮全白挖。严格格式化模板是整条链路的关键，不是可选美化。

**为什么不做成第五个功能模式**：`FunctionMode` 枚举散落在路由、偏好、收藏、数据导入导出和十几处测试里，新增一个值会波及十几个文件，跟「少改老文件、方便跟上游合并」直接冲突。改成在一个已有插槽上挂按钮，最终**只修改了 6 个上游文件**。

### 3.2 文件清单（相对上游 `develop`，共 18 个、约 1390 行新增 / 3 行删除）

**新增 12 个**

```
packages/core/src/services/discovery/types.ts                     # 会话与规格卡类型
packages/core/src/services/discovery/service.ts                   # 状态机、JSON 容错、全绿校验、回写
packages/core/src/services/template/default-templates/discovery/need-discovery.ts
packages/core/src/services/template/default-templates/discovery/spec-card.ts
packages/core/src/services/template/default-templates/discovery/strict-spec-format.ts
packages/ui/src/components/discovery-mode/DiscoveryPanel.vue      # 问答 / 规格卡 / 跳过
packages/ui/src/i18n/locales/{zh-CN,en-US,zh-TW}/discovery.ts    # 三语言文案
packages/core/tests/unit/discovery/service.test.ts                # 10 个单元测试
scripts/smoke-discovery.mjs                                       # 快速冒烟
scripts/smoke-discovery-e2e.mjs                                   # 浏览器端到端
```

**修改 6 个**（每个文件头部都有 2026-11-17 的改动声明，见 `NOTICE.md`）

```
packages/core/src/index.ts                                        # 导出 discovery 类型与服务
packages/core/src/services/template/default-templates/index.ts     # 注册严格格式化模板
packages/ui/src/components/basic-mode/BasicSystemWorkspace.vue     # 按钮、抽屉、服务装配、回填
packages/ui/src/i18n/locales/{zh-CN,en-US,zh-TW}/index.ts         # 注册新文案
```

> 只有 `strict-spec-format` 注册进模板列表；`need-discovery` 与 `spec-card` 是内部模板，故意不出现在用户下拉框里，避免被误选。

### 3.3 验证到哪一步

- 独立工具链（Node 24.22.3 + pnpm 10.6.1）下 `typecheck:core`、`typecheck:ui`、`build:core/ui/web`、`check:locale`、`check:no-chinese-runtime`、`test:repo` 全部通过。
- 10 个单元测试（假模型、不联网）覆盖 JSON 容错、5 问上限、对话历史、来源标注、全绿才放行、跳过风险、结果回写、5 轮封顶、坏输出报错。
- 浏览器端到端（真 Chromium + 假的 OpenAI 兼容模型，不联网、不用 API key）：问答 → 规格卡 → 逐条确认 → 回填 → 自动切到严格格式化 → 点原「优化」，请求体里确实带严格规则、**不含**通用优化的六段框架 → 跳过路径输入框原样不动。5 次调用、0 个 JS 错误。
- 抓到并修掉一个编译查不出的真 bug：`strict-spec-format` 原本标成 `userOptimize` 类型，基础模式只列 `optimize`，界面会把它判为失效并回退到「通用优化」。**光把模板注册进 `ALL_TEMPLATES` 不够，必须出现在目标模式按类型筛选的列表里。**

**还没验证**：接真实大模型（需要配 API key 或本机 Ollama）。自动化测试用的是假模型，验证的是行为规则；真实模型肯不肯按规则输出纯 JSON、追问质量如何，需要实际上手试。

## 4. 如何继续优化（欢迎接手）

按「改动成本低 → 高」排，每项都给了下手位置：

| 方向 | 具体做法 | 入口 |
|---|---|---|
| 真实模型验证与规则调优 | 用 Ollama / 常用在线模型跑几轮真实需求，看模型是否稳定输出约定 JSON、问题是否够具体；把失败样本补进单元测试 | `discovery/need-discovery.ts`、`spec-card.ts` |
| 规格卡持久化与复用 | 会话目前只在内存里，刷新即丢；接项目现成的 Dexie/IndexedDB 存储，支持「另存为规格模板」 | `discovery/service.ts`、`services/storage/` |
| 接入图像模式 | 把澄清环节挂到 `image-mode`，让规格卡维度覆盖主体/构图/光线/材质/风格/负面词/画幅，再交给图像模板 | `ui/src/components/image-mode/` |
| 澄清轮数自适应 | 现在是固定上限；可按输入长度、复杂度判断、用户历史跳过率动态调整，减少打扰 | `service.ts` 的轮次控制 |
| 追问质量评估 | 加一个「这条问题不问会不会做错」的自评，或记录用户改了哪些规格条目，反推提问有效性 | `DiscoveryPanel.vue` |
| 更多目标写法 | 严格格式化目前是一套通用规则，可按目标模型（含中文图像模型）出多个版本 | `default-templates/discovery/` |
| 测试补强 | 现在只有一个基础模式的 E2E；可加高级模式、用户提示词模式、跳过路径的回归测试 | `scripts/smoke-discovery-e2e.mjs` |
| 跟上游同步 | 上游活跃更新，尽量保持「只加新文件、少改老文件」；合并冲突集中在那 6 个修改文件 | 见下节 |

**贡献方式**：直接开 issue 或提 PR 即可；改动请保持中英文文案键对齐（仓库有 `check:locale-parity`）、运行时文案走 i18n（`check:no-chinese-runtime`）。因为许可证是 AGPL-3.0-only，**任何衍生作品都必须同样以 AGPL-3.0-only 开源**，不能改成 MIT 或闭源；如果部署成给别人用的网站，记得按第 13 条给使用者一个能看到源码的入口（本仓库是公开仓库，界面挂个链接即可）。

**与上游保持同步**：本仓库有一条 `develop`（上游原版）和一条可正常开 PR 的改造分支。早期因为网络问题曾用源码压缩包重建过一次仓库，产生了一条**独立起点、与 develop 无共同祖先**的初版快照分支；那条分支保留作存档，**不要用它开 PR**。请以基于 `develop`、只有净改动的改造分支为准，GitHub 的 compare 能正常显示这 18 个文件。

## 5. 致谢

感谢 **linshenkx** 及 Prompt Optimizer 的所有上游贡献者做出这个成熟、活跃、工程扎实的项目。本分支只在其前面加了一道可跳过的门，绝大部分能力——模板体系、模型适配、评测对比、五种部署形态、多语言界面——都来自上游。也感谢社区里关于「先澄清再生成」的公开讨论（如 UPA 的强制澄清循环、spec-kit 的可编辑规格与回写机制），它们启发了本分支的规则设计。

本分支与上游**无关联**，未获其背书；上游的名称、商标与文档归原作者所有。

## 6. 版权与许可（摘要）

| | |
|---|---|
| 原始作品 | Prompt Optimizer，Copyright (C) 2025 linshenkx，AGPL-3.0-only |
| 本分支改动 | Copyright (C) 2026 liuzhao1219，日期 2026-11-17，同样 AGPL-3.0-only |
| 完整声明 | [NOTICE.md](NOTICE.md) |
| 许可证全文 | [LICENSE](LICENSE)（AGPL-3.0 正文未作任何修改） |

不得删除版权声明、不得改许可证、不得闭源分发；网络服务需按第 13 条提供 Corresponding Source。每个被修改的上游源文件头部都附有修改日期与指向 `NOTICE.md` 的声明（AGPL 第 5 条 (a)）。
