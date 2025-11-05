import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';

import { AiOperation, FileOperation } from '../types/operations';
import { CliStyle } from '../utils/cli-style';
import { findGitRoot } from '../utils/git-helper';

/**
 * 历史记录文件的路径。
 */
let GLOBAL_HISTORY_FILE: string;

/**
 * 初始化历史记录文件路径。
 * 查找 Git 仓库根目录，并在其中创建 .mai-history.json 文件。
 */
async function initializeHistoryFile(): Promise<void> {
  if (!GLOBAL_HISTORY_FILE) {
    const gitRoot = await findGitRoot();
    GLOBAL_HISTORY_FILE = path.join(gitRoot, '.mai-history.json');
  }
}

/**
 * 历史记录条目接口。
 */
export interface HistoryEntry {
  id: string;
  name?: string;
  description?: string;
  timestamp: string;
  prompt: string;
  operations: AiOperation[]; // 使用新的 operations 字段，包含所有操作类型
}

/**
 * 解析用户输入的 ID 或名称，支持 ~n 索引格式。
 * @param idOrName - 用户输入的 ID、名称或索引字符串。
 * @param history - 历史记录列表。
 * @returns 包含历史记录条目、索引和是否为索引格式的对象。
 * @throws {Error} 如果未找到历史记录或索引超出范围。
 */
function parseIdOrName(
  idOrName: string,
  history: HistoryEntry[],
): { entry?: HistoryEntry; index?: number; isIndex: boolean } {
  // 检查是否为索引格式 ~n
  if (idOrName.startsWith('~') && /^\~\d+$/.test(idOrName)) {
    const index = parseInt(idOrName.slice(1), 10);
    if (index > 0 && index <= history.length) {
      return { entry: history[index - 1], index: index - 1, isIndex: true };
    } else {
      throw new Error(`索引 ${idOrName} 超出范围 (有效范围: 1-${history.length})`);
    }
  }
  
  // 按 ID 或名称查找
  const foundEntry = history.find((h) => h.id === idOrName || h.name === idOrName);
  if (foundEntry) {
    const index = history.indexOf(foundEntry);
    return { entry: foundEntry, index, isIndex: false };
  }
  
  throw new Error(`未找到历史记录: ${idOrName}`);
}

/**
 * 加载历史记录。
 * @returns 历史记录条目数组。
 */
