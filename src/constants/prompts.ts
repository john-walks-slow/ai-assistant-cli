import {
  CONTENT_END_DELIMITER,
  CONTENT_START_DELIMITER,
  OPERATION_END_DELIMITER,
  OPERATION_START_DELIMITER,
  OperationDescriptions,
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
- 每个操作块必须由 \`${OPERATION_START_DELIMITER}\` 和 \`${OPERATION_END_DELIMITER}\` 包围
- 每个操作块包含数个参数和一个可选的内容区域
- 内容区域必须由 \`${CONTENT_START_DELIMITER}\` 和 \`${CONTENT_END_DELIMITER}\` 包围
- 确保所有块都正确关闭
- **只输出操作块序列，不输出其他任何文本**

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
 * 构建用户的AI指令，包括用户的请求和可选文件上下文。
 * @param userPrompt - 用户的请求。
 * @param context - 可选的文件上下文字符串。
 * @returns 格式化后的用户AI指令字符串。
 */
export function createUserPrompt(userPrompt: string, context?: string): string {
  // 如果提供了文件上下文，将其格式化为一个块
  const contextBlock = context
    ? `\n--- START OF FILE CONTEXT ---\n${context}\n--- END OF FILE CONTEXT ---`
    : '';

  // 将用户请求和上下文组合成最终的用户指令
  return `USER REQUEST: "${userPrompt}"\n${contextBlock}`;
}