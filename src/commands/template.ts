import * as path from 'path';
import * as fs from 'fs/promises';
import inquirer from 'inquirer';
import { CliStyle } from '../utils/cli-style';
import { TemplateManager } from '../utils/template-manager';
import { processRequest } from '../core/main-processor';

/**
 * 占位符匹配的正则表达式。
 */
const PLACEHOLDER_REGEX = /\{\{(\w+?)\}\}/g;

/**
 * 列出所有可用的提示词模板。
 */
export async function listTemplates(): Promise<void> {
  try {
    const templates = await TemplateManager.listTemplates();

    console.log(CliStyle.info('\n--- 可用的提示词模板 ---'));
    if (templates.length === 0) {
      console.log(
        CliStyle.muted(
          `未找到任何模板。请使用 'mai template create <名称>' 创建模板。`
        )
      );
    } else {
      templates.forEach((template, index) => {
        console.log(`${index + 1}. ${CliStyle.filePath(template.name)}`);
        if (template.description) {
          console.log(`   描述: ${CliStyle.muted(template.description)}`);
        }
        console.log(
          `   模板: ${CliStyle.muted(
            template.template.substring(0, 70) +
              (template.template.length > 70 ? '...' : '')
          )}`
        );
        console.log(`   路径: ${CliStyle.muted(template.filePath)}`);
        console.log();
      });
    }
    console.log(CliStyle.info('--------------------------\n'));
  } catch (error) {
    console.error(CliStyle.error(`列出模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 显示指定模板的详细信息。
 * @param templateName - 要显示的模板名称。
 */
export async function showTemplate(templateName: string): Promise<void> {
  try {
    const template = await TemplateManager.getTemplate(templateName);

    if (!template) {
      console.error(
        CliStyle.error(`错误: 找不到名为 '${templateName}' 的模板。`)
      );
      process.exit(1);
    }

    console.log(CliStyle.info(`\n--- 模板详情: ${template.name} ---`));
    if (template.description) {
      console.log(`描述: ${template.description}`);
    }
    console.log(`路径: ${template.filePath}`);
    console.log(`模板内容:\n${CliStyle.muted(template.template)}`);
    console.log(CliStyle.info('--------------------------\n'));
  } catch (error) {
    console.error(CliStyle.error(`显示模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 创建新模板（文件系统模式）
 */
export async function createTemplate(
  name: string,
  format: 'txt' | 'md' = 'md',
  description?: string
): Promise<void> {
  if (!TemplateManager.isValidTemplateName(name)) {
    console.error(CliStyle.error(`错误: 无效的模板名称 '${name}'`));
    console.error(
      CliStyle.muted('模板名称不能包含特殊字符，长度应在1-50字符之间')
    );
    process.exit(1);
  }

  try {
    // 检查模板是否已存在
    const existingFileTemplate = await TemplateManager.getTemplate(name);

    if (existingFileTemplate) {
      console.error(CliStyle.error(`错误: 模板 '${name}' 已存在`));
      console.error(CliStyle.muted(`路径: ${existingFileTemplate.filePath}`));
      process.exit(1);
    }
    let templateContent = '';
    await TemplateManager.createTemplate(
      name,
      templateContent,
      format,
      description
    );
    console.log(
      CliStyle.success(
        `模板 '${name}' 已创建在 ${await TemplateManager.getTemplatesDir()}`
      )
    );
    console.log(CliStyle.muted(`使用 'mai template edit ${name}' 编辑模板`));
  } catch (error) {
    console.error(CliStyle.error(`创建模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 编辑模板（支持文件系统模板）
 */
export async function editTemplate(templateName: string): Promise<void> {
  try {
    const fileTemplate = await TemplateManager.getTemplate(templateName);

    if (!fileTemplate) {
      console.error(CliStyle.error(`错误: 找不到模板 '${templateName}'`));
      process.exit(1);
    }

    // 读取当前内容
    const currentContent = await TemplateManager.readTemplateFile(
      fileTemplate.filePath,
      fileTemplate.fileName
    );

    if (!currentContent) {
      console.error(
        CliStyle.error(`读取模板文件失败: ${fileTemplate.filePath}`)
      );
      process.exit(1);
    }

    // 提取实际内容（去除描述部分）
    const contentLines = currentContent.template.split('\n');
    const contentStartIndex =
      TemplateManager['findContentStartIndex'](
        contentLines,
        currentContent.format
      ) || 0;
    const actualContent = contentLines
      .slice(contentStartIndex)
      .join('\n')
      .trim();

    // 使用编辑器编辑
    const editor = process.env.EDITOR || 'notepad';
    const tempFile = path.join(
      process.cwd(),
      `.mai_template_edit_${Date.now()}.${currentContent.format}`
    );

    // 写入临时文件
    await fs.writeFile(tempFile, actualContent, 'utf-8');

    console.log(CliStyle.info(`使用 ${editor} 编辑模板 '${templateName}'...`));
    console.log(CliStyle.muted('保存并关闭编辑器以应用更改'));

    // 启动编辑器
    const { execSync } = await import('child_process');
    execSync(`${editor} "${tempFile}"`, { stdio: 'inherit' });

    // 读取编辑后的内容
    const newContent = await fs.readFile(tempFile, 'utf-8');

    // 清理临时文件
    await fs.unlink(tempFile);

    if (newContent.trim() === actualContent.trim()) {
      console.log(CliStyle.info('模板未更改'));
      return;
    }

    // 更新模板
    await TemplateManager.updateTemplate(
      templateName,
      newContent,
      currentContent.description
    );
  } catch (error) {
    console.error(CliStyle.error(`编辑模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 删除模板
 */
export async function deleteTemplate(templateName: string): Promise<void> {
  try {
    const fileTemplate = await TemplateManager.getTemplate(templateName);

    if (!fileTemplate) {
      console.error(CliStyle.error(`错误: 找不到模板 '${templateName}'`));
      process.exit(1);
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确定要删除模板 '${templateName}' 吗？`,
        default: false
      }
    ]);

    if (confirm) {
      await TemplateManager.deleteTemplate(templateName);
    } else {
      console.log(CliStyle.info('删除操作已取消'));
    }
  } catch (error) {
    console.error(CliStyle.error(`删除模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 应用指定的提示词模板。
 * @param templateName - 要应用的模板名称。
 * @param files - 作为上下文的文件列表。
 * @param options - 包含用户输入、选择和自定义占位符值的选项。
 */
export async function applyTemplate(
  templateName: string,
  files: string[],
  options: {
    input?: string;
    selection?: string;
    set?: string[];
    autoApply?: boolean;
  }
): Promise<void> {
  try {
    // 从文件系统查找模板
    const fileTemplate = await TemplateManager.getTemplate(templateName);

    if (!fileTemplate) {
      console.error(
        CliStyle.error(`错误: 找不到名为 '${templateName}' 的模板。`)
      );
      process.exit(1);
    }

    let expandedPrompt = fileTemplate.template;
    const placeholderValues: Record<string, string> = {};

    // 处理预定义占位符
    if (fileTemplate.template.includes('{{fileName}}')) {
      placeholderValues.fileName =
        files.length > 0 ? path.basename(files[0]) : '';
    }

    // 处理来自 CLI 选项的占位符
    if (options.input !== undefined) {
      placeholderValues.user_input = options.input;
    }
    if (options.selection !== undefined) {
      placeholderValues.selection = options.selection;
    }

    // 处理自定义 --set 占位符
    options.set?.forEach((item) => {
      const parts = item.split('=');
      if (parts.length === 2) {
        placeholderValues[parts[0].trim()] = parts[1].trim();
      } else {
        console.warn(
          CliStyle.warning(
            `警告: 无效的 --set 参数格式 '${item}'。应为 'key=value'。`
          )
        );
      }
    });

    const placeholdersToPrompt: string[] = [];
    let match;
    // 使用非全局正则的副本进行匹配，避免 exec 的副作用
    const regexForFinding = new RegExp(PLACEHOLDER_REGEX.source, '');
    while ((match = regexForFinding.exec(fileTemplate.template)) !== null) {
      const placeholderKey = match[1];
      if (placeholderValues[placeholderKey] === undefined) {
        // 如果占位符的值未通过 CLI 选项提供，则需要提示用户
        placeholdersToPrompt.push(placeholderKey);
      }
    }

    // 提示用户输入未提供的占位符值
    for (const key of placeholdersToPrompt) {
      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: CliStyle.prompt(`请输入占位符 '${key}' 的值:`)
        }
      ]);
      placeholderValues[key] = value;
    }

    // 替换模板中的所有占位符
    expandedPrompt = expandedPrompt.replace(PLACEHOLDER_REGEX, (match, key) => {
      return placeholderValues[key] !== undefined
        ? placeholderValues[key]
        : match; // 如果仍然找不到，则保留原始占位符
    });

    console.log(
      CliStyle.process(
        `\n正在应用模板 '${templateName}'${
          fileTemplate.description ? ` (${fileTemplate.description})` : ''
        }。最终指令:\n`
      )
    );
    console.log(CliStyle.muted(expandedPrompt));
    console.log();
    // 调用核心处理函数
    await processRequest(
      expandedPrompt,
      files,
      undefined,
      undefined,
      undefined,
      false,
      options.autoApply || false
    );
  } catch (error) {
    console.error(CliStyle.error(`应用模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}
