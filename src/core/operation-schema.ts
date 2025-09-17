import { z } from 'zod';

/**
 * 所有操作共享的基础 Zod Schema。
 */
export const BaseOperationSchema = z.object({
  type: z.enum(['response', 'create', 'edit', 'rename', 'delete']),
  comment: z.string().optional(),
});

/**
 * Response 操作的 Zod Schema。
 */
export const ResponseOperationSchema = BaseOperationSchema.extend({
  type: z.literal('response'),
  content: z.string(),
});

/**
 * Create 操作的 Zod Schema。
 */
export const CreateOperationSchema = BaseOperationSchema.extend({
  type: z.literal('create'),
  filePath: z.string().min(1),
  content: z.string(),
});

/**
 * Edit 操作的 Zod Schema。
 */
export const EditOperationSchema = BaseOperationSchema.extend({
  type: z.literal('edit'),
  filePath: z.string().min(1),
  content: z.string(),
  originalContent: z.string().optional(),
  startLine: z.coerce.number().positive().optional(), // 可选的开始行号（1-based）
  endLine: z.coerce.number().positive().optional(), // 可选的结束行号（1-based）
});

/**
 * Rename 操作的 Zod Schema。
 */
export const RenameOperationSchema = BaseOperationSchema.extend({
  type: z.literal('rename'),
  oldPath: z.string().min(1),
  filePath: z.string().min(1),
  originalPath: z.string().optional(),
});

/**
 * Delete 操作的 Zod Schema。
 */
export const DeleteOperationSchema = BaseOperationSchema.extend({
  type: z.literal('delete'),
  filePath: z.string().min(1),
  originalContent: z.string().optional(),
});

/**
 * 文件操作的联合类型 Zod Schema。
 */
export const FileOperationSchema = z.union([
  CreateOperationSchema,
  EditOperationSchema,
  RenameOperationSchema,
  DeleteOperationSchema,
]);

/**
 * 所有 AI 操作的联合类型 Zod Schema。
 */
export const AiOperationSchema = z.union([
  ResponseOperationSchema,
  FileOperationSchema,
]);

/**
 * 操作数组的 Zod Schema。
 */
export const OperationsArraySchema = z.array(AiOperationSchema);

/**
 * 操作验证结果接口。
 */
export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

/**
 * 验证单个操作对象的有效性。
 * @param op - 要验证的操作对象。
 * @returns 验证结果。
 */
export function validateOperation(op: unknown): ValidationResult {
  try {
    AiOperationSchema.parse(op);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: [error.message],
      };
    }
    return {
      isValid: false,
      errors: [String(error)],
    };
  }
}

/**
 * 验证操作数组的有效性。
 * @param operations - 操作数组。
 * @returns 验证结果。
 */
export function validateOperations(operations: unknown[]): ValidationResult {
  if (!Array.isArray(operations)) {
    return { isValid: false, errors: ['Operations must be an array'] };
  }

  const results = operations.map((op, index) => {
    const result = validateOperation(op);
    if (!result.isValid) {
      return { index, errors: result.errors?.map((e) => `Operation ${index}: ${e}`) || [] };
    }
    return null;
  }).filter(Boolean);

  if (results.length > 0) {
    const errors = results.flatMap((r) => r!.errors);
    return { isValid: false, errors };
  }

  return { isValid: true };
}