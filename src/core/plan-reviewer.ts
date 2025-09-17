import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import ora from 'ora';

import { AiOperation, FileOperation } from '../types/operations';
import { CliStyle } from '../utils/cli-style';
import { openInEditor, showDiffInVsCode } from '../utils/editor';
import { OperationValidator } from './operation-definitions';
import { executePlan } from './plan-executor';

/**
 * 向控制台显示提议的文件操作摘要。
 * @param operations - 要显示的文件操作列表。
 */
export function displayPlan(operations: FileOperation[]): void {
  console.log(CliStyle.warning('\n--- 提议的文件计划 ---'));
  if (operations.length === 0) {
    console.log(CliStyle.muted('未提议文件操作。'));
    console.log(CliStyle.warning('--------------------------\n'));
    return;
  }

  // 使用 Zod 验证操作列表
  const validation = OperationValidator.validateOperations(operations);
  if (!validation.isValid) {
    console.log(CliStyle.error('警告: 发现无效操作，将跳过显示。'));
    console.log(CliStyle.muted(`错误: ${validation.errors?.join(', ') || '未知验证错误'}`));
    return;
  }

  operations.forEach((op) => {
    const typeStyled = CliStyle.operationType(op.type);
    let line = `${typeStyled}: `;
    let commentAndThought = '';

    if (op.comment) {
      commentAndThought += CliStyle.comment(op.comment);
    }
    switch (op.type) {
      case 'create':
        line += CliStyle.filePath(op.filePath);
        break;
      case 'edit':
        line += CliStyle.filePath(op.filePath);
        if (op.startLine && op.endLine) {
          line += ` (lines ${op.startLine} to ${op.endLine})`;
        }
        break;
      case 'delete':
        line += CliStyle.filePath(op.filePath);
        break;
      case 'rename':
        line += `${CliStyle.filePath(op.oldPath || 'unknown')} -> ${CliStyle.filePath(op.filePath)}`;
        break;
      default:
        line = `${CliStyle.warning('未知')}: ${JSON.stringify(op)}`;
        break;
    }

    console.log(`${line}${commentAndThought ? `\n   ${commentAndThought}` : ''}`);
  });
  console.log(CliStyle.warning('--------------------------\n'));
}

/**
 * 使用差异查看器（VS Code）详细审查创建和编辑操作，并允许用户在审查时修改内容。
 * @param operations - 要审查的文件操作列表。
 * @returns 修改后的操作数组。
 */
