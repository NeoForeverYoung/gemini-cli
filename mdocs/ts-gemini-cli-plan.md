# TypeScript 版 Gemini CLI 复刻计划（含核心能力，分阶段清单）

目标：用 TypeScript/Node 从零实现与 Gemini
CLI 等价的核心能力：交互式 CLI、工具编排、配置/策略、记忆、checkpointing、hooks、slash 命令、日志/可观测、测试与发布。

## 0. 基础设施与技术选型

- [ ] 运行环境：Node 18+（ESM），包管理器建议 pnpm（亦可 npm/yarn）。
- [ ] 构建/打包：esbuild 或 tsup（出单文件/多平台 bundle）；若需 polyfill，使用 esbuild
      plugins。
- [ ] 代码规范：TypeScript strict，eslint（flat config）+
      prettier；测试用 Vitest；lint/format/test 集成 preflight 脚本。
- [ ] 目录约定（单仓）：`src/cli`、`src/core`、`src/tools`、`src/policy`、`src/hooks`、`src/storage`、`src/utils`、`scripts`、`test`、`integration-tests`。
- [ ] 依赖建议：Ink/TUI（可选）、commander/yargs（CLI 解析）、zod（配置/参数校验）、simple-git 或 isomorphic-git（影子仓）、fs-extra、node-fetch/undici、chalk。

## 1. 配置与设置（等价 `.gemini/settings.json` + schema）

- [ ] 设计 settings
      schema（general/model/checkpointing/policy/hooks/tools/telemetry）。
- [ ] 配置加载/合并：全局（HOME/.gemini）、项目级（.gemini/settings.json）、环境变量覆盖；用 zod 校验并给出友好报错。
- [ ] Config 服务：暴露默认模型、超时、max_output_tokens、checkpointing 开关、policy 路径、代理设置、日志级别等。

## 2. CLI 交互与会话层

- [ ] 入口命令：`gemini-cli-ts` 支持交互模式与一次性命令；提供
      `--config`、`--settings`、`--model` 等。
- [ ] 会话/历史管理：内存结构 + 磁盘持久（~/.gemini/tmp/<hash>/logs.json 等价）；支持清屏/重置。
- [ ] 渲染：流式输出、工具请求展示、批准/拒绝；提供 JSON 输出模式。
- [ ] Slash 命令：`/chat save|resume|list|delete|share`、`/restore`、`/clear`，接口可扩展。

## 3. Core 编排与模型适配

- [ ] 模型客户端接口（可先 mock）：sendMessage/stream、tools schema 暴露。
- [ ] Prompt 组装：系统提示 + 历史 + 工具定义 + 用户输入；支持多轮。
- [ ] 工具调用调度：模型请求工具时，进入执行管线，合并结果再回传模型。
- [ ] 错误/重试：超时、重试次数、失败信息回显。

## 4. 工具系统（等价 `packages/core/src/tools`）

- [ ] 工具接口：name/description/schema/execute(context, args)。
- [ ] 内置工具：
  - 文件：read_file、write_file、list_directory、search(ripgrep)、stat。
  - Shell：run_shell_command（可加安全过滤）、stdin 支持。
  - 网络/HTTP（可配置开关）。
  - 其他：clipboard/浏览器 fetch（按需）。
- [ ] 工具注册与权限：按配置/策略决定启用；生成 JSON schema 供模型引用。

## 5. Policy / 权限与安全

- [ ] 支持策略文件（toml/yaml/json 任一）：allow/deny 路径、命令白/黑名单、网络开关、工具可用性。
- [ ] 工具前置校验：执行前评估策略，输出拒绝原因。
- [ ] 支持默认策略模板（read-only / write-limited），可启动加载/热加载。

## 6. Hook 系统（before/after）

- [ ] Hook 点：before-model、after-model、before-tool、after-tool、before-approval、after-approval、session-startup、session-clear、error-handling。
- [ ] Hook API：注册、顺序执行、错误处理/短路；可配置启停。
- [ ] 示例 Hook：审计日志、指标计数、通知输出。

## 7. Checkpointing（影子 Git 仓 + 工具快照）

- [ ] 影子仓：`~/.gemini/history/<project_hash>`，用 simple-git/isomorphic-git，支持 init/commit/restore，并同步 .gitignore。
- [ ] 触发：写入类工具待批准时创建快照 commit。
- [ ] 存储：将 `history`、`toolCall`、`clientHistory`、`commitHash` 写入
      `~/.gemini/tmp/<hash>/checkpoints/<ts>-<file>-<tool>.json`。
- [ ] `/restore`：列出/选择 checkpoint，恢复文件（git restore +
      clean）、恢复会话历史、重新抛出工具调用。

## 8. 记忆与上下文管理

- [ ] 会话历史：内存 + 磁盘缓存，支持截断/摘要接口（可后续接 summarizer）。+- [
      ] 可插拔 memory backend（文件、本地 kv）。
- [ ] `/chat save/resume` 与自动 checkpoint 区分：手动保存对话 vs 自动工具快照。

## 9. 观测性与日志

- [ ] 结构化日志（pino/winston），日志级别可配；`--verbose`。
- [ ] 调试信息：工具请求/响应、token 统计（如可用）。
- [ ] 事件总线：供 hook/metrics 使用。

## 10. 测试与质量

- [ ] 单元测试：配置解析、工具执行、策略评估、hook 链路。
- [ ] 集成测试：mock 模型响应 -> 触发工具 -> 断言文件/日志/输出；可用 snapshot/golden。
- [ ] E2E：最小场景（read_file、write_file + restore、checkpoint
      list/restore）。
- [ ] CI：lint + test + typecheck；可配 pre-commit。

## 11. 发布与分发

- [ ] 构建：esbuild/tsup 输出 cjs/esm；可选 pkg/ncc 打包单文件。
- [ ] 分发：npm/pnpm 包发布；可提供独立可执行（pkg/nexe 可选）。
- [ ] 版本与变更日志：semver + CHANGELOG。

## 里程碑拆分（推荐顺序）

- M1 可运行骨架：配置加载 + 基础 CLI 输入/输出 + 假模型回声 + 日志。
- M2 工具系统：文件只读工具 + 工具注册/调度；最小策略校验（allow-list）。
- M3 模型对接与工具返回：串起“用户输入→模型→工具→返回”闭环。
- M4 Checkpointing：影子仓快照 + `/restore`；写入类工具最小实现。
- M5 Hooks/Policy 完整化：before/after 工具、模型；策略覆盖写/读/命令/网络。
- M6
  Slash 命令与记忆：`/chat save|resume|list|delete|share`，会话持久与摘要接口。
- M7 测试与发布：集成/E2E 覆盖，打包与 npm 发布脚本。

> 建议按里程碑逐步实现，每个里程碑配套最小测试与可观测输出，优先确保工具/策略/恢复链路的正确性与安全性。\*\*\*
