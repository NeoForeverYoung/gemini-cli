1. GEMINI.md 是干啥的？策略二：Memory（自建笔记）更优雅的方法：让 Agent 自己做笔记。Agent 定期把重要信息写入外部文件。context 重置后，读取笔记恢复记忆。一个有趣的例子是 Claude
   Plays Pokémon——一个 Twitch 直播，Claude 在玩 Pokémon
   Red。游戏需要跨越数千步保持连贯性：记住目标、追踪进度、学习哪些攻击对哪些敌人有效。Claude 不用 compaction。它有一个小型文件系统，可以写 markdown 笔记。每次 context 重置，它读取自己的笔记继续玩。这个思路正在被训练进模型——让 Agent 天生就会"做笔记"，而不需要显式提示。

- 可以这样理解，README.md是给人阅读的。
- GEMINI.md是同时给AI和人看的，制定一些规范，让AI按照该项目的规范来。是一个memory文件
- 可观测，数据库访问，DAO设计等等，都可以作为规范。

- 是仓库内的贡献与工程实践指南，主要用途：
- 说明提交前要跑的全量检查命令：`npm run preflight`（包含 build、test、typecheck、lint）。
- 测试规范：使用 Vitest，文件位置、mock 方式、异步测试、React/Ink 测试要点等。
- TypeScript/JS 代码风格：偏好普通对象 + 接口/类型声明，避免类、避免 `any`，推荐
  `unknown`；用模块导出控制可见性；数组操作使用 map/filter/reduce 等。
- React 指南：函数组件 +
  Hooks，避免类组件；渲染纯函数；正确使用 effect、依赖和清理；避免直接变更 state；并强调并发兼容、避免过度 useMemo。
- 其他约束：使用 `checkExhaustive`
  做 switch 穷举；flag 使用连字符；仅写高价值注释；主分支名是 main；文档贡献需遵守
  `/docs` 指南和根目录 `CONTRIBUTING.md` 的规范。

简单说：这是提交代码前的质量检查与风格/测试/React/TS 规范总览，确保贡献符合项目标准。

2. Gemini-cli的checkpoint是怎么实现的？包括几个部分 [12 tools called]

Gemini
CLI 的 checkpoint 由“自动保存 + 恢复”两部分组成，核心链路是：开启配置 → 工具获批前自动快照 → 将历史与工具调用写入临时目录 →
`/restore` 读取并用 Git 影子仓回滚，再重放对话。

- 触发与保存位置：当开启 `general.checkpointing.enabled`
  后，只要你批准会改写文件的工具（如 write/replace），就会创建一个 checkpoint，内容包括影子 Git 提交、完整对话历史、即将执行的工具调用，文件保存在本项目的临时目录
  `~/.gemini/tmp/<project_hash>/checkpoints` 下；影子仓位于
  `~/.gemini/history/<project_hash>`。

```11:36:docs/cli/checkpointing.md
When you approve a tool that modifies the file system... includes:
1. A Git snapshot... ~/.gemini/history/<project_hash>
2. Conversation history
3. The tool call
... saved in ~/.gemini/tmp/<project_hash>/checkpoints
```

- 自动快照实现：在 UI hook `useGeminiStream`
  中监听待批准的编辑类工具，创建目录、调用 GitService 生成提交，随后把
  `history`、`clientHistory`、`toolCall`、`commitHash`
  等写入以时间戳命名的 json。

```1240:1340:packages/cli/src/ui/hooks/useGeminiStream.ts
const restorableToolCalls = toolCalls.filter(
  EDIT_TOOL_NAMES.has(...) && status === 'awaiting_approval');
...
commitHash = await gitService.createFileSnapshot(...);
const checkpointData = { history, clientHistory, toolCall, commitHash, filePath };
await fs.writeFile(checkpointDir/...json, JSON.stringify(checkpointData, null, 2));
```

- 存储路径/哈希：路径由 Storage 按项目根求 sha256 生成临时目录及 checkpoints 子目录，历史仓目录同样基于 hash。

```112:128:packages/core/src/config/storage.ts
getHistoryDir(): string { ... history/<hash> }
getProjectTempCheckpointsDir(): string {
  return path.join(this.getProjectTempDir(), 'checkpoints');
}
```