async function reviewChangesInDetail(operations: FileOperation[]): Promise<FileOperation[]> {
  console.log(CliStyle.process('\n--- 正在审查文件内容更改 ---'));

  // 使用 Zod 验证操作
  const validation = OperationValidator.validateOperations(operations);
  if (!validation.isValid) {
    console.log(CliStyle.error('操作验证失败，无法进行详细审查。'));
    console.log(CliStyle.muted(`错误: ${validation.errors?.join(', ') || '未知验证错误'}`));
    return operations;
  }

  const reviewedOperations: FileOperation[] = [];

  for (const op of operations) {
    if (op.type === 'edit' || op.type === 'create') {
      let originalContentForDiff = '';
      let ignoreLineRange = false;
      if (op.type === 'edit') {
        try {
          await fs.access(op.filePath);
          originalContentForDiff = await fs.readFile(op.filePath, 'utf-8');
          console.log(CliStyle.info(`\n正在显示编辑差异: ${CliStyle.filePath(op.filePath)}`));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.log(CliStyle.warning(`\n文件不存在: ${CliStyle.filePath(op.filePath)}。将提议内容显示为新文件。`));
            originalContentForDiff = '';
            if (op.startLine || op.endLine) {
              console.log(CliStyle.warning('文件不存在，忽略行范围，将作为完整替换处理。'));
              ignoreLineRange = true;
            }
          } else {
            console.log(CliStyle.warning(`\n无法读取文件: ${CliStyle.filePath(op.filePath)}。跳过差异显示。`));
            reviewedOperations.push(op); // 即使跳过差异，仍然保留操作
            continue;
          }
        }
      } else if (op.type === 'create') {
        console.log(CliStyle.info(`\n正在显示创建内容: ${CliStyle.filePath(op.filePath)}`));
        originalContentForDiff = '';
      }

      let fullNewContent = op.content;

      if (op.type === 'edit' && originalContentForDiff !== '' && !ignoreLineRange && op.startLine && op.endLine) {
        const start = op.startLine - 1;
        const end = op.endLine;
        if (isNaN(start) || isNaN(end) || start < 0 || end < start || end > originalContentForDiff.split('\n').length + 1) {
          console.log(CliStyle.warning(`无效的行范围 ${op.startLine}-${op.endLine}，将作为完整替换处理。`));
        } else {
          const lines = originalContentForDiff.split('\n');
          const newLines = op.content.split('\n');
          lines.splice(start, end - start, ...newLines);
          fullNewContent = lines.join('\n');
        }
      }

      try {
        const editedContent = await showDiffInVsCode(
          originalContentForDiff,
          fullNewContent,
          op.filePath,
        );

        if (editedContent !== null) {
          // 用户修改并保存了内容
          const updatedOp = { ...op, content: editedContent } as FileOperation;
          // Since edited full, remove line range
          delete (updatedOp as any).startLine;
          delete (updatedOp as any).endLine;

          // 验证修改后的操作
          const updatedValidation = OperationValidator.validateOperation(updatedOp);
          if (!updatedValidation.isValid) {
            console.log(CliStyle.warning(`警告: 修改后的操作验证失败: ${updatedValidation.errors?.join(', ') || '未知错误'}`));
            reviewedOperations.push(op); // 如果验证失败，保留原始操作
          } else {
            console.log(CliStyle.success(`已更新 ${CliStyle.filePath(op.filePath)} 的计划内容。`));
            reviewedOperations.push(updatedOp);
          }
        } else if (editedContent === null && originalContentForDiff !== '') {
          // Edit 操作，用户未修改
          reviewedOperations.push(op);
        } else if (editedContent === null && originalContentForDiff === '') {
          // Create 操作，用户可能取消了
          console.log(CliStyle.muted(`跳过创建 ${CliStyle.filePath(op.filePath)}。`));
          // 不添加到 reviewedOperations，相当于移除
        }
      } catch (error) {
        console.log(CliStyle.warning(`审查 ${CliStyle.filePath(op.filePath)} 时出错: ${(error as Error).message}`));
        reviewedOperations.push(op); // 发生错误时保留原始操作
      }
    } else {
      reviewedOperations.push(op); // 非创建/编辑操作直接添加
    }
  }
  console.log(CliStyle.process('--- 审查结束 ---\n'));
  return reviewedOperations;
}

/**
 * 允许用户在默认编辑器中手动编辑计划。
 * @param operations - 当前文件操作列表。
 * @returns 成功编辑后的计划数组，或 null。
 */
async function editPlanInEditor(operations: FileOperation[]): Promise<FileOperation[] | null> {
  const editSpinner = ora('打开编辑器进行计划修改...').start();
  try {
    const planString = JSON.stringify(operations, null, 2);
    console.log(CliStyle.process('\n正在您的默认编辑器中打开计划。保存并关闭文件以继续...'));

    const editedString = await openInEditor(planString);

    if (planString === editedString) {
      editSpinner.info('计划中未检测到更改。');
      return null;
    }

    const newPlan = JSON.parse(editedString); // 使用 JSON.parse，假设用户会保存为有效 JSON
    if (!Array.isArray(newPlan)) {
      throw new Error('编辑后的计划必须是有效的JSON数组。');
    }

    // 使用 Zod 验证编辑后的操作
    const validation = OperationValidator.validateOperations(newPlan);
    if (!validation.isValid) {
      console.log(CliStyle.error(`编辑后的计划包含无效操作: ${validation.errors?.join('; ') || '未知错误'}`));
      const { continueAnyway } = await inquirer.prompt([{
        type: 'confirm',
        name: 'continueAnyway',
        message: '是否继续使用可能无效的计划？',
        default: false,
      }]);

      if (!continueAnyway) {
        return null;
      }
    }

    editSpinner.succeed('计划编辑完成');
    console.log(CliStyle.success('计划已成功更新。'));
    return newPlan as FileOperation[];

  } catch (error) {
    editSpinner.fail('编辑计划失败');
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(CliStyle.error(`\n处理编辑计划时出错: ${errorMessage}`));
    return null;
  }
}

