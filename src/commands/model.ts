import * as readline from 'readline';
import { CliStyle } from '../utils/cli-style';
import { AVAILABLE_MODELS, getCurrentModel, ModelType, setModel } from '../utils/config-manager';

/**
 * 列出所有可用的 AI 模型。
 */
export const listAvailableModels = async (): Promise<void> => {
  const current = await getCurrentModel();
  console.log(CliStyle.info('可用模型:'));
  AVAILABLE_MODELS.forEach((model, index) => {
    const marker = model === current ? CliStyle.success(' [当前]') : '';
    console.log(`${index + 1}. ${model}${marker}`);
  });
};

/**
 * 交互式选择 AI 模型。
 */
export const selectModelInteractive = async (): Promise<void> => {
  await listAvailableModels();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(CliStyle.prompt(`请选择模型编号 (1-${AVAILABLE_MODELS.length}): `), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  const choice = parseInt(answer, 10);
  if (isNaN(choice) || choice < 1 || choice > AVAILABLE_MODELS.length) {
    console.log(CliStyle.error('无效选择。退出。'));
    return;
  }

  const selectedModel = AVAILABLE_MODELS[choice - 1];
  await setModel(selectedModel);
  console.log(CliStyle.success(`模型已设置为: ${selectedModel}`));
};