import { z } from 'zod';
import {
  AiOperationSchema,
  CreateOperationSchema,
  DeleteOperationSchema,
  EditOperationSchema,
  FileOperationSchema,
  RenameOperationSchema,
  ResponseOperationSchema,
} from '../core/operation-schema';

/**
 * 统一的AI操作类型定义
 * 所有操作共享的基接口
 */
export interface BaseOperation {
  type: OperationType;
  comment?: string; // AI对操作的简要说明
}

/**
 * 精确定义所有支持的操作类型
 */
export type OperationType =
  | 'response'
  | 'create'
  | 'edit'
  | 'rename'
  | 'delete';

/**
 * Response操作 - 用于AI提供文本回答，不修改文件
 */
export interface ResponseOperation extends BaseOperation {
  type: 'response';
  content: string; // Markdown格式的响应内容
}

/**
 * Create操作 - 创建新文件并指定内容
 */
export interface CreateOperation extends BaseOperation {
  type: 'create';
  filePath: string; // 新文件的完整路径
  content: string;  // 文件内容
}

/**
 * Edit操作 - 编辑现有文件，支持指定行范围修改
 */
export interface EditOperation extends BaseOperation {
  type: 'edit';
  filePath: string; // 目标文件的完整路径
  content: string;  // 新的文件内容或替换片段
  originalContent?: string; // 执行前文件的完整原始内容，用于历史记录
  startLine?: number; // 可选的开始行号（1-based）
  endLine?: number; // 可选的结束行号（1-based）
}

/**
 * Rename操作 - 重命名或移动文件
 */
export interface RenameOperation extends BaseOperation {
  type: 'rename';
  oldPath: string;  // 原始文件路径
  filePath: string; // 新文件路径
  originalPath?: string; // 执行前原始路径，用于撤销
}

/**
 * Delete操作 - 删除文件
 */
export interface DeleteOperation extends BaseOperation {
  type: 'delete';
  filePath: string; // 要删除的文件路径
  originalContent?: string; // 删除前文件内容，用于撤销
}

/**
 * 所有文件操作的精确联合类型
 */
export type FileOperation =
  | CreateOperation
  | EditOperation
  | RenameOperation
  | DeleteOperation;

/**
 * 所有可能的AI操作的完整联合类型
 */
export type AiOperation =
  | ResponseOperation
  | FileOperation;

/**
 * 从Zod schema推断的运行时类型（确保一致性）
 */
export type InferredAiOperation = z.infer<typeof AiOperationSchema>;
export type InferredFileOperation = z.infer<typeof FileOperationSchema>;
export type InferredResponseOperation = z.infer<typeof ResponseOperationSchema>;
export type InferredCreateOperation = z.infer<typeof CreateOperationSchema>;
export type InferredEditOperation = z.infer<typeof EditOperationSchema>;
export type InferredRenameOperation = z.infer<typeof RenameOperationSchema>;
export type InferredDeleteOperation = z.infer<typeof DeleteOperationSchema>;

/**
 * 操作验证结果，包含详细的错误信息
 */
export interface ValidationResult {
  isValid: boolean;
  errors?: string[]; // 验证失败时的具体错误信息
}

/**
 * 操作执行上下文，用于跟踪执行状态
 */
export interface ExecutionContext {
  workingDir: string;           // 工作目录
  dryRun?: boolean;             // 是否为干运行模式
  backupOriginals?: boolean;    // 是否备份原始文件
}

/**
 * 历史记录条目元数据，精确定义结构
 */
export interface HistoryEntryMetadata {
  id: string;                    // 历史记录的唯一标识符（目录名）
  name?: string;                 // 用户提供的可选名称
  timestamp: string;             // 创建时间 (ISO 8601 格式)
  prompt: string;                // 触发此操作的用户提示
  description?: string;          // 操作描述
  operations: AiOperation[];     // 执行的AI操作列表（包含response和文件操作）
}