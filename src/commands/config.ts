import inquirer from 'inquirer';
import * as os from 'os';
import * as path from 'path';

import { CliStyle } from '../utils/cli-style';
import {
  AVAILABLE_MODELS,
  getCurrentModel,
  getSystemPrompt,
  loadConfig,
  ModelType,
  resetConfigCache,
  saveConfig,
  setModel,
  setSystemPrompt,
} from '../utils/config-manager';

/**
 * 列出当前配置。
 */
export async function listConfig(): Promise<void> {
  try {
    const config = await loadConfig();
    const currentModel = await getCurrentModel();
    const systemPrompt = await getSystemPrompt();

    console.log(CliStyle.info('\n--- 当前配置 ---'));
    
    console.log(`模型: ${CliStyle.success(currentModel)}`);
    
    if (systemPrompt) {
      console.log(`系统提示词: ${CliStyle.muted('(已配置，长度: ' + systemPrompt.length + ' 字符)')}`);
    } else {
      console.log(`系统提示词: ${CliStyle.warning('使用默认')}`);
    }
    
    if (config.templates && config.templates.length > 0) {
      console.log(`模板: ${config.templates.length} 个`);
    } else {
      console.log(`模板: ${CliStyle.warning('无')}`);
    }

    console.log(CliStyle.info(`配置文件位置: ${path.join(os.homedir(), '.mai/config.json5')}`));
    console.log(CliStyle.info('--------------------------\n'));
  } catch (error) {
    console.error(CliStyle.error(`列出配置失败: ${(error as Error).message}`));
    process.exit(1);
  }
}

/**
 * 设置配置项。
 */
export async function setConfig(): Promise<void> {
  const choices = [
    { name: '设置AI模型', value: 'model' },
    { name: '设置系统提示词', value: 'systemPrompt' },
    { name: '返回主菜单', value: 'back' },
  ];

  const { choice } = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: '选择要设置的配置项:',
    choices,
  }]);

  if (choice === 'back') {
    return;
  }

  switch (choice) {
    case 'model':
      await setModelInteractive();
      break;
    case 'systemPrompt':
      await setSystemPromptInteractive();
      break;
  }

  // 递归调用以继续配置
  await setConfig();
}

/**
 * 交互式设置 AI 模型。
 */
async function setModelInteractive(): Promise<void> {
  const currentModel = await getCurrentModel();
  console.log(CliStyle.info(`当前模型: ${currentModel}`));

  const { modelChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'modelChoice',
    message: '选择新的AI模型:',
    choices: AVAILABLE_MODELS.map((model) => ({
      name: `${model}${model === currentModel ? ' (当前)' : ''}`,
      value: model,
    })),
  }]);

  await setModel(modelChoice as ModelType);
  console.log(CliStyle.success(`模型已更新为: ${modelChoice}`));
}

/**
 * 交互式设置系统提示词。
 */
async function setSystemPromptInteractive(): Promise<void> {
  const currentPrompt = await getSystemPrompt();
  
  console.log(CliStyle.info('系统提示词用于定义AI的行为和角色。'));
  console.log(CliStyle.muted('默认情况下使用内置的编码助手提示。您可以在这里设置自定义提示。'));
  
  if (currentPrompt) {
    console.log(CliStyle.info(`当前自定义提示长度: ${currentPrompt.length} 字符`));
    const { showCurrent } = await inquirer.prompt([{
      type: 'confirm',
      name: 'showCurrent',
      message: '是否显示当前系统提示词？',
      default: false,
    }]);

    if (showCurrent) {
      console.log(CliStyle.muted('\n--- 当前系统提示词 ---'));
      console.log(currentPrompt);
      console.log(CliStyle.muted('--- 结束 ---\n'));
    }
  }

  const { useEditor, promptText } = await inquirer.prompt([
    {
      type: 'list',
      name: 'useEditor',
      message: '如何输入系统提示词？',
      choices: [
        { name: '使用文本编辑器 (推荐用于长提示)', value: 'editor' },
        { name: '直接在终端输入', value: 'terminal' },
      ],
    },
    {
      type: 'input',
      name: 'promptText',
      message: '输入系统提示词:',
      when: (answers: any) => answers.useEditor === 'terminal',
    },
  ]);

  let newPrompt: string;

  if (useEditor === 'editor') {
    console.log(CliStyle.process('将在您的默认编辑器中打开。保存并关闭以继续...'));
    // 这里可以集成编辑器功能，暂时使用多行输入
    const answers = await inquirer.prompt([{
      type: 'editor',
      name: 'multilinePrompt',
      message: '输入系统提示词 (多行):',
      // postProcess: (v: string) => v.trim(), // Editor 自动处理
    }]);
    newPrompt = answers.multilinePrompt.trim(); // 确保去除可能的空白
  } else {
    newPrompt = promptText!;
  }

  if (!newPrompt || newPrompt.trim() === '') {
    console.log(CliStyle.warning('未输入有效的系统提示词，取消设置。'));
    return;
  }

  await setSystemPrompt(newPrompt);
  console.log(CliStyle.success(`系统提示词已更新 (长度: ${newPrompt.length} 字符)`));
}

/**
 * 重置配置到默认值。
 */
export async function resetConfig(): Promise<void> {
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: '这将重置所有配置到默认值，确定要继续吗？',
    default: false,
  }]);

  if (!confirm) {
    console.log(CliStyle.info('已取消重置。'));
    return;
  }

  try {
    // 创建空的配置对象，这将有效地清除所有自定义配置
    const defaultConfig = {};
    await saveConfig(defaultConfig);
    // 清除内存中的配置缓存
    resetConfigCache();
    console.log(CliStyle.success('配置已重置到默认值。'));
  } catch (error) {
    console.error(CliStyle.error(`重置配置失败: ${(error as Error).message}`));
  }
}