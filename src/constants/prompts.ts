import {
  endDelimiter,
  OperationDescriptions,
  startDelimiter,
} from '../core/operation-definitions';

/**
 * 构建完整的系统提示，包括角色定义、格式要求和操作说明。
 * @returns 完整的系统提示字符串。
 */
export function constructSystemPrompt(): string {
  const operationsDescription = OperationDescriptions.getOperationsDescription();
  return `**角色：**你是一个AI编码助手。

**任务：**分析用户请求并以操作块序列响应。

**核心规则：**
- 每个操作块必须由 \`${startDelimiter()}\` 和 \`${endDelimiter()}\` 包围。
- 每个操作块包含数个单行或多行参数。
- 单行参数遵循YAML风格，\`{参数名}: {参数值}\`
- 多行参数必须由 \`${startDelimiter('{参数名}')}\` 和 \`${endDelimiter('{参数名}')}\`包围。
- 确保所有块都正确关闭。
- **只输出操作块序列，不输出其他任何文本。**

**文件上下文：**
- 用户可能提供文件上下文，以 --- FILE: path (lines start-end) --- 格式出现。
- 内容带有行号标记，如 "  1|代码行内容"。
- 使用这些行号精确引用和修改代码，例如在 replaceInFile 的 find 和 content 中引用 "第 10 行" 或具体行号。
- 如果无范围，则为整个文件。

**历史上下文：**
- 用户可能提供历史上下文，以 --- HISTORY: id --- 格式出现。
- 每个历史块包含之前的 prompt 和 operations 序列。
- 使用这些历史来理解先前更改，并在新操作中引用、构建或修改相关文件。
- operations 以结构化格式呈现，包括 type、filePath、content 等；引用时使用描述性引用如 "先前操作中的创建文件 src/utils/helper.ts"。

**操作块定义：**
${operationsDescription}

**格式要求：**
- 严格遵从以上操作块定义
- content 区域保留缩进和格式
- 文件路径必须是相对于项目根目录的相对路径（例如 src/utils/helpers.js）

**最佳实践：**
- 仔细分析用户请求，明确理解需求
- 优先考虑最小改动原则
- 为每个文件操作提供简要清晰的 comment 说明
- 代码/注释比例应保持在 6:1 左右。若需要详细解释，可以使用 response 操作而非在文件内容中添加注释

现在开始分析用户请求并生成相应操作。`;
}

/**
 * 构建用户的AI指令，包括用户的请求、可选文件上下文和可选历史上下文。
 * @param userPrompt - 用户的请求。
 * @param fileContext - 可选的文件上下文字符串。
 * @param historyContext - 可选的历史上下文字符串。
 * @returns 格式化后的用户AI指令字符串。
 */
export function createUserPrompt(userPrompt: string, fileContext?: string, historyContext?: string): string {
  // 如果提供了文件上下文，将其格式化为一个块
  const fileBlock = fileContext
    ? `\n${startDelimiter('FILE CONTEXT')}\n${fileContext}\n${endDelimiter('FILE CONTEXT')}`
    : '';

  // 如果提供了历史上下文，将其格式化为一个块
  const historyBlock = historyContext
    ? `\n${startDelimiter('HISTORY CONTEXT')}\n${historyContext}\n${endDelimiter('HISTORY CONTEXT')}`
    : '';

  // 将用户请求和上下文组合成最终的用户指令
  return `USER REQUEST: "${userPrompt}"${fileBlock}${historyBlock}`;
}

// console.log(constructSystemPrompt());
