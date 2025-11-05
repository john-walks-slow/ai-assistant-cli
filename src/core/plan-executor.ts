import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
// import ora from 'ora'; // ora 似乎未被使用，可以移除

import { CliStyle } from '../utils/cli-style';
import { appendHistory, HistoryEntry, saveExecutionHistory } from '../commands/history';
import { OperationValidator } from './operation-definitions';
import { replaceLines, replaceInFile } from '../utils/file-utils';
import { FileOperation, AiOperation } from './operation-schema';


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
    if (op.type === 'replaceInFile' || op.type === 'delete') {
      filesToBackup.add(op.filePath);
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

  console.log(CliStyle.info('\n正在执行计划...'));

  // 使用 Zod 验证操作
  const validation = OperationValidator.validateOperations(operations);
  if (!validation.isValid) {
    throw new Error(`计划包含无效操作: ${validation.errors?.join('; ') || '未知验证错误'}`);
  }

  // 创建可变操作数组以支持撤销
  const executedOperations: FileOperation[] = operations.map((op) => ({ ...op }));
  const executionResults: Array<{ operation: FileOperation; success: boolean; error?: string; }> = [];
  let successfulOps = 0;
  let failedOps = 0;

  for (const op of executedOperations) {
    const result: { operation: FileOperation; success: boolean; error?: string; } = { operation: op, success: false };

    try {
      // 执行具体操作
      switch (op.type) {
        case 'create':
          await fs.mkdir(path.dirname(op.filePath), { recursive: true });
          await fs.writeFile(op.filePath, op.content, 'utf-8');
          break;
        case 'replaceInFile':
          // Read the file's original content, preserving its line endings (CRLF/LF).
          const originalContent = await fs.readFile(op.filePath, 'utf-8');
          const newContent = replaceInFile(originalContent, op.content, op.find);
          await fs.writeFile(op.filePath, newContent, 'utf-8');
          break;

        case 'rename':
          await fs.access(op.oldPath);
          await fs.mkdir(path.dirname(op.newPath), { recursive: true });
          await fs.rename(op.oldPath, op.newPath);
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

      console.error(CliStyle.error(`\n  执行失败: ${JSON.stringify({ type: op.type, filePath: op.type === 'rename' ? op.newPath : op.filePath })}`));
      console.error(CliStyle.error(`    错误: ${errorMessage}`));
      console.log(CliStyle.warning('停止执行剩余操作。'));
    }
  }

  // 检查执行结果
  const totalOps = executionResults.length;
  const executionSummary = `执行完成: ${successfulOps} 成功, ${failedOps} 失败 (共 ${totalOps} 个操作)`;
  console.log(CliStyle.success(executionSummary));

  const operationsDescription = executedOperations
    .map((op) => `${op.type} ${op.type === 'rename' ? op.newPath : op.filePath} // ${op.comment}`)
    .join('; ');

  const executionDescription = `执行结果: ${successfulOps}/${totalOps} 个操作成功 (${failedOps} 个失败)\n${operationsDescription}`;

  await saveExecutionHistory(executedOperations, planDescription, executionDescription, fileOriginalContents);

  // 如果有失败操作，抛出错误
  if (failedOps > 0) {
    throw new Error(`计划执行不完整: ${failedOps} 个操作执行失败`);
  }

  console.log(CliStyle.success('✓ 所有操作执行成功！'));

  return operations;
}