/**
 * 启动交互式审查循环，处理提议的文件操作。
 * @param operations - 初始文件操作列表。
 * @param promptMessage - 初始提示消息。
 * @param userPrompt - 原始用户请求，用于检查点描述。
 */
export async function reviewAndExecutePlan(
  operations: FileOperation[],
  promptMessage: string = '',
  userPrompt?: string,
): Promise<void> {
  let currentOperations = [...operations]; // 创建副本
  let inReviewLoop = true;
  let currentPromptMessage: string = promptMessage;

  // 初始验证
  const initialValidation = OperationValidator.validateOperations(currentOperations);
  if (!initialValidation.isValid && currentOperations.length > 0) {
    console.log(CliStyle.error('初始操作验证失败，将显示但可能无法执行。'));
    console.log(CliStyle.muted(`错误: ${initialValidation.errors?.slice(0, 3).join(', ') || '未知错误'}`));
  }

  while (inReviewLoop) {
    if (currentPromptMessage) {
      console.log(CliStyle.info(currentPromptMessage));
    }
    displayPlan(currentOperations);

    const { choice } = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: '选择一个操作:',
      choices: [
        { name: '应用计划', value: 'apply' },
        { name: '审查更改（VS Code diff）', value: 'review' },
        { name: '手动编辑计划 (JSON)', value: 'edit' },
        { name: '取消', value: 'cancel' },
      ],
    }]);

    switch (choice) {
      case 'apply':
        if (currentOperations.length === 0) {
          console.log(CliStyle.warning('没有可应用的文件操作。'));
          inReviewLoop = false;
        } else {
          try {
            // 应用前最终验证
            const finalValidation = OperationValidator.validateOperations(currentOperations);
            if (!finalValidation.isValid) {
              console.log(CliStyle.error('计划包含无效操作，无法应用。'));
              const { forceApply } = await inquirer.prompt([{
                type: 'confirm',
                name: 'forceApply',
                message: '是否强制应用可能无效的计划？',
                default: false,
              }]);

              if (!forceApply) {
                break;
              }
            }

            await executePlan(currentOperations, userPrompt || 'AI plan execution');
            inReviewLoop = false;
          } catch (error) {
            console.error(CliStyle.error(`\n应用计划失败: ${(error as Error).message}`));
            const { retry } = await inquirer.prompt([{
              type: 'confirm',
              name: 'retry',
              message: '是否重试应用计划？',
              default: false,
            }]);

            if (!retry) {
              inReviewLoop = false;
            }
          }
        }
        break;

      case 'review':
        if (currentOperations.length === 0) {
          console.log(CliStyle.warning('没有可详细审查的文件操作。'));
        } else {
          currentOperations = await reviewChangesInDetail(currentOperations);
          if (currentOperations.length === 0) {
            console.log(CliStyle.success('所有操作已在审查中移除。'));
            inReviewLoop = false;
          } else {
            currentPromptMessage = '计划已更新。审查新计划:';
          }
        }
        break;

      case 'edit':
        const editedOps = await editPlanInEditor(currentOperations);
        if (editedOps) {
          currentOperations = editedOps;
          if (currentOperations.length === 0) {
            console.log(CliStyle.success('编辑后计划为空。'));
            inReviewLoop = false;
          } else {
            currentPromptMessage = '计划已更新。审查新计划:';
          }
        }
        break;

      case 'cancel':
        console.log(CliStyle.error('操作已取消。'));
        inReviewLoop = false;
        break;
    }
  }
}