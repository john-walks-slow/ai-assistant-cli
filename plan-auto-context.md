# Auto-Context 功能规格文档

## 介绍

### 功能概述
Auto-Context 是 MAI 的一个可选扩展。他是一个自动化上下文准备代理（Context-Agent），旨在为 AI 编码任务自动收集和准备足够的项目上下文。

- **触发方式**：默认行为保持不变：手动文件指定。通过 CLI 选项 `-a` 或 `--auto-context` 激活。
- **核心目标**：Context-Agent 通过多轮 AI 检索，生成一个“足以完成本次任务”的上下文集合，包括：
  - 文件路径（相对于项目根目录）。
  - 每个文件的简短 summary（描述其相关性）。
- **下游流程**：准备的上下文直接传入 main-processor → AI → plan-reviewer。后续流程无权修改上下文（固定输入）。
- **限制**：支持设置轮次上限和文件数量上限。

## 架构概述

### 整体流程集成
1. **CLI 入口** (`src/index.ts`)：
   - 增加 `-a/--auto-context` 选项。

2. **主处理** (`src/core/main-processor.ts`)：
   - 修改 `processRequest` 签名：添加可选 `autoContext: boolean = false` 参数。
   - 如果 autoContext 激活，调用 `prepareAutoContext(userPrompt)` 生成 `fileContextItem`，与来自手动指定的 file 和 history 的文件引用合并（需要一些重构）。
   - 确保下游 AI 调用和 plan-reviewer 使用固定上下文，无修改接口。

3. **Context-Agent** (新模块 `src/core/context-agent.ts`)：
   - 核心实现：多轮迭代 AI 查询。
   - 输入：`userPrompt`。
   - 输出：`FileContextItem[]`（扩展现有接口）。
   - 工具：使用 `getAiResponse` 调用 AI；需要新开发高效的、适合AI阅读的，用于获取项目结构、搜索内容的工具。

### 数据结构
- **FileContextItem** (现有 + 扩展)：
  ```typescript
  interface FileContextItem {
    path: string;
    summary?: string;
    start?: number;         // auto-context 场景不使用
    end?: number;           // auto-context 场景不使用
  }
  ```

## Context-Agent 设计

### 多轮检索逻辑
Context-Agent 使用迭代 AI 调用逐步细化上下文，直到“足够”完成任务。每个轮次：
1. **初始化**：第一轮提供项目目录树结构。
2. **AI 查询**：构建系统提示 + 用户提示，请求 AI 建议相关文件/summary。
   - 系统提示示例：
     ```
     你是上下文准备代理。基于用户任务，建议项目中足够的、最相关的文件（整个文件）。
     - 优先核心文件（如入口、模块）。
     - 对于每个文件：路径、简短 summary（描述相关性）。
     - 输出 JSON: [{path: "...", summary: "..."}]
     - 如果上下文不足，说明需进一步检索。
     ```
   - 用户提示：`任务：${userPrompt}。项目结构：${projectOverview}`。
3. **AI 输出解析**：使用类似 `parseAiResponse` 的 JSON 解析器，提取 `FileContextItem[]`。
4. **自评**：AI 输出中必须包含“是否足够”的评估（e.g., confidence score）。
5. **迭代**：
   - 如果 AI 表示“不足”：反馈当前上下文 + 任务，请求细化（e.g., “添加更多细节文件”）。
   - 否则：停止，返回最终项数组。
   - 额外限制：数量、轮次
6. **后处理**：
   - 验证项（文件存在？）。