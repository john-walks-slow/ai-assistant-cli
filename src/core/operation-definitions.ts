import {
  OperationType,
  ValidationResult,
} from '../types/operations';
import {
  validateOperation,
  validateOperations,
} from './operation-schema';

/**
 * 操作分隔符常量。
 */
export const OPERATION_START_DELIMITER = '--- OPERATION START ---';
export const OPERATION_END_DELIMITER = '--- OPERATION END ---';
export const CONTENT_START_DELIMITER = '--- CONTENT START ---';
export const CONTENT_END_DELIMITER = '--- CONTENT END ---';

/**
 * 使用 Zod 的简化操作验证工具。
 */
export class OperationValidator {

  /**
   * 验证单个操作对象的有效性。
   * @param op - 要验证的操作对象。
   * @returns 验证结果。
   */
  static validateOperation(op: unknown): ValidationResult {
    return validateOperation(op);
  }

  /**
   * 验证操作数组。
   * @param operations - 操作数组。
   * @returns 验证结果。
   */
  static validateOperations(operations: unknown[]): ValidationResult {
    return validateOperations(operations);
  }
}

/**
 * 操作配置接口。
 */
type OperationConfig = {
  description?: string; // description 已变为可选
  fields: Record<string, {
    example: string;
    description?: string;
    isContent?: boolean;
    optional?: boolean;
  }>;
};

/**
 * 动态操作描述生成器 - 基于配置自动生成描述和示例。
 */
export class OperationDescriptions {
  // 集中配置所有操作的元数据
  private static readonly OPERATION_CONFIG: Record<OperationType, OperationConfig> = {
    response: {
      description: '用于回答问题或解释，不修改文件。支持Markdown。用户无法回复，请勿提问。',
      fields: {
        type: { example: 'response' },
        content: {
          description: 'Markdown格式的响应内容',
          example: '**你的Markdown渲染文本回答。**',
          isContent: true,
        },
        comment: { example: '额外说明', optional: true },
      },
    },
    create: {
      description: '创建新文件并指定内容。',
      fields: {
        type: { example: 'create' },
        filePath: {
          example: 'path/to/new_file.jsx',
        },
        content: {
          description: '新文件内容',
          example: "const NewComponent = () => <div>Hello World</div>",
          isContent: true,
        },
        comment: { example: '创建一个新的React组件。', optional: true },
      },
    },
    edit: {
      description: "编辑文件内容。如果提供了 startLine 和 endLine，则替换指定行范围内的内容（不包含 endLine）；否则，将用新内容完全覆盖整个文件。\n现在支持对同一文件进行多次 edit 操作。所有 startLine 和 endLine 相对于文件的初始状态。系统会自动跟踪初始行号并调整后续编辑的位置。为确保正确，请按从顶部到底部的顺序提供非重叠的编辑范围。",
      fields: {
        type: { example: "edit" },
        filePath: {
          example: "path/to/existing_file.jsx"
        },
        content: {
          description: "要写入的内容",
          isContent: true,
          example: "const NewComponent = () => <div>Hello World</div>"
        },
        "startLine": {
          description: "修改范围的起始行号（基于原始文件，从 1 开始计数）",
          example: "5",
          optional: true
        },
        "endLine": {
          description: "修改范围的结束行号（基于原始文件，从 1 开始计数，不包含此行）。指定和 startLine 相同的值可实现插入效果",
          example: "6",
          optional: true
        },
        "comment": {
          example: "修复了组件中的一个拼写错误。",
          optional: true
        }
      }
    },
    rename: {
      description: '重命名现有文件。',
      fields: {
        type: { example: 'rename' },
        oldPath: {
          description: '原始文件路径',
          example: 'path/to/old.ts',
        },
        filePath: {
          description: '新文件路径',
          example: 'path/to/new.ts',
        },
        comment: {
          example: '将文件重命名以更好地反映其功能。',
          optional: true
        },
      },
    },
    delete: {
      description: '删除现有文件。',
      fields: {
        type: { example: 'delete' },
        filePath: {
          example: 'path/to/delete.ts',
        },
        comment: {
          example: '删除不再使用的旧文件。',
          optional: true
        },
      },
    },
  } as const;

  /**
   * 生成所有操作的描述文本，用于AI系统提示。
   * @returns 操作描述字符串。
   */
  static getOperationsDescription(): string {
    let description = '';

    Object.entries(this.OPERATION_CONFIG).forEach(([type, config], index) => {
      description += `${index + 1}. ${type}\n`;
      // 仅当 description 存在时才添加
      if (config.description) {
        description += `${config.description}\n\n`;
      }
      description += '【示例】\n';
      description += `${OPERATION_START_DELIMITER}\n`;

      // 生成 YAML 风格的参数
      Object.entries(config.fields).forEach(([fieldName, fieldConfig]) => {
        if (!fieldConfig.isContent) {
          // 直接使用必选的 example，不再需要回退逻辑
          description += `${fieldName}: ${fieldConfig.example}`;
          if (fieldConfig.optional || fieldConfig.description) {
            description += ` （${fieldConfig.optional ? '【可选】' : ''}${fieldConfig.description ?? ''}）`;
          }
          description += '\n';
        }
      });

      // 添加内容块（如果有）
      const hasContent = Object.values(config.fields).some((f) => f.isContent);
      if (hasContent) {
        description += `${CONTENT_START_DELIMITER}\n`;
        const contentField = Object.values(config.fields).find((f) => f.isContent);
        // contentField 必然存在且有 example 属性
        description += contentField!.example;
        description += `\n${CONTENT_END_DELIMITER}\n`;
      }

      description += `${OPERATION_END_DELIMITER}\n\n`;
    });

    return description;
  }

  /**
   * 获取单个操作的详细描述（用于调试或文档）。
   * @param type - 操作类型。
   * @returns 操作的详细配置。
   */
  static getOperationConfig(type: OperationType) {
    return this.OPERATION_CONFIG[type];
  }
}
