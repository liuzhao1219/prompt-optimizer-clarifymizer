# NOTICE — Attribution, Modifications and License

> 中文摘要：本仓库是 Prompt Optimizer 的非官方 fork。原作品版权归 linshenkx（2025），本分支改动版权归 liuzhao1219（2026-11-17），**整部作品继续按 AGPL-3.0-only 发布**：不得闭源、不得改许可证；部署成网络服务须按第 13 条提供源码入口。详见下文与 [FORK-NOTES.md](FORK-NOTES.md)。

## 1. Original work

| | |
|---|---|
| Name | Prompt Optimizer |
| Copyright | Copyright (C) 2025 linshenkx |
| Source | https://github.com/linshenkx/prompt-optimizer |
| License | GNU Affero General Public License, version 3 **only** (AGPL-3.0-only) |

The full, unmodified license text is in [LICENSE](LICENSE). The original copyright notice at the head of that file is preserved verbatim.

## 2. Modifications in this repository

| | |
|---|---|
| Copyright of modifications | Copyright (C) 2026 liuzhao1219 |
| Date of modification | 2026-11-17 |
| Nature | Adds an **optional** "need discovery" pre-step: dynamic clarifying questions, explicit disclosure of assumptions, a user-confirmable specification card, a strict-formatting template that forbids adding or changing content, and result-to-spec writeback. Original optimization behaviour is unchanged and can be used directly at any time. |
| Extent | 12 new files and 6 modified upstream files (~1390 insertions, 3 deletions). The file-level list is in [FORK-NOTES.md](FORK-NOTES.md#32-文件清单相对上游-develop共-18-个约-1390-行新增--3-行删除). |

In accordance with AGPL section 5(a), every modified upstream source file carries a prominent header notice stating that it was changed, giving this date and pointing to this NOTICE file:

```
packages/core/src/index.ts
packages/core/src/services/template/default-templates/index.ts
packages/ui/src/components/basic-mode/BasicSystemWorkspace.vue
packages/ui/src/i18n/locales/zh-CN/index.ts
packages/ui/src/i18n/locales/en-US/index.ts
packages/ui/src/i18n/locales/zh-TW/index.ts
```

New files added by this fork contain no upstream code except where they import and call upstream APIs in the ordinary course of extension.

## 3. License of the combined work

This repository, including all modifications, is distributed under **AGPL-3.0-only**, the same license as the original work. Accordingly:

- You may use, study, modify and redistribute it under AGPL-3.0-only, but you may **not** relicense it, remove attribution, or distribute a closed-source derivative.
- All copyright notices and this NOTICE must be retained.
- If you run a modified version as a network service, **section 13** requires offering all users interacting with it an opportunity to receive the Corresponding Source. Because this repository is public, a visible link to it in the service UI satisfies that requirement.
- The AGPL license text itself in [LICENSE](LICENSE) is unmodified. Nothing here grants additional permissions beyond that license.

## 4. No affiliation or endorsement

This is an **unofficial fork**. It is not affiliated with, endorsed, sponsored by, or maintained by linshenkx or the upstream Prompt Optimizer project. The name "Prompt Optimizer", its marks and its upstream documentation belong to the original author; this fork claims no rights to them.

README content below the fork notice, links to the upstream website, hosted services, badges, documentation site and sponsorship pages are upstream material and do not describe services offered by this fork.

## 5. Contact

Issues and pull requests: use this repository's own issue tracker. For matters concerning the original project, please contact the upstream project instead.