- 影子 Git 仓：GitService 在 `~/.gemini/history/<hash>`
  初始化独立仓，提交/恢复都指向工作区，避免污染用户仓；`createFileSnapshot` 会
  `add .` 后提交，`restoreProjectFromSnapshot` 用 `git restore` + `clean` 回滚。

```57:131:packages/core/src/services/gitService.ts
setupShadowGitRepository() { ... simpleGit(repoDir); init main; copy .gitignore ... }
async createFileSnapshot(message) { await repo.add('.'); const {commit}=await repo.commit(...) }
async restoreProjectFromSnapshot(commitHash) { await repo.raw(['restore','--source',commitHash,'.']); await repo.clean('f',['-d']); }
```

- 恢复命令：`/restore`
  读取 checkpoints 目录（列出/选取 json），用 zod 校验后调用
  `performRestore`；它会先重载会话历史，再用 GitService 按 `commitHash`
  回滚文件，最后把原始工具调用重新抛给 UI。

```49:152:packages/cli/src/ui/commands/restoreCommand.ts
const files = await fs.readdir(checkpointDir)... if args provided read JSON -> ToolCallData...
const actionStream = performRestore(toolCallData, gitService);
... return { type: 'tool', toolName: toolCallData.toolCall.name, toolArgs: toolCallData.toolCall.args };
```

```22:55:packages/core/src/commands/restore.ts
if (history && clientHistory) yield { type: 'load_history', ... };
if (commitHash) { gitService.restoreProjectFromSnapshot(commitHash); yield info message; }
```

补充：`/chat save/resume`
是手动对话 checkpoint，存放在同一临时目录，但与自动文件修改 checkpoint 区分；主流程仍以自动快照 +
`/restore` 为主。

3. Gemini CLI for the enterprise. 在企业环境中的核心要点与示例

- 比如可以统一控制，go-redis的库以及推荐版本，七彩石的版本，trpc-go或者trpc-cpp的版本问题。让AI知道这些关键的知识库

* 核心关注点：
  - 配置集中化：用系统级 `settings.json` 模板（放在企业镜像或配置管理中），限定
    `general.checkpointing`、模型/region、超时与输出大小等。
  - 策略与权限：用 Policy Engine（参考
    `bundle/policies/*.toml`）收紧写权限、限制可执行工具、限定目录访问范围，必要时使用只读策略。
  - 凭证与网络：集中配置服务账号/代理（例如 HTTP(S)/NO_PROXY 环境变量），避免个人凭证散落；必要时将 CLI 运行在受控跳板/容器内。
  - 审计与回滚：启用 checkpointing，影子 Git 仓保留修改快照；配合 `/restore`
    便于追溯和回滚。结合日志（`~/.gemini/tmp/<hash>/logs.json`）记录会话。
  - 扩展管控：仅允许经过审核的 extensions（可集中分发 `extensions` 目录和
    `gemini-extension.json`），禁用未授权工具。
  - 分发方式：提供预装 Node/npm 依赖与模板设置的镜像/包，或用脚本在用户首次启动时下发标准配置与策略。

* 参考场景示例：
  1. 只读审阅场景：在模板设置里开启 checkpointing，加载
     `bundle/policies/read-only.toml`，仅允许
     `list_directory`、`read_file`、`ripgrep` 等查询工具，禁止写入类工具。
  2. 安全改写场景：启用 checkpointing + 自定义策略（限制写入目录到
     `src/`），要求每次写入类工具在获得批准后才执行，并依赖影子仓快照可
     `/restore`。
  3. 受限网络/代理：在企业代理下运行 CLI，预置环境变量
     `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`，并在 `settings.json`
     中统一模型/region，避免个人配置漂移。
  4. 标准化分发：在 CI 产出带有预设
     `settings.json`、策略文件、受控 extensions 的压缩包或容器镜像，开发者解压/拉取即可获得一致体验。

4. Token caching and cost optimization 这个具体是怎么做的？

- 思路拆解：
  - 避免重复请求：对固定的系统提示、项目上下文片段做缓存；对近期相同用户问句 + 上下文组合可做幂等缓存，命中后直接复用模型输出（适合 FAQ/常见操作）。
  - 输入截断与压缩：对长上下文使用 summarization/关键片段提取，或用 embeddings 选段，减少无关 token。
  - 流水线并行与合并：并行拉取必需信息，减少多轮交互；可将多个小请求合并为一次批量请求（取决于模型 API 支持）。
  - 低成本模型优先：默认使用中档模型完成搜索、路由、草稿，只有在需要高质量生成时再切换高阶模型；在设置中固定“默认模型”和“高阶模型”双轨。
  - 温度与输出上限：降低 `max_output_tokens`
    与温度，减少无效铺陈；对长回复场景用分段生成+按需追加。
  - 记忆与会话截断：定期对历史做“摘要 + 关键消息留存”，保留工具调用结果与用户确认，丢弃冗余闲聊，减少上下文长度。
  - 结果落地：对确定性工具结果写入本地文件/缓存，下次直接读取文件而非重复调用模型。

- 示例做法：
  1. FAQ/模板复用：为常见命令/操作写脚本或 Markdown
     FAQ，结合 embeddings 建一个本地向量索引（小模型或本地嵌入），命中后不调用大模型或仅用小模型复述。
  2. 双模型路由：在 `settings.json`
     配置默认模型为中档，小范围场景（如生成命令、解释错误）直接用默认模型；代码生成/大段文档才切到高阶模型，并设定
     `max_output_tokens`。
  3. 上下文裁剪：对会话历史每 N 轮做一次“摘要消息”并替换早期多轮聊天，保留最近工具返回和用户指令；对文件内容先用
     `ripgrep`/分块摘要，再把关键片段送入模型。
  4. 检索优先：将项目文档/规范（如依赖版本、内部最佳实践）放入本地向量库，先检索再提问，减少模型反复探索同一资料的 token 消耗。
  5. 输出限流：为长文档生成分段提示，每段限制 tokens，并在用户确认后才继续下一段，防止一次性超长输出导致成本上升。

5. Google Cloud — “Choose a design pattern for your agentic AI
   system” 从架构角度帮助你判断“你的任务适合哪种 agent 模式”：单 agent /
   multi-agent / manager pattern / orchestration
   pattern。适合在系统化 / 工程化基础上设计 agent 的人。

- 什么时候选哪种模式（经验法则）：
  - 单 Agent：需求清晰、上下文集中、工具少（≤3），强调低延迟与可控输出，例如 FAQ、简单代码改写。
  - Multi-Agent（松耦合协作）：子任务天然分工（检索/规划/执行），但不需要严格调度；用共享内存或黑板模式汇总结果。
  - Manager/Worker（层级模式）：需要动态分解任务、派单、验收的场景；Manager 负责规划与路由，Workers 负责专业子任务（如代码生成、数据清洗、评审）。
  - Orchestration（流程编排/有向图）：任务步骤、前后置依赖明确（如 ETL、评审流水线、CI/CD 自动修复），适合 DAG/状态机式控制，易于重试与可观测。
  - 约束驱动选择：硬实时/严格合规 → 更倾向 Orchestration；探索式/开放式 →
    Multi-Agent + 评审；成本敏感/冷启动小 → 单 Agent。

- 设计检查单：
  - 数据流与状态：是否需要共享记忆、向量检索、或每个子 Agent 自己取数？结果如何合并、去重、排序？
  - 失败与重试：哪些节点可幂等重试？是否需要超时、并发上限、熔断？
  - 评审与安全：是否需要评审 Agent/规则（policy/hook）对输出或工具调用做把关？
  - 观测性：埋点/日志/事件流如何关联到每个 Agent、每次工具调用？
  - 成本与延迟：并行与分层是否会增加 token 成本？是否需要分档模型（草稿 vs 精修）？

- 组合示例：
  1. 代码改错流水线（Orchestration）：检索相关文件 → 静态分析/测试 → 生成修复 → 自检（lint/test）→ 评审 Agent
     → 出补丁；可对每步设置超时与重试。
  2. 知识库问答（Multi-Agent + 评审）：检索 Agent 召回 → 生成 Agent 草稿 → 评审 Agent 做事实一致性检查 → 最终输出；可并行多路检索/模型，评审选优。
  3. 项目协作助手（Manager/Worker）：Manager 分解需求并分配到特定 Worker（代码生成、文档撰写、测试编写），收集结果后汇总与质检。
  4. 轻量命令伴侣（单 Agent）：本地开发命令提示、短答、文件定位，强调低延迟与最小依赖。
