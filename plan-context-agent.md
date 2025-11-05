# Context-Agent 规划文档

## 概述
Context-Agent 是一个可选的自动化上下文准备组件，用于在主处理流程前智能收集和总结相关文件/历史上下文。核心哲学：
- **轻量**：仅输出路径+摘要（summary），不修改文件或执行操作。
- **单步**：基于用户prompt生成建议，用户确认后锁定上下文，传入main-processor。
- **用户控制**：默认使用手动files参数；autocontext通过配置或CLI选项启用。
- **隔离设计**：Agent独立运行，输出结构化上下文（文件路径+可选片段范围+summary，历史摘要），传入main-processor → AI → plan-reviewer。

扩展支持：
- 文件片段：非全文，提供行范围（如1-50）以减少token消耗。
- 历史引用：格式化.mai-history.json中的prompt + operations，作为额外上下文。

## 核心接口设计
创建新文件 [`src/core/context-agent.ts`](src/core/context-agent.ts)：
- **类**：`ContextAgent`
- **方法**：
  - `async prepareContext(userPrompt: string, options: PrepareOptions): Promise<PreparedContext>`
    - 输入：userPrompt（用户指令），options（{autocontext?: boolean, files?: string[], includeHistory?: number | string, historyId?: string}）
    - 逻辑：
      - 如果autocontext启用：使用userPrompt驱动AI或搜索工具（e.g., search_files）识别相关文件/片段，生成summary。
      - 手动模式：直接使用files，生成基本summary（e.g., 文件列表）。
      - 历史集成：如果includeHistory，加载.mai-history.json，选择最近N条或指定ID，格式化为文本摘要（e.g., "历史ID: prompt\n操作: [type: create, file: path, content summary]"）。
      - 输出建议，用户交互确认（inquirer提示：确认/编辑/跳过）。
    - 输出：`PreparedContext = { files: Array<{path: string, lines?: {start: number, end: number}}>, summaries: string[], historyContext?: string }`
  - `formatHistory(historyEntries: HistoryEntry[]): string`：格式化历史为prompt + operations摘要。
- **依赖**：扩展file-context.ts支持片段读取（getFileSnippet(path, start, end)）；使用inquirer用户交互；加载.mai-history.json。

## Autocontext 自动文件选择逻辑（包括片段支持）
- **触发**：通过CLI --autocontext 或 config.autocontextEnabled = true。
- **步骤**（单步AI辅助）：
  1. 基于userPrompt提取关键词（e.g., "更新main-processor" → 搜索"main-processor"相关）。
  2. 搜索项目文件：使用search_files工具在src/目录，regex基于prompt（e.g., regex: userPrompt关键词）。
  3. AI总结：调用getAiResponse生成文件/片段建议（prompt: "基于用户指令[userPrompt]，建议3-5个相关文件路径和行范围摘要"）。
  4. 片段支持：优先选择相关函数/块（e.g., lines: 20-50），使用read_file获取确切内容，summary描述"文件X的Y函数，行20-50：处理Z逻辑"。
  5. 用户确认：显示建议列表（路径+summary），inquirer选择/编辑。
- **边界**：限制5-10文件，避免token爆炸；如果无匹配，fallback到手动或VSCode open tabs（从environment_details获取）。

## 历史引用集成
- **格式化**：扩展formatHistory函数：
  ```
  历史任务 ID: 1758174505243
  Prompt: Create foo.txt
  操作摘要:
  - create: foo.txt (空文件，行1-1: "")
  结果: 成功
  ```
- **启用**：CLI --include-history <N> (最近N条) 或 --history-id <ID>；config.historyLimit = 5。
- **集成**：在prepareContext中，如果启用，加载.mai-history.json（使用fs.readFile），过滤选择，格式化追加到PreparedContext.historyContext，作为额外prompt部分（e.g., createUserPrompt中添加"--- 历史上下文 ---\n{historyContext}"）。

## 配置更新 (src/types/config.ts)
扩展MaiConfig接口：
```typescript
export interface MaiConfig {
  templates?: PromptTemplate[];
  autocontextEnabled?: boolean;  // 默认false，启用自动上下文
  historyLimit?: number;         // 默认0，不启用历史；>0为最近N条
  autocontextMaxFiles?: number;  // 默认5，最大自动文件数
}
```
- 使用config-manager.ts加载/保存。

## Main-Processor 集成 (src/core/main-processor.ts)
- 修改processRequest：
  ```typescript
  export async function processRequest(userPrompt: string, files: string[] = [], systemPrompt?: string, autocontext?: boolean, includeHistory?: any): Promise<void> {
    let actualFiles = files;
    let extraContext = '';
    if (autocontext) {
      const agent = new ContextAgent();
      const ctx = await agent.prepareContext(userPrompt, {autocontext, includeHistory});
      actualFiles = ctx.files.map(f => f.path);  // 传入路径
      extraContext = ctx.summaries.join('\n') + (ctx.historyContext ? '\n' + ctx.historyContext : '');  // 摘要到prompt
    }
    // 原逻辑：actualUserPromptContent = createUserPrompt(userPrompt + extraContext, await getFileContext(actualFiles, ctx.files));  // 扩展getFileContext支持片段
  }
  ```
- 扩展getFileContext(files: string[], snippets?: {path: string, lines: {start: number, end: number}}[])：如果有snippets，读取指定行范围。

## CLI 命令扩展 (src/index.ts)
- 使用commander扩展mai命令：
  ```typescript
  program
    .command('mai <prompt>')
    .option('--autocontext', { type: 'boolean', default: false, description: '启用自动上下文准备' })
    .option('--include-history <limit>', { type: 'number', description: '包含最近N条历史' })
    .option('--history-id <id>', { type: 'string', description: '包含指定历史ID' })
    .action(async (args) => {
      await processRequest(args.prompt, [], undefined, args.autocontext, args.includeHistory || args.historyId);
    });
  ```
- 默认：手动files通过--files <glob>选项（现有）。

## 文档更新
- **README.md**：新增"Context-Agent" section：
  - 描述哲学、用法（mai "任务" --autocontext --include-history 3）。
  - 示例：autocontext如何基于prompt选择src/core/main-processor.ts片段。
- **代码注释**：在context-agent.ts、main-processor.ts添加JSDoc，解释隔离和扩展。
- **prompts.ts**：添加autocontext专用prompt模板（e.g., "分析指令[userPrompt]，建议相关文件"）。

## 整体流程验证
- **模拟流程**：
  1. 用户：mai "更新上下文处理" --autocontext --include-history 2
  2. Context-Agent：搜索/ AI建议 files: [{path: 'src/core/file-context.ts', lines: {start:1, end:20}, summary: '当前文件读取逻辑'}] + 历史摘要。
  3. 用户确认：inquirer选择确认。
  4. 传入main-processor：getFileContext读取片段 + 历史到userPrompt。
  5. AI生成operations。
  6. plan-reviewer审查/执行。
- **隔离验证**：Agent不影响main-processor原有手动模式；错误fallback到手动。
- **轻量验证**：上下文<2000 tokens，单步交互<10s。

```mermaid
flowchart TD
    A[用户输入: userPrompt + CLI选项] --> B{autocontext启用?}
    B -->|否| C[使用手动files]
    B -->|是| D[Context-Agent: 基于prompt搜索/AI建议文件片段+历史]
    D --> E[用户确认: inquirer选择/编辑]
    E --> F[锁定PreparedContext: paths+summaries+history]
    C --> G["main-processor: getFileContext(files + snippets) + extraContext"]
    F --> G
    G --> H["AI: getAiResponse(systemPrompt + userPrompt + context)"]
    H --> I[parseAiResponse → operations]
    I --> J[plan-reviewer: reviewAndExecutePlan]
    J --> K[完成: 文件变更 + 历史记录]
    ```