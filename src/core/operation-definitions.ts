
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AiOperation,
  OperationType,
  validateOperation,
  validateOperations,
  ValidationResult,
  FileOperation,
} from './operation-schema';

/**
 * 操作分隔符常量。
 */
export function startDelimiter(identifier: string = 'OPERATION') {
  return `--- ${identifier} START ---`;
}
export function endDelimiter(identifier: string = 'OPERATION') {
  return `--- ${identifier} END ---`;
}
// 正则表达式确保定界符占据一整行（忽略前后空格）
// ^([A-Z0-9_]+)_START$ 匹配以 _START 结尾的完整字符串，并捕获前面的部分
export const startDelimiterRegex = /^--- ([A-Za-z0-9_]+) START ---$/;
export const endDelimiterRegex = /^--- ([A-Za-z0-9_]+) END ---$/;

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

  /**
   * 验证操作的可达性（文件系统检查）。
   * @param op - 要验证的操作对象。
   * @returns 验证结果。
   */
  static async validateOperationReachability(op: FileOperation): Promise<ValidationResult> {
    try {
      switch (op.type) {
        case 'create':
          return await this.validateCreateReachability(op);
        case 'replaceInFile':
          return await this.validateReplaceInFileReachability(op);
        case 'rename':
          return await this.validateRenameReachability(op);
        case 'delete':
          return await this.validateDeleteReachability(op);
        default:
          return { isValid: false, errors: [`未知操作类型: ${(op as any).type}`] };
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [`验证可达性时出错: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 验证操作数组的可达性。
   * @param operations - 文件操作数组。
   * @returns 验证结果。
   */
  static async validateOperationsReachability(operations: FileOperation[]): Promise<ValidationResult> {
    const errors: string[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const result = await this.validateOperationReachability(op);
      if (!result.isValid) {
        result.errors?.forEach(error => {
          errors.push(`操作 ${i + 1} (${op.type}): ${error}`);
        });
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    return { isValid: true };
  }

  /**
   * 验证创建操作的可达性。
   */
  private static async validateCreateReachability(op: FileOperation): Promise<ValidationResult> {
    const filePath = (op as any).filePath;
    if (!filePath) {
      return { isValid: false, errors: ['创建操作缺少文件路径'] };
    }

    try {
      // 检查目标目录是否存在
      const dir = path.dirname(filePath);
      await fs.access(dir);

      // 检查文件是否已存在
      try {
        await fs.access(filePath);
        return { isValid: false, errors: [`文件已存在: ${filePath}`] };
      } catch {
        // 文件不存在，这是期望的
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, errors: [`无法访问目标目录: ${path.dirname(filePath)}`] };
    }
  }

  /**
   * 验证替换操作的可达性。
   */
  private static async validateReplaceInFileReachability(op: FileOperation): Promise<ValidationResult> {
    const filePath = (op as any).filePath;
    if (!filePath) {
      return { isValid: false, errors: ['替换操作缺少文件路径'] };
    }

    try {
      // 检查文件是否存在
      await fs.access(filePath);

      // 如果提供了find参数，验证它在文件中是否存在
      const find = (op as any).find;
      if (find) {
        const content = await fs.readFile(filePath, 'utf-8');
        const findCount = (content.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (findCount === 0) {
          return { isValid: false, errors: [`在文件中找不到要替换的文本: ${filePath}`] };
        } else if (findCount > 1) {
          return { isValid: false, errors: [`在文件中找到多个匹配项 (${findCount}个)，需要更具体的查找文本: ${filePath}`] };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, errors: [`无法访问文件: ${filePath}`] };
    }
  }

  /**
   * 验证重命名操作的可达性。
   */
  private static async validateRenameReachability(op: FileOperation): Promise<ValidationResult> {
    const oldPath = (op as any).oldPath;
    const newPath = (op as any).newPath;

    if (!oldPath || !newPath) {
      return { isValid: false, errors: ['重命名操作缺少源路径或目标路径'] };
    }

    try {
      // 检查源文件是否存在
      await fs.access(oldPath);

      // 检查目标路径是否可用
      const newDir = path.dirname(newPath);
      await fs.access(newDir);

      // 检查目标文件是否已存在
      try {
        await fs.access(newPath);
        return { isValid: false, errors: [`目标文件已存在: ${newPath}`] };
      } catch {
        // 目标文件不存在，这是期望的
      }

      return { isValid: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('源文件')) {
        return { isValid: false, errors: [`源文件不存在: ${oldPath}`] };
      }
      return { isValid: false, errors: [`无法访问目标目录: ${path.dirname(newPath)}`] };
    }
  }

  /**
   * 验证删除操作的可达性。
   */
  private static async validateDeleteReachability(op: FileOperation): Promise<ValidationResult> {
    const filePath = (op as any).filePath;
    if (!filePath) {
      return { isValid: false, errors: ['删除操作缺少文件路径'] };
    }

    try {
      // 检查文件是否存在
      await fs.access(filePath);
      return { isValid: true };
    } catch (error) {
      return { isValid: false, errors: [`文件不存在: ${filePath}`] };
    }
  }
}

type FieldConfig = {
  example: string;
  description?: string;
  isBlock?: boolean;
  optional?: boolean;
};

type TypedOperationConfig<T extends OperationType> = {
  description?: string;
  fields: {
    [K in keyof Extract<AiOperation, { type: T; }>]: FieldConfig;
  };
};

type OperationConfigs = {
  [K in Exclude<OperationType, 'edit'>]: TypedOperationConfig<K>;
};

/**
 * 动态操作描述生成器 - 基于配置自动生成描述和示例。
 */
export class OperationDescriptions {
  // 集中配置所有操作的元数据
  private static readonly OPERATION_CONFIG: OperationConfigs = {
    response: {
      description: '用于回答问题或解释，不修改文件。支持Markdown。用户无法回复，请勿提问。',
      fields: {
        type: { example: 'response' },
        comment: { example: '额外说明', optional: true },
        content: {
          example: '**你的Markdown渲染文本回答。**',
          isBlock: true,
        },
      },
    },
    create: {
      description: '创建新文件并指定内容。',
      fields: {
        type: { example: 'create' },
        filePath: {
          example: 'path/to/new_file.jsx',
        },
        comment: { example: '创建一个新的React组件。', optional: true },
        content: {
          example: "const NewComponent = () => <div>Hello World</div>",
          isBlock: true,
        },
      },
    },

    replaceInFile: {
      description: '使用文本替换工具编辑文件内容。',
      fields: {
        type: { example: 'replaceInFile' },
        filePath: {
          example: 'path/to/file.txt',
        },
        comment: {
          example: '修复了组件中的一个拼写错误。',
          optional: true,
        },
        find: {
          example: 'const NewComponent = () => <div>Helo World</div>',
          description: `要查找并替换的目标文本。不支持通配符和正则表达式，对大小写敏感。*必须保证当前文件中有且仅有一个匹配项。*如果留空，则替换整个文件的内容。`,
          optional: true,
          isBlock: true
        },
        content: {
          example: 'const NewComponent = () => <div>Hello World</div>',
          description: '替换为的新内容',
          isBlock: true,
        },

      },
    },
    // edit: {
    //   description: "编辑文件内容。如果提供了 startLine 和 endLine，则替换指定行范围内的内容（不包含 endLine）；否则，将用新内容完全覆盖整个文件。\n现在支持对同一文件进行多次 edit 操作。所有 startLine 和 endLine 相对于文件的初始状态。系统会自动跟踪初始行号并调整后续编辑的位置。为确保正确，请按从顶部到底部的顺序提供非重叠的编辑范围。",
    //   fields: {
    //     type: { example: "edit" },
    //     filePath: {
    //       example: "path/to/existing_file.jsx"
    //     },
    //     content: {
    //       description: "要写入的内容",
    //       isContent: true,
    //       example: "const NewComponent = () => <div>Hello World</div>"
    //     },
    //     "startLine": {
    //       description: "修改范围的起始行号（基于原始文件，从 1 开始计数）",
    //       example: "5",
    //       optional: true
    //     },
    //     "endLine": {
    //       description: "修改范围的结束行号（基于原始文件，从 1 开始计数，不包含此行）。指定和 startLine 相同的值可实现插入效果",
    //       example: "6",
    //       optional: true
    //     },
    //     "comment": {
    //       example: "修复了组件中的一个拼写错误。",
    //       optional: true
    //     }
    //   }
    // },
    rename: {
      description: '重命名现有文件。',
      fields: {
        type: { example: 'rename' },
        oldPath: {
          description: '原始文件路径',
          example: 'path/to/old.ts',
        },
        newPath: {
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

    for (const [type, config] of Object.entries(this.OPERATION_CONFIG)) {
      const index = Object.keys(this.OPERATION_CONFIG).indexOf(type);
      description += `${index + 1}. ${type}\n`;

      if (config.description) {
        description += `${config.description}\n\n`;
      }

      description += '【示例】\n';
      description += `${startDelimiter()}\n`;

      // 遍历操作的字段并生成描述
      for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
        // 1. 生成 JSDoc 风格的注释块
        description += this._buildFieldComment(fieldConfig);

        // 2. 生成字段本身的内容
        if (fieldConfig.isBlock) {
          description += startDelimiter(fieldName);
          description += `\n${fieldConfig.example}\n`;
          description += endDelimiter(fieldName);
        } else {
          description += `${fieldName}: ${fieldConfig.example}`;
        }
        description += '\n';
      }
      description += `${endDelimiter()}\n\n`;
    }

    return description;
  }

  /**
   * 根据字段配置构建一个 JSDoc 风格的注释块。
   * @param fieldConfig - 单个字段的配置对象。
   * @returns 格式化后的 JSDoc 注释字符串，如果无需注释则为空字符串。
   * @private
   */
  private static _buildFieldComment({ description, optional }: { description?: string; optional?: boolean; }): string {

    let commentBlock = '';
    if (!description && !optional) {
      return commentBlock;
    }
    // commentBlock += '\n';
    // 构建 JSDoc 注释块
    if (description && description.split('\n').length > 1) {
      commentBlock += '/**\n';
      if (optional) {
        commentBlock += ` * （可选）`;
      }
      for (const line of description.split('\n')) {
        commentBlock += ` * ${line}\n`;
      }
      commentBlock += ' */\n';
    } else {
      commentBlock += `/** ${optional ? '（可选）' : ''}${description ?? ''} */\n`;
    }

    return commentBlock;
  }

}
