# MAI - 轻量文件编辑 AI CLI

<p>
  <a href="https://www.npmjs.com/package/@johnnren/mai-cli">
    <img src="https://img.shields.io/npm/v/@johnnren/mai-cli.svg" alt="NPM Version">
  </a>
  <a href="https://github.com/john-walks-slow/mai-cli/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/@johnnren/mai-cli.svg" alt="License">
  </a>
</p>

MAI (Minimal AI I/O) 旨在成为一个最小化的命令行接口，让你通过自然语言指令编辑本地文件。

## 示例

```bash
mai "翻译注释为中文" *.ts *.tsx
```

```
⠏ AI生成响应中... (55s)
✔ AI响应生成完成 (56s)

--- 解析AI响应 ---
解析到 5 个定界操作
成功解析 5 个操作。
正在保存本次AI对话历史...

--- 提议的文件计划 ---
正在验证操作可达性...
✓ 所有操作可达
编辑替换: src/types.ts
  将接口文件中的英文注释翻译为中文
编辑替换: src/store.ts
  将 Zustand store 中的英文注释翻译为中文
编辑替换: src/ai.ts
  将 AI 包装器文件中的英文注释翻译为中文
编辑替换: src/Graph.tsx
  将 Graph 组件中的英文注释翻译为中文
编辑替换: src/ChatPanel.tsx
  将聊天面板中的英文注释翻译为中文
--------------------------

? 选择一个操作: (Use arrow keys)
❯ 应用计划
  审查更改（VS Code diff）
  导出计划 (JSON)
  取消
```

## 特性

- 单步响应，无复杂 Agentic 流程
- 无状态，完全手动指定所需上下文（支持引用文件、glob 模式、操作历史）
- 支持交互式审查文件编辑计划
- 内置轻量操作历史（支持回退、重做）
- 兼容任意 openai-compatible 模型
- 支持将常用指令封装为模板，简化重复性任务

## 安装与配置

### 1. 安装

通过 npm 全局安装：

```bash
npm install -g @johnnren/mai-cli
```

### 2. API Key

MAI 通过环境变量读取 API keys。请根据你使用的模型，设置相应的环境变量：

```bash
# for OpenAI models
export OPENAI_API_KEY="your_openai_api_key"

# for Google Gemini models
export GEMINI_API_KEY="your_google_api_key"

# for OpenRouter models
export OPENROUTER_API_KEY="your_openrouter_api_key"
```

### 3. 配置文件

你可以在 `~/.mai/config.json5` 修改更多配置。

一个典型的配置示例如下：

```json5
{
  templates: [
    {
      name: 'helpme',
      description: '',
      template: '分析我提供的代码，定位所有向AI求助的注释。对于每一个找到的位置，你要：理解该位置的上下文和开发者的意图。编写、完成或重构高质量的代码来解决问题。\n      重要：\n      - 不要更改任何没有明确要求修改的代码，即便它们包含错误。\n      - 完成修改后，删去 AI求助 标记。\n      - **禁止**添加过多注释。注释数量、风格应该和源代码基本保持一致。\n      \n      触发指令:\n      // ai?\n      // ai!\n      // ai: 后跟具体任务描述\n      及任何明显意指让AI介入的注释。'
    },
    {
      name: 'tidy',
      description: '',
      template: '根据以下原则和示例，规范化给定代码的日志、注释风格和命名，提升其可读性和可维护性。\n\n**原则 (Principles):**\n\n1.  **极简:** 代码不言自明则**不加注释**。每一句注释和日志都应该提高信噪比，而非画蛇添足。\n2.  **命名:** 修复明显错误或误导性的命名，使其清晰易懂。目标是消除困惑，**无需**追求完美。\n3.  **文档:**\n    *   **注释:**\n        *   简要概括业务意图，而非翻译代码。注释/代码比例约 1:5。\n        *   语言风格应模仿人类开发者：精确、简洁，可以*略带*口语化。\n    *   **日志:**\n        *   在关键的生命周期、函数入口和错误捕获点添加日志。\n        *   使用清晰、简单的英语，目标是让中国开发者也能轻松理解。\n\n**核心约束 (Core Constraint):**\n\n*   **严禁进行任何功能性改动**。\n*   你的唯一目标是使代码符合上述所有规范。\n*   重构有价值的旧注释和日志，移除不符合规范的内容。\n*   所有由 AI 生成或修改的文本（注释、日志等）都必须以 `[AIGC]` 作为前缀。'
    }
  ],
  historyDepth: 0,
  model: 'openrouter/x-ai/grok-code-fast-1',
  temperature: 0.8,
  providers: {
    openrouter: {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      models: [
        'x-ai/grok-code-fast-1',
        'qwen/qwen3-coder:free',
        'moonshotai/kimi-k2:free',
        'z-ai/glm-4.5-air:free'
      ],
      apiKeyEnv: 'OPENROUTER_API_KEY'
    },
    gemini: {
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      apiKeyEnv: 'GEMINI_API_KEY'
    }
  }
}
```

## 使用指南

### 主命令

```bash
mai [prompt] [files...] [options]
```

**参数:**

- `prompt`: 你的指令。如果留空，将进入交互模式。
- `files...`: 作为上下文的文件列表。
  - 支持 glob 模式, e.g., `"src/**/*.ts"`
  - 支持指定行数范围, e.g., `"src/index.ts:10-20"`

**选项:**

- `-y, --auto-apply`: 自动应用计划，跳过审查步骤。
- `-r, --history <ids>`: 引用历史记录作为上下文 (e.g., `~1`, `~2,some_id`)。
- `-d, --history-depth <number>`: 覆盖配置中的默认历史深度。
- `-c, --chat`: 忽略系统提示词，进行无引导的对话。
- `-m, --model <model>`: 指定本次请求使用的模型，覆盖默认配置。
- `-t, --temperature <number>`: 指定模型的 temperature (0-2)。

### 子命令

#### `mai history`

管理操作历史。

- `list [-f, --file-only]`: 列出历史记录。`-f` 只显示包含文件操作的记录。
- `undo <id>`: 撤销指定历史记录的更改。`<id>` 可以是 ID, 名称, 或索引 (`~1`)。
- `redo <id>`: 重新应用指定历史记录的更改。
- `delete <id>`: 删除指定的历史记录。
- `clear`: 清除所有历史记录。

#### `mai model`

管理和选择 AI 模型。

- `list`: 列出所有可用模型，并高亮显示当前默认模型。
- `select`: 通过交互式列表选择一个新的默认模型。

#### `mai config`

管理配置。

- `list`: 列出当前所有配置项及其值。
- `set <key> <value>`: 设置一个配置项。
- `reset`: 重置所有配置为默认值。

#### `mai template`

管理和应用模板。

- `list`: 列出所有可用模板。
- `show <name>`: 显示指定模板的详细信息。
- `apply <name> [files...] [options]`: 应用指定的模板。

#### `mai exec-plan <planSource>`

从文件或直接字符串执行一个操作计划。

## 开发

```bash
npm link
npm run dev
```

## License

MIT
