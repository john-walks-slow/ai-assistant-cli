/**
 * 定义一个可配置的提示模板。
 */
export interface PromptTemplate {
  name: string;      // 模板的唯一名称
  template: string;  // 实际的提示模板字符串，支持占位符
  description?: string; // 模板的可选描述
}

/**
 * 定义AI助手的整体配置结构。
 */
export interface MaiConfig {
  templates?: PromptTemplate[]; // 用户定义的提示模板列表
  // 未来其他配置项可以添加到这里
}