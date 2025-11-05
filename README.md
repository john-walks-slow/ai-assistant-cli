# MAI - Minimal File I/O AI CLI

轻量文件读写 AI CLI

## 特性

- 可控单步操作，不递归
- 交互式审查提出的操作
- 完全手动指定上下文（支持引用文件、操作历史）
- 轻量操作历史（支持回退、重做），不依赖 git
- 支持多模型
- 支持自定义模板

**适合的场景**

- 在可预先确定上下文的情况下，利用 AI 进行批处理，如撰写注释、文档。
- 在代码中添加例如 // AI Helpme 的注释，调用 mai 进行 AI 补完。

**不适合的场景**

- Agentic coding，或需要 AI 自主进行多步推理和操作的复杂任务。

## 安装

```bash
# 克隆仓库
git clone <repo-url>
cd mai

# 安装依赖
pnpm install

# 构建
pnpm run build

# 全局安装后可直接使用
pnpm link   # 或 npm link
```

## 使用

```bash
mai [prompt] [files...] [options]
```

### 参数

- `[prompt]`：必需的指令。如果留空，将进入交互模式进行输入。
- `[files...]`：可选，作为上下文的文件。
  - 支持 glob 模式，如 `"src/**/*.ts"`。
  - 支持指定行数范围，如 `"src/main.ts:10-20"`。

### 选项

- `-y, --auto-apply`：自动应用 AI 提出的文件操作，跳过审查步骤。
- `-r, --history <ids>`：引用历史记录的 ID、名称或索引（如 `~1,id2`）作为上下文。
- `-d, --history-depth <number>`：自动加载最近 N 条历史作为上下文。
- `-c, --chat`：忽略系统提示词，进行无引导的对话。
- `-a, --auto-context`：(实验性) 启用自动上下文，由 AI 收集相关文件。
- `-m, --model <model>`：指定本次请求使用的模型，覆盖默认配置。
- `-t, --temperature <number>`：指定模型的 temperature 参数 (0-2)。

## 命令

### `exec-plan <planSource>`

从文件或直接字符串执行一个操作计划。

### `history`

管理操作历史。

- `list`：列出所有历史记录。
- `undo <id>`：撤销指定历史记录的更改。
- `redo <id>`：重新应用指定历史记录的更改。
- `delete <id>`：删除指定的历史记录。
- `clear`：清除所有历史记录。

### `template`

管理和应用模板。

- `list`：列出所有可用模板。
- `show <name>`：显示指定模板的详细信息。
- `apply <name> [files...]`：应用指定的模板。

### `model`

管理和选择 AI 模型。

- `list`：列出所有可用模型。
- `select`：交互式选择默认模型。

### `config`

管理配置。

- `list`：列出当前配置。
- `set <key> <value>`：设置一个配置项。
- `reset`：重置所有配置为默认值。

## 开发

```bash
# 监听源码并实时编译
pnpm run dev
```

项目使用 TypeScript，代码位于 `src/` 目录，主要入口 `src/index.ts`。

## 许可证

MIT License
