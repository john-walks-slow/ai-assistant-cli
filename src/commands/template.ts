import * as path from 'path';
import inquirer from 'inquirer';
import { CliStyle } from '../utils/cli-style';
import { loadConfig, getConfigFile } from '../utils/config-manager';
import { processRequest } from '../core/main-processor';

/**
 * 占位符匹配的正则表达式。
 */
const PLACEHOLDER_REGEX = /\{\{(\w+?)\}\}/g;

/**
 * 列出所有可用的提示模板。
 */
export async function listTemplates(): Promise<void> {
  try {
    const config = await loadConfig();
    const templates = config.templates || [];

    console.log(CliStyle.info('\n--- 可用的提示模板 ---'));
    if (templates.length === 0) {
      console.log(
        CliStyle.muted(
          `未找到任何模板。通过编辑 ${CliStyle.filePath(getConfigFile())} 添加模板。`,
        ),
      );
    } else {
      templates.forEach((template, index) => {
        console.log(`${index + 1}. ${CliStyle.filePath(template.name)}`);
        if (template.description) {
          console.log(`   描述: ${CliStyle.muted(template.description)}`);
        }
        console.log(
          `   模板: ${CliStyle.muted(template.template.substring(0, 70) + (template.template.length > 70 ? '...' : ''))}`,
        );
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
    const config = await loadConfig();
    const template = config.templates?.find((t) => t.name === templateName);

    if (!template) {
      console.error(
        CliStyle.error(`错误: 找不到名为 '${templateName}' 的模板。`),
      );
      process.exit(1);
    }

    console.log(CliStyle.info(`\n--- 模板详情: ${template.name} ---`));
    if (template.description) {
      console.log(`描述: ${template.description}`);
    }
    console.log(`模板内容:\n${CliStyle.muted(template.template)}`);
    console.log(CliStyle.info('--------------------------\n'));
  } catch (error) {
    console.error(CliStyle.error(`显示模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 应用指定的提示模板。
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
  },
): Promise<void> {
  try {
    const config = await loadConfig();
    const template = config.templates?.find((t) => t.name === templateName);

    if (!template) {
      console.error(
        CliStyle.error(`错误: 找不到名为 '${templateName}' 的模板。`),
      );
      process.exit(1);
    }

    let expandedPrompt = template.template;
    const placeholderValues: Record<string, string> = {};

    // 处理预定义占位符
    if (template.template.includes('{{fileName}}')) {
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
            `警告: 无效的 --set 参数格式 '${item}'。应为 'key=value'。`,
          ),
        );
      }
    });

    const placeholdersToPrompt: string[] = [];
    let match;
    // 使用非全局正则的副本进行匹配，避免 exec 的副作用
    const regexForFinding = new RegExp(PLACEHOLDER_REGEX.source, '');
    while ((match = regexForFinding.exec(template.template)) !== null) {
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
          message: CliStyle.prompt(`请输入占位符 '${key}' 的值:`),
        },
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
      CliStyle.process(`\n正在应用模板 '${templateName}'。最终指令:\n`),
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
      options.autoApply || false,
    );
  } catch (error) {
    console.error(CliStyle.error(`应用模板失败: ${(error as Error).message}`));
    process.exit(1);
  }
}