async function loadHistory(): Promise<HistoryEntry[]> {
  await initializeHistoryFile();
  try {
    const data = await fs.readFile(GLOBAL_HISTORY_FILE, 'utf-8');
    return JSON.parse(data) as HistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * 保存历史记录。
 * @param history - 要保存的历史记录数组。
 */
async function saveHistory(history: HistoryEntry[]): Promise<void> {
  await initializeHistoryFile();
  await fs.writeFile(GLOBAL_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * 将新的历史记录条目追加到历史记录中。
 * @param entry - 要追加的历史记录条目。
 */
export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const history = await loadHistory();
  history.unshift(entry);
  await saveHistory(history);
}

/**
 * 列出所有历史记录。
 */
export async function listHistory(): Promise<void> {
  const history = await loadHistory();
  if (history.length === 0) {
    console.log(CliStyle.info('没有历史记录。'));
    return;
  }

  console.log(CliStyle.success('历史记录:'));
  console.log(CliStyle.muted('使用 ~n 格式（如 ~1 表示最近一次）来引用历史记录。'));
  history.forEach((entry, index) => {
    const idOrName = entry.name || entry.id;
    const opCount = entry.operations.length;
    const fileOpCount = entry.operations.filter((op): op is FileOperation => op.type !== 'response').length;
    const responseCount = opCount - fileOpCount;

    console.log(`${CliStyle.info(`${index + 1}. ${idOrName} (~${index + 1})`)} - ${entry.description} (${new Date(entry.timestamp).toLocaleString()})`);
    console.log(`   提示: ${CliStyle.muted(entry.prompt.substring(0, 50) + (entry.prompt.length > 50 ? '...' : ''))}`);
    console.log(`   操作: ${fileOpCount} 文件操作 ${responseCount > 0 ? `+ ${responseCount} 响应` : ''}`);
    console.log();
  });
}

/**
 * 撤销指定的历史记录所做的更改。
 * @param idOrName - 要撤销的历史记录的 ID、名称或索引。
 */
export async function undoHistory(idOrName: string): Promise<void> {
  const history = await loadHistory();
  if (history.length === 0) {
    console.error(CliStyle.error('没有历史记录可撤销。'));
    return;
  }

  let entry: HistoryEntry;
  let index: number | undefined;
  let isIndex = false;

  try {
    const result = parseIdOrName(idOrName, history);
    entry = result.entry!;
    index = result.index;
    isIndex = result.isIndex;
  } catch (error) {
    console.error(CliStyle.error(String(error)));
    return;
  }

  const displayId = isIndex ? `~${index! + 1}` : (entry.name || entry.id);
  console.log(CliStyle.process(`正在撤销: ${entry.description} (${displayId})`));
  console.log(CliStyle.muted(`涉及 ${entry.operations.length} 个操作（${entry.operations.filter((op): op is FileOperation => op.type !== 'response').length} 个文件操作）`));

  // 只处理文件操作，忽略 response 操作
  const fileOperations = entry.operations.filter((op): op is FileOperation => op.type !== 'response').reverse();

  for (const op of fileOperations) {
    try {
      switch (op.type) {
        case 'create':
          // 撤销创建：删除文件（如果存在）
          await fs.unlink(op.filePath).catch((err) => {
            if (err.code !== 'ENOENT') {
              console.error(CliStyle.warning(`删除 ${op.filePath} 时出错: ${err.message}`));
            }
          });
          console.log(CliStyle.success(`  ✓ 删除: ${op.filePath}`));
          break;

        case 'edit':
          // 撤销写入：恢复原始内容（如果有）
          if (op.originalContent !== undefined) {
            await fs.writeFile(op.filePath, op.originalContent, 'utf-8');
            console.log(CliStyle.success(`  ✓ 恢复: ${op.filePath}`));
          } else {
            console.log(CliStyle.warning(`  跳过恢复: ${op.filePath} (无原始内容备份，请手动处理)`));
          }
          break;

        case 'rename':
          // 撤销重命名：恢复原始路径
          if (op.originalPath) {
            await fs.rename(op.filePath, op.originalPath); // new -> old
            console.log(CliStyle.success(`  ✓ 恢复重命名: ${op.filePath} -> ${op.originalPath}`));
          } else {
            console.log(CliStyle.warning(`  跳过重命名操作: ${op.filePath} (无原始路径)`));
          }
          break;

        case 'delete':
          // 撤销删除：重新创建文件
          if (op.originalContent !== undefined) {
            await fs.mkdir(path.dirname(op.filePath), { recursive: true });
            await fs.writeFile(op.filePath, op.originalContent, 'utf-8');
            console.log(CliStyle.success(`  ✓ 恢复: ${op.filePath}`));
          } else {
            console.log(CliStyle.warning(`  跳过恢复删除: ${op.filePath} (无原始内容)`));
          }
          break;

        default:
          console.log(CliStyle.warning(`  未知操作类型: ${(op as any).type}`));
      }
    } catch (error) {
      console.error(CliStyle.error(`  撤销 ${op.type} ${op.filePath} 失败: ${String(error)}`));
    }
  }

  console.log(CliStyle.success(`\n撤销完成: ${entry.description} (${displayId})`));
  // 保留历史记录以支持 redo
}

/**
 * 重新应用指定的历史记录所做的更改。
 * @param idOrName - 要重新应用的历史记录的 ID、名称或索引。
 * @param force - 是否强制重新应用，跳过内容变化检查。
 */
export async function redoHistory(idOrName: string, force: boolean = false): Promise<void> {
  const history = await loadHistory();
  if (history.length === 0) {
    console.error(CliStyle.error('没有历史记录可重新应用。'));
    return;
  }

  let entry: HistoryEntry;
  let index: number | undefined;
  let isIndex = false;

  try {
    const result = parseIdOrName(idOrName, history);
    entry = result.entry!;
    index = result.index;
    isIndex = result.isIndex;
  } catch (error) {
    console.error(CliStyle.error(String(error)));
    return;
  }

  const displayId = isIndex ? `~${index! + 1}` : (entry.name || entry.id);
  console.log(CliStyle.process(`正在重新应用: ${entry.description} (${displayId})`));
  console.log(CliStyle.muted(`涉及 ${entry.operations.length} 个操作（${entry.operations.filter((op): op is FileOperation => op.type !== 'response').length} 个文件操作）`));

  // 只处理文件操作，按原始顺序重新应用
  const fileOperations = entry.operations.filter((op): op is FileOperation => op.type !== 'response');

  // 检查内容是否发生变化
  let hasChanges = false;
  const changeDetails: string[] = [];

  for (const op of fileOperations) {
    if (op.type === 'edit' || op.type === 'create') {
      try {
        const fileExists = await fs.access(op.filePath).then(() => true).catch(() => false);
        if (fileExists) {
          const currentContent = await fs.readFile(op.filePath, 'utf-8');
          const expectedContent = op.content || '';
          if (currentContent !== expectedContent) {
            hasChanges = true;
            changeDetails.push(`${op.filePath} (内容已修改)`);
          }
        }
      } catch (error) {
        // 如果检查文件时出错，保守地认为有变化
        hasChanges = true;
        changeDetails.push(`${op.filePath} (无法检查内容: ${String(error)})`);
      }
    } else if (op.type === 'rename') {
      try {
        const targetExists = await fs.access(op.filePath).then(() => true).catch(() => false);
        const sourceExists = await fs.access(op.oldPath || '').then(() => true).catch(() => false);
        if (targetExists || !sourceExists) { // 如果目标文件存在或源文件不存在，则认为有变化
          hasChanges = true;
          changeDetails.push(`${op.filePath} (文件位置已变化)`);
        }
      } catch (error) {
        // 如果检查文件时出错，保守地认为有变化
        hasChanges = true;
        changeDetails.push(`${op.filePath} (无法检查位置: ${String(error)})`);
      }
    } else if (op.type === 'delete') {
      try {
        const fileExists = await fs.access(op.filePath).then(() => true).catch(() => false);
        if (fileExists) { // 如果文件仍然存在，说明未被删除
          hasChanges = true;
          changeDetails.push(`${op.filePath} (文件已恢复，需要再次删除)`);
        }
      } catch (error) {
        // 如果检查文件时出错，保守地认为文件可能已恢复
        hasChanges = true;
        changeDetails.push(`${op.filePath} (无法检查存在性: ${String(error)})`);
      }
    }
  }

  // 如果检测到变化且没有 force 选项，询问用户
  if (hasChanges && !force) {
    console.log(CliStyle.warning('\n⚠️  检测到内容变化：'));
    changeDetails.forEach((detail) => {
      console.log(`   - ${detail}`);
    });
    
    const { shouldContinue, useForce } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: '内容已发生变化，是否仍然要重新应用？（可能覆盖当前更改）',
        default: false,
      },
      {
        type: 'confirm',
        name: 'useForce',
        message: '是否将此操作标记为强制模式（跳过未来变化检查）？',
        default: false,
        when: (answers: any) => answers.shouldContinue,
      },
    ]);

    if (!shouldContinue) {
      console.log(CliStyle.info('已取消重新应用。'));
      return;
    }

    // 如果用户选择强制模式，递归调用自己并传递 force=true
    if (useForce) {
      return await redoHistory(idOrName, true);
    }
  } else if (hasChanges && force) {
    console.log(CliStyle.warning('\n⚠️  强制模式：检测到以下内容变化，但将忽略并继续：'));
    changeDetails.forEach((detail) => {
      console.log(`   - ${detail}`);
    });
  } else if (!hasChanges && force) {
    // 强制模式但没有实际检测到变化，可以这样提示或不做任何事
    console.log(CliStyle.info('\nℹ️  强制模式已启用，未检测到显著变化，将继续执行。'));
  }


  for (const op of fileOperations) {
    try {
      switch (op.type) {
        case 'create':
          await fs.mkdir(path.dirname(op.filePath), { recursive: true });
          await fs.writeFile(op.filePath, op.content || '', 'utf-8');
          console.log(CliStyle.success(`  ✓ 创建: ${op.filePath}`));
          break;

        case 'edit':
          await fs.mkdir(path.dirname(op.filePath), { recursive: true });
          await fs.writeFile(op.filePath, op.content || '', 'utf-8');
          console.log(CliStyle.success(`  ✓ 写入: ${op.filePath}`));
          break;

        case 'rename':
          if (op.oldPath) {
            // 确保源文件存在，如果不存在则跳过
            const sourceExists = await fs.access(op.oldPath).then(() => true).catch(() => false);
            if (sourceExists) {
              await fs.rename(op.oldPath, op.filePath);
              console.log(CliStyle.success(`  ✓ 重命名: ${op.oldPath} -> ${op.filePath}`));
            } else {
              console.log(CliStyle.warning(`  跳过重命名: 源文件 ${op.oldPath} 不存在`));
            }
          } else {
            console.log(CliStyle.warning(`  跳过重命名操作: ${op.filePath} (无源路径)`));
          }
          break;

        case 'delete':
          await fs.unlink(op.filePath).catch((err) => {
            if (err.code !== 'ENOENT') {
              console.error(CliStyle.warning(`删除 ${op.filePath} 时出错: ${err.message}`));
            } else {
              console.log(CliStyle.muted(`  跳过删除: ${op.filePath} (文件已不存在)`));
            }
          });
          break;

        default:
          console.log(CliStyle.warning(`  未知操作类型: ${(op as any).type}`));
      }
    } catch (error) {
      console.error(CliStyle.error(`  重新应用 ${op.type} ${op.filePath} 失败: ${String(error)}`));
    }
  }

  console.log(CliStyle.success(`\n重新应用完成: ${entry.description} (${displayId})`));
}

/**
 * 删除指定的历史记录。
 * @param idOrName - 要删除的历史记录的 ID、名称或索引。
 */
export async function deleteHistory(idOrName: string): Promise<void> {
  const history = await loadHistory();
  if (history.length === 0) {
    console.error(CliStyle.error('没有历史记录可删除。'));
    return;
  }

  let entry: HistoryEntry | undefined;
  let index: number | undefined;
  let isIndex = false;

  try {
    const result = parseIdOrName(idOrName, history);
    entry = result.entry;
    index = result.index;
    isIndex = result.isIndex;
  } catch (error) {
    console.error(CliStyle.error(String(error)));
    return;
  }

  if (!entry) {
    console.error(CliStyle.error(`未找到历史记录: ${idOrName}`));
    return;
  }

  const displayId = isIndex ? `~${index! + 1}` : (entry.name || entry.id);
  const initialLength = history.length;
  const filteredHistory = history.filter((h) => h !== entry);

  await saveHistory(filteredHistory);
  console.log(CliStyle.success(`已删除历史记录: ${displayId} (${initialLength - filteredHistory.length} 个条目）`));
}