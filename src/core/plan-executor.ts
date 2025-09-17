import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
// import ora from 'ora'; // ora 似乎未被使用，可以移除

import { AiOperation, FileOperation } from '../types/operations';
import { CliStyle } from '../utils/cli-style';
import { appendHistory, HistoryEntry } from '../commands/history';
import { OperationValidator } from './operation-definitions';
import { replaceLines } from '../utils/file-utils';

/**
 * 执行AI提议的文件操作列表。
 * @param operations - 要执行的 FileOperation 对象数组。
 * @param planDescription - 描述此次计划的字符串，用于检查点。
 * @returns 操作执行结果数组，包含成功/失败状态。
 * @throws {Error} 如果计划包含无效操作或执行不完整。
 */
export async function executePlan(operations: FileOperation[], planDescription: string): Promise<AiOperation[]> {
  console.log(CliStyle.info('\n正在执行计划...'));

  // 预加载需要备份的文件初始内容
  const filesToBackup: Set<string> = new Set();
  for (const op of operations) {
    if (op.type === 'edit' || op.type === 'delete') {
      filesToBackup.add(op.filePath);
    }
    if (op.type === 'rename' && op.oldPath) {
      filesToBackup.add(op.oldPath);
    }
  }

  const fileOriginalContents = new Map<string, string>();
  for (const filePath of filesToBackup) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      fileOriginalContents.set(filePath, content);
    } catch (err) {
      // 文件不存在，跳过
    }
  }

  // 初始化文件 delta 映射，用于跟踪行号调整
  const fileDeltas = new Map<string, number>();

  console.log(CliStyle.info('\n正在执行计划...'));

  // 使用 Zod 验证操作
  const validation = OperationValidator.validateOperations(operations);
  if (!validation.isValid) {
    throw new Error(`计划包含无效操作: ${validation.errors?.join('; ') || '未知验证错误'}`);
  }

  // 创建可变操作数组以支持撤销
  const executedOperations = operations.map((op) => ({ ...op }));
  const executionResults: Array<{ operation: FileOperation; success: boolean; error?: string; }> = [];
  let successfulOps = 0;
  let failedOps = 0;

  for (const op of executedOperations) {
    const result: { operation: FileOperation; success: boolean; error?: string; } = { operation: op, success: false };

    try {
      // 设置初始内容（使用预加载）
      if (op.type === 'edit' || op.type === 'delete') {
        op.originalContent = fileOriginalContents.get(op.filePath);
      }
      if (op.type === 'rename' && op.oldPath) {
        op.originalPath = op.oldPath;
      }

      // 执行具体操作
      switch (op.type) {
        case 'create':
          await fs.mkdir(path.dirname(op.filePath), { recursive: true });
          await fs.writeFile(op.filePath, op.content, 'utf-8');
          break;

        case 'edit':
          await fs.mkdir(path.dirname(op.filePath), { recursive: true });

          const isPartialEdit = op.startLine !== undefined && op.endLine !== undefined;
          if (isPartialEdit) {
            const cumDelta = fileDeltas.get(op.filePath) || 0;
            const effectiveStart = op.startLine! + cumDelta;
            const effectiveEnd = op.endLine! + cumDelta;
            await replaceLines(op.filePath, op.content, effectiveStart, effectiveEnd);

            const originalRangeSize = op.endLine! - op.startLine!;
            const newLineCount = op.content.split('\n').length;
            const netDelta = newLineCount - originalRangeSize;
            fileDeltas.set(op.filePath, cumDelta + netDelta);
          } else {
            // 全替换或其他情况
            await fs.writeFile(op.filePath, op.content, 'utf-8');
            // 全替换后，重置 delta（后续编辑将相对于新内容，但按规则使用初始需避免混合）
            fileDeltas.delete(op.filePath);
          }
          break;

        case 'rename':
          await fs.access(op.oldPath!);
          await fs.mkdir(path.dirname(op.filePath), { recursive: true });
          await fs.rename(op.oldPath!, op.filePath);
          break;

        case 'delete':
          await fs.unlink(op.filePath);
          break;

        default:
          throw new Error(`未知操作类型: ${(op as any).type}`);
      }

      result.success = true;
      executionResults.push(result);
      successfulOps++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.error = errorMessage;
      executionResults.push(result);
      failedOps++;

      console.error(CliStyle.error(`\n  执行失败: ${JSON.stringify({ type: op.type, filePath: op.filePath })}`));
      console.error(CliStyle.error(`    错误: ${errorMessage}`));

      // 询问是否继续执行剩余操作
      const { continueExecution } = await inquirer.prompt([{
        type: 'confirm',
        name: 'continueExecution',
        message: '是否继续执行剩余操作？',
        default: true,
      }]);

      if (!continueExecution) {
        console.log(CliStyle.warning('停止执行剩余操作。'));
        break;
      }
    }
  }

  // 检查执行结果
  const totalOps = executionResults.length;
  const executionSummary = `执行完成: ${successfulOps} 成功, ${failedOps} 失败 (共 ${totalOps} 个操作)`;
  console.log(CliStyle.success(executionSummary));

  // 始终保存执行历史，无论成功或失败
  try {
    console.log(CliStyle.muted('正在保存本次AI计划的执行历史...'));
    const operationsDescription = executedOperations
      .map((op) => `${op.type} ${op.filePath} // ${op.comment}`)
      .join('; ');

    const executionDescription = `执行结果: ${successfulOps}/${totalOps} 个操作成功 (${failedOps} 个失败)\n${operationsDescription}`;

    // 创建包含所有操作的历史记录条目（文件操作 + 隐式响应操作）
    const allOperations: AiOperation[] = [
      // 添加一个默认的响应操作来记录执行上下文
      {
        type: 'response',
        content: executionDescription,
      } as AiOperation, // Cast to AiOperation for correct type inference
      ...executedOperations,
    ];

    const historyEntry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      prompt: planDescription,
      description: executionDescription,
      operations: allOperations,
    };

    await appendHistory(historyEntry);
  } catch (error) {
    console.log(CliStyle.warning(`警告：无法保存执行历史: ${(error as Error).message}`));
  }

  // 如果有失败操作，抛出错误
  if (failedOps > 0) {
    throw new Error(`计划执行不完整: ${failedOps} 个操作执行失败`);
  }

  console.log(CliStyle.success('✓ 所有操作执行成功！'));

  return operations;
}