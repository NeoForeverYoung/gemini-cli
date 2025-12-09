# Gemini CLI 学习计划（可勾选清单）

面向希望循序渐进掌握 Gemini CLI 及 AI
Agent 开发的路线。每个阶段都包含阅读材料与实践任务，建议从上到下按序完成。

## 0. 环境与基础

- [x] 克隆/更新仓库，运行 `npm install`，确认能执行 `npm test -- --listTests`。
- [x] 浏览
      `README.md`、`docs/index.md`，记录核心名词（Agent、Tool、Hook、Policy）。
- [x] 打开 `.gemini/settings.json`，理解默认配置项与 schema（参考
      `schemas/settings.schema.json`）。

## 1. 架构速览（细化执行单）

目标：读完后能画出数据流，知道入口文件、核心服务和工具调用链，并能在本地跑最小交互验证。

- [x] 阅读 `docs/architecture.md`、`docs/core/index.md`，并在
      `mdocs/architecture-mermaid.md` 或手绘里落盘模块关系。
- [ ] 探索代码入口与核心模块（建议依次执行，做笔记到
      `mdocs/notes/arch-notes.md`）：
  - [ ] CLI 入口与 UI：`packages/cli/src/gemini.tsx`（`startInteractiveUI`、`main`），梳理启动流程 -> 配置加载 ->
        UI 渲染。
  - [ ] 命令层：浏览 `packages/cli/src/ui/commands` 下的内置命令（尤其
        `/restore`、`/chat`），记录命令注册方式和 action 签名。
  - [ ] 流水线主 hook：`packages/cli/src/ui/hooks/useGeminiStream.ts`，标记“用户输入 → 模型回复/工具请求 → 批准/执行 → 历史更新”的关键函数。
  - [ ] Core 对外接口：`packages/core/index.ts` 和
        `packages/core/src/core`（logger、config、services），确认 CLI 如何调用 Core。
  - [ ] 工具注册：快速扫 `packages/core/src/tools`
        目录结构，记下文件读写、shell、检索类工具的位置。
- [ ] 绘制数据流（放 `mdocs/notes/dataflow.md`），至少覆盖：
  - [ ] 用户输入从 CLI 到 Core 的传递路径（函数/模块名）。
  - [ ] 模型请求工具的决策点（在哪判断/调度工具）。
  - [ ] 工具执行到结果返回的路径，以及在哪落盘/更新历史。
- [ ] 最小交互实操：
  - [ ] 本地运行：`npm run cli -- --help`、输入一条用户消息（不调用工具），观察输出。
  - [ ] 触发只读工具：执行 `list_directory` 或
        `read_file`，观察是否需要批准、历史如何更新。
  - [ ] （如开启 checkpointing）批准一次写入类工具前后，确认是否生成 checkpoint 文件于
        `~/.gemini/tmp/<hash>/checkpoints`。
- [ ] 自检与总结：
  - [ ] 在 `mdocs/notes/arch-notes.md` 记录：入口文件、关键函数、数据流节点。
  - [ ] 补一条“我现在能解释的流程”短文（100 字），放在同一文件，用于后续复盘。

## 2. CLI 与命令层（后续粗略，按需细化）

- [ ] 阅读 `docs/cli` 目录中的 `index.md`、`get-started`
      小节，列出常用命令与参数。
- [ ] 跑一遍典型流程：创建会话、调用工具、退出；把输入/输出片段存入
      `mdocs/notes/cli-session.md`。
- [ ] 跑 `integration-tests/list_directory.test.ts`
      中的场景手动复现，理解 CLI 行为与测试的对应关系。

## 3. 核心执行与工具系统

- [ ] 阅读
      `docs/core/tools-api.md`、`docs/core/policy-engine.md`，弄清工具注册、调用链、策略校验。
- [ ] 打开 `packages/core/src/tools`
      下的实现，挑 1-2 个工具（如文件读写）标注调用路径。
- [ ] 实践：新增一个“echo-json”工具（仅本地实验，可放
      `packages/core/src/tools/experimental/echoJson.ts`），并在 CLI 中调用验证。

## 4. Hook 与可扩展性

- [ ] 阅读 `docs/hooks` 目录，理解 before/after 钩子的执行时机。
- [ ] 查看
      `integration-tests/hooks-system.*`，把事件顺序和断言整理到一张时序表。
- [ ] 实践：编写一个简单 Hook（例如在 before-tool 里记录调用计数），放入
      `packages/cli/src/hooks/experimental/metricsHook.ts`，并通过 CLI 实测。

## 5. Policy / 安全与权限

- [ ] 阅读 `docs/policy-engine.md` 与
      `bundle/policies/*.toml`，理解策略语法与评估流程。
- [ ] 实践：编写一份自定义策略（如限制写文件路径），放入
      `bundle/policies/read-only-local.toml`，通过 CLI 加载测试（记录命令与效果）。

## 6. 记忆与上下文管理

- [ ] 阅读 `docs/core/memport.md`，梳理记忆存取 API。
- [ ] 追踪一个涉及记忆的测试（如
      `integration-tests/save_memory.test.ts`），标注输入/输出与持久化位置。
- [ ] 实践：为 CLI 增加一个“小结”命令原型，复用现有记忆接口，将会话摘要写入本地文件（实验分支即可）。

## 7. 端到端测试与质量

- [ ] 阅读 `docs/integration-tests.md` 与
      `integration-tests/test-helper.ts`，了解测试基座。
- [ ] 本地运行选定测试集：`npm run test -- --runInBand integration-tests/hooks-system.test.ts`，记录耗时与易碎点。
- [ ] 为你的实验功能（echo-json 工具或 Hook）补一条最小 E2E 测试，放在
      `integration-tests/experimental/`。

## 8. 扩展与 IDE 集成（可选进阶）

- [ ] 阅读 `docs/extensions/index.md` 与
      `docs/extensions/getting-started-extensions.md`。
- [ ] 在 `packages/vscode-ide-companion`
      浏览激活与命令注册流程，标注与核心通信接口。
- [ ] 实践：实现一个最小“Hello Extension”命令并在 VS Code 开发者模式下验证。

## 9. 性能、诊断与发布

- [ ] 阅读 `docs/release-confidence.md` 与
      `docs/troubleshooting.md`，整理常见故障与排查步骤。
- [ ] 跑一次 `npm run lint` 与 `npm run build`，记录问题与解决方案。
- [ ] 总结一份“贡献检查单”放入
      `mdocs/checklists/contribution.md`（包含测试、格式、文档）。

## 10. 阶段性复盘

- [ ] 每完成一章，在 `mdocs/notes/progress.md` 添加所学要点、踩坑与下一步计划。
- [ ] 选择一项实践成果（工具/Hook/策略/扩展）写一篇 300 字以内的实现说明，便于日后提交 PR。
- [ ] 列出后续想探索的议题（如模型替换、并行工具调用、流式输出），形成 backlog。

> 建议节奏：0-2 完成于第 1 周；3-5 于第 2 周；6-7 于第 3 周；8-9 视精力进阶。所有产出集中在
> `mdocs/` 便于复盘与版本控制。\*\*\*
