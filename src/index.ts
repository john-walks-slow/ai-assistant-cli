#!/usr/bin/env node

import { Argument, Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs/promises';

import { processRequest, processAiResponse } from './core/main-processor';
import { OPERATION_START_DELIMITER } from './core/operation-definitions';
import { CliStyle } from './utils/cli-style';
import * as packageJson from '../package.json';
import { listAvailableModels, selectModelInteractive } from './commands/model';
import { listConfig, resetConfig, setConfig } from './commands/config';
import { deleteHistory, listHistory, redoHistory, undoHistory } from './commands/history';
import { applyTemplate, listTemplates, showTemplate } from './commands/template';

const program = new Command();

/**
 * 定义主命令 'mai'。
 */
program
  .name('mai')
  .version(packageJson.version)
  .description('简单 AI 编码助手')
  .argument('[prompt]', 'AI指令。未提供时将提示输入。支持 ask: 使用前缀来省略系统提示词。')
  .argument('[files...]', '可选的文件列表作为上下文。')
  .option('-a, --ask', '省略系统提示词，仅发送用户提示。')
  .option('-s, --system <prompt>', '使用自定义系统提示词（覆盖默认系统提示）。')
  .action(async (promptArg: string | undefined, files: string[], options: { ask?: boolean; system?: string; }) => {
    let actualPrompt: string;
    let useDefaultSystemPrompt = true;
    const customSystemPrompt: string | undefined = options.system;

    // 如果未提供指令，则提示用户输入
    if (!promptArg || promptArg.trim() === '') {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log(CliStyle.process('未提供指令。请在下方输入您的请求：'));
      actualPrompt = await new Promise<string>((resolve) => {
        rl.question(CliStyle.prompt('> '), (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!actualPrompt) {
        console.log(CliStyle.warning('未输入指令。退出。'));
        process.exit(0);
      }
    } else {
      // 检查是否为 'ask:' 或 'ask：' 命令
      const trimmedPrompt = promptArg.trim();
      if (trimmedPrompt.startsWith('ask:') || trimmedPrompt.startsWith('ask：')) {
        const prefixLength = trimmedPrompt.startsWith('ask:') ? 4 : 5;
        actualPrompt = trimmedPrompt.substring(prefixLength).trim();
        useDefaultSystemPrompt = false;
      } else {
        actualPrompt = promptArg;
      }
    }

    // 检查 --ask 标志
    if (options.ask) {
      useDefaultSystemPrompt = false;
    }

    // 如果提供了 --system 选项，使用自定义系统提示
    if (customSystemPrompt) {
      useDefaultSystemPrompt = false;
    }

    try {
      if (useDefaultSystemPrompt) {
        await processRequest(actualPrompt, files);
      } else {
        const systemToUse = customSystemPrompt || ''; // 如果没有自定义，使用空提示
        if (systemToUse) {
          console.log(CliStyle.info(`使用自定义系统提示词（长度: ${systemToUse.length} 字符）。`));
        } else {
          console.log(CliStyle.info('已禁用系统提示词。'));
        }
        await processRequest(actualPrompt, files, systemToUse);
      }
    } catch (error) {
      console.error(CliStyle.error(`\n发生严重错误: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

/**
 * 定义 'exec-plan' 命令，用于执行给定自定义格式的计划。
 */
program
  .command('exec-plan <planSource>')
  .description('从文件路径或直接字符串执行给定计划。支持 JSON 和定界（delimited）两种格式。此命令将启动交互式审查流程，允许用户在应用前修改和确认更改，并会自动保存应用计划前的状态。')
  .action(async (planSource: string) => {
    let planContent: string;

    const trimmedSource = planSource.trim();
    // 判断 planSource 是直接的计划内容（定界或JSON）还是文件路径。
    // 如果它以已知格式的起始符开头，则假定是直接内容。
    const isDirectStringContent = trimmedSource.startsWith(OPERATION_START_DELIMITER) ||
      trimmedSource.startsWith('[') ||
      trimmedSource.startsWith('{');

    if (isDirectStringContent) {
      planContent = planSource;
      console.log(CliStyle.info('正在从直接字符串参数执行计划。'));
    } else {
      // 如果不是直接字符串内容，则假定它是文件路径。
      try {
        planContent = await fs.readFile(planSource, 'utf-8');
        console.log(CliStyle.info(`正在从文件执行计划: ${planSource}`));
      } catch (fileError) {
        // 如果它不是直接字符串内容，并且也不是一个可读文件，那么这是一个错误。
        console.error(CliStyle.error(`\n错误: 无法将 '${planSource}' 作为文件读取，且它不符合直接 JSON 或定界字符串格式。`));
        process.exit(1);
      }
    }

    try {
      // 重用现有的AI响应处理逻辑，它处理解析、验证和审查/执行。
      // 传递 planSource 作为 userPrompt，用于历史记录描述。
      await processAiResponse(planContent, `手动执行计划来源: ${planSource}`);
    } catch (error) {
      console.error(CliStyle.error(`\n执行计划失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

/**
 * 定义 'history' 命令，用于版本管理。
 */
program
  .command('history')
  .description('管理项目历史记录（轻量级版本控制）。支持使用 ID/名称 或 ~n 索引格式（如 ~1 表示最近一次）。')
  .addCommand(new Command('list')
    .description('列出所有可用历史记录。')
    .action(async () => {
      await listHistory();
    }))
  .addCommand(new Command('undo')
    .description('撤销指定的历史记录所做的更改，而不删除该历史记录。')
    .addArgument(new Argument('id|name|~n', '历史记录的ID、名称或索引（如 ~1）'))
    .action(async (idOrName: string) => {
      await undoHistory(idOrName);
    }))
  .addCommand(new Command('redo')
    .description('重新应用指定的历史记录所做的更改，而不删除历史记录。')
    .addArgument(new Argument('id|name|~n', '历史记录的ID、名称或索引（如 ~1）'))
    .option('-f, --force', '强制重新应用，跳过内容变化检查')
    .action(async (idOrName: string, options: { force?: boolean; }) => {
      await redoHistory(idOrName, options.force || false);
    }))
  .addCommand(new Command('delete')
    .description('删除指定的历史记录。')
    .addArgument(new Argument('id|name|~n', '历史记录的ID、名称或索引（如 ~1）'))
    .action(async (idOrName: string) => {
      await deleteHistory(idOrName);
    }));

/**
 * 定义 'template' 命令，用于管理和应用提示模板。
 */
program
  .command('template')
  .description('管理和应用AI提示模板。')
  .addCommand(new Command('list')
    .description('列出所有可用的提示模板。')
    .action(async () => {
      await listTemplates();
    }))
  .addCommand(new Command('show')
    .argument('<name>', '要显示详情的模板名称。')
    .description('显示指定提示模板的详细信息。')
    .action(async (name: string) => {
      await showTemplate(name);
    }))
  .addCommand(new Command('apply')
    .argument('<name>', '要应用的模板名称。')
    .argument('[files...]', '可选的文件列表作为上下文。')
    .option('-i, --input <value>', '用于填充 {{user_input}} 占位符的值。')
    .option('-s, --selection <value>', '用于填充 {{selection}} 占位符的值。')
    .description('应用指定的提示模板，并用提供的文件和输入填充占位符。')
    .action(async (name: string, files: string[], options: { input?: string, selection?: string; }) => {
      await applyTemplate(name, files, options);
    }));

/**
 * 定义 'model' 命令，用于管理和选择AI模型。
 */
program
  .command('model')
  .description('管理和选择AI模型。')
  .addCommand(new Command('list')
    .description('列出所有可用的AI模型，并显示当前选中。')
    .action(async () => {
      await listAvailableModels();
    }))
  .addCommand(new Command('select')
    .description('交互式选择AI模型。')
    .action(async () => {
      await selectModelInteractive();
    }));

/**
 * 定义 'config' 命令，用于管理和查看配置。
 */
program
  .command('config')
  .description('管理和查看AI助手配置（模型、系统提示词等）。')
  .addCommand(new Command('list')
    .description('列出当前配置。')
    .action(async () => {
      await listConfig();
    }))
  .addCommand(new Command('set')
    .description('交互式设置配置项。')
    .action(async () => {
      await setConfig();
    }))
  .addCommand(new Command('reset')
    .description('重置所有配置到默认值。')
    .action(async () => {
      await resetConfig();
    }));

program.parse(process.argv);