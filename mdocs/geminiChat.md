# GeminiChat 模块详解

> 本文档详细介绍了 `packages/core/src/core/geminiChat.ts` 文件的主要功能、核心类与方法，并通过代码片段和注释帮助开发者快速理解其实现原理。

---

## 文件定位与作用

该文件实现了 Gemini 聊天会话的核心逻辑，负责与 Google Gemini 模型进行多轮对话，管理历史、处理流式/非流式响应、错误重试、模型切换等。

主要导出类：
- `GeminiChat`：封装了与 Gemini 模型的对话流程，支持普通和流式消息发送，自动管理历史和异常。

---

## 主要结构与核心逻辑

### 1. 辅助函数

- **isValidResponse / isValidContent**
  - 判断模型返回内容是否合法。
- **validateHistory / extractCuratedHistory**
  - 校验历史内容格式，提取有效历史。

```ts
function isValidResponse(response: GenerateContentResponse): boolean { /* ... */ }
function isValidContent(content: Content): boolean { /* ... */ }
function validateHistory(history: Content[]) { /* ... */ }
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] { /* ... */ }
```

### 2. GeminiChat 类

#### 构造函数

- 初始化配置、内容生成器、生成参数和历史。
- 校验历史内容格式。

```ts
constructor(
  private readonly config: Config,
  private readonly contentGenerator: ContentGenerator,
  private readonly generationConfig: GenerateContentConfig = {},
  private history: Content[] = [],
) {
  validateHistory(history);
}
```

#### 主要方法

##### sendMessage
- 发送单条消息，等待上一次消息处理完毕。
- 自动重试 429/5xx 错误，必要时切换到 Flash 模型。
- 记录请求/响应日志，更新历史。

```ts
async sendMessage(params: SendMessageParameters): Promise<GenerateContentResponse> { /* ... */ }
```

##### sendMessageStream
- 发送消息并以流式方式获取响应（支持多轮 chunk）。
- 支持错误重试与模型切换。
- 处理流式响应，边收边 yield。

```ts
async sendMessageStream(params: SendMessageParameters): Promise<AsyncGenerator<GenerateContentResponse>> { /* ... */ }
```

##### processStreamResponse
- 处理流式响应，收集 chunk，记录日志，更新历史。

```ts
private async *processStreamResponse(
  streamResponse: AsyncGenerator<GenerateContentResponse>,
  inputContent: Content,
  startTime: number,
) { /* ... */ }
```

##### recordHistory
- 记录用户输入、模型输出到历史，合并相邻内容，处理特殊情况（如 only thought）。

```ts
private recordHistory(
  userInput: Content,
  modelOutput: Content[],
  automaticFunctionCallingHistory?: Content[],
) { /* ... */ }
```

##### getHistory/clearHistory/addHistory/setHistory
- 获取、清空、添加、设置历史。

---

## 典型调用流程

1. 创建 GeminiChat 实例：
   ```ts
   const chat = new GeminiChat(config, contentGenerator);
   ```
2. 发送消息：
   ```ts
   const response = await chat.sendMessage({ message: '你好' });
   ```
3. 或流式发送：
   ```ts
   for await (const chunk of await chat.sendMessageStream({ message: '你好' })) {
     console.log(chunk);
   }
   ```
4. 获取历史：
   ```ts
   const history = chat.getHistory();
   ```

---

## 关键特性总结

- **多轮对话历史管理**：自动维护有效历史，支持清空、追加、设置。
- **流式/非流式响应**：支持普通和流式消息收发。
- **错误重试与模型切换**：自动处理 429/5xx 错误，必要时切换到 Flash 模型。
- **日志与统计**：集成 API 请求/响应/错误日志。
- **内容合并与去重**：合并相邻内容，去除无效响应。

---

## 参考
- [Google Gemini API 文档](https://ai.google.dev/)
- [js-genai 源码](https://github.com/googleapis/js-genai) 