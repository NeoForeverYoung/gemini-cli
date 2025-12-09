1. GEMINI.md 是干啥的？

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
