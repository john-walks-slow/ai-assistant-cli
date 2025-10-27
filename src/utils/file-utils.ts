import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import picomatch = require('picomatch');
import { findGitRoot } from './git-helper';
import { FileContextItem } from '../core/file-context';
import { CliStyle } from './cli-style';

export async function isFileIgnored(relativePath: string): Promise<boolean> {
  try {
    const root = await findGitRoot();
    const gitignorePath = path.join(root, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    const positivePatterns: string[] = [];
    const negativePatterns: string[] = [];

    for (const line of lines) {
      if (line.startsWith('!')) {
        negativePatterns.push(line.slice(1)); // 移除 !
      } else {
        positivePatterns.push(line);
      }
    }

    if (positivePatterns.length === 0) return false;

    const positiveMatcher = picomatch(positivePatterns, {
      bash: true,
      dot: true,
    });
    const negativeMatcher = picomatch(negativePatterns, {
      bash: true,
      dot: true,
    });

    const isPositiveMatch = positiveMatcher(relativePath);
    const isNegativeMatch = negativeMatcher(relativePath);

    return isPositiveMatch && !isNegativeMatch;
  } catch (error) {
    // 如果 .gitignore 不存在或读取失败，不忽略任何文件
    return false;
  }
}

export async function replaceLines(
  filePath: string,
  newContent: string,
  startLine?: number,
  endLine?: number,
  encoding: BufferEncoding = 'utf8',
) {
  try {
    // 1. 读取文件内容
    const data = await fs.readFile(filePath, encoding);

    // 2. 按行分割
    let lines = data.split(/\r?\n/); // 使用正则表达式以支持不同操作系统的换行符

    // 行号通常从1开始，而数组索引从0开始，因此需要调整
    const startIndex = startLine ? startLine - 1 : 0;
    const endIndex = endLine ? endLine - 1 : lines.length;

    // 3. 内容替换
    // 获取开始行之前的内容
    const before = lines.slice(0, startIndex);
    // 获取结束行之后的内容
    const after = lines.slice(endIndex);

    // 将新内容也按行分割
    const newContentLines = newContent.split(/\r?\n/);

    // 组合新的文件内容
    const newLines = [...before, ...newContentLines, ...after];

    // 4. 拼接内容
    const newFileContent = newLines.join('\n');

    // 5. 写回文件
    await fs.writeFile(filePath, newFileContent, encoding);
  } catch (err) {
    console.error('处理文件时发生错误:', err);
  }
}

/**
 * 执行文件内容替换操作，返回新的文件内容。
 * @param originalContent - 文件的原始内容。
 * @param find - 要查找的字符串（可选，如果未提供，则直接用 content 替换整个内容）。
 * @param content - 要替换的内容。
 * @returns 替换后的新内容。
 * @throws {Error} 如果替换执行失败。
 */
export function replaceInFile(
  originalContent: string,
  content: string,
  find?: string,
): string {
  let newContent = content;

  // 如果有 find，则替换；否则直接用 content
  if (find) {
    const lineEnding = originalContent.includes('\r\n') ? '\r\n' : '\n';
    const replacementString = content.replace(/(?<!\r)\n/g, lineEnding);
    const adaptedFind = find.replace(/(?<!\r)\n/g, lineEnding);
    const matchCount = originalContent.split(adaptedFind).length - 1;

    if (matchCount === 0) {
      throw new Error(`未找到匹配项: ${JSON.stringify(adaptedFind)}`);
    }

    if (matchCount > 1) {
      throw new Error(
        `找到多个匹配项: ${JSON.stringify(adaptedFind)}，请指定更具体的匹配模式`,
      );
    }

    newContent = originalContent.replace(adaptedFind, replacementString);
  }

  return newContent;
}

export function computeFindMatchCount(
  originalContent: string,
  find: string,
): number {
  const lineEnding = originalContent.includes('\r\n') ? '\r\n' : '\n';
  const adaptedFind = find.replace(/(?<!\r)\n/g, lineEnding);
  return originalContent.split(adaptedFind).length - 1;
}

export function extractKeywordsFromPrompt(prompt: string): string[] {
  // 简单提取关键词：分割单词，过滤短词和常见词
  const words = prompt
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !['the', 'and', 'for', 'with', 'this', 'that'].includes(w),
    );
  return [...new Set(words)]; // 去重
}

export async function getProjectOverview(): Promise<string> {
  const rootDir = process.cwd();
  let overview = `项目根目录: ${rootDir}\n文件和目录结构:\n`;

  async function buildTree(dir: string, prefix = ''): Promise<string> {
    let tree = '';
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fullEntryPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootDir, fullEntryPath);
        if (await isFileIgnored(relativePath)) continue;
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');

        tree += `${prefix}${connector}${entry.name}\n`;

        if (entry.isDirectory()) {
          tree += await buildTree(fullEntryPath, newPrefix);
        }
      }
    } catch (err) {
      tree += `${prefix}无法读取目录\n`;
    }
    return tree;
  }

  overview += await buildTree(rootDir);
  return overview;
}

export async function searchProject(
  keywords: string[],
): Promise<FileContextItem[]> {
  if (keywords.length === 0) return [];
  const rootDir = process.cwd();
  const items: FileContextItem[] = [];

  async function searchInDir(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // 跳过 node_modules 等
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          await searchInDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const relativePath = path.relative(rootDir, fullPath);
            if (await isFileIgnored(relativePath)) continue;
            const content = await fs.readFile(fullPath, 'utf-8');
            const hasMatch = keywords.some((kw) => content.includes(kw));
            if (hasMatch) {
              items.push({
                path: relativePath,
                comment: `匹配关键词: ${keywords.slice(0, 2).join(', ')}${keywords.length > 2 ? ' 等' : ''}`,
              });
            }
          } catch {}
        }
      }
    } catch {}
  }

  await searchInDir(rootDir);
  return items.slice(0, 5); // 限制返回最多5个
}

export async function validateFilePaths(
  items: FileContextItem[],
): Promise<FileContextItem[]> {
  const validItems: FileContextItem[] = [];
  for (const item of items) {
    try {
      await fs.access(item.path);
      validItems.push(item);
    } catch {
      console.log(CliStyle.warning(`跳过不存在的文件: ${item.path}`));
    }
  }
  return validItems;
}

/**
 * 列出指定目录中的文件，支持递归和文件模式过滤。
 * @param dirPath - 目录路径 (相对根目录，默认 '.')
 * @param recursive - 是否递归 (默认 true)
 * @param filePattern - 文件 glob 模式 (可选，如 '*.ts')
 * @returns 相对路径的文件数组
 */
export async function listFilesInDirectory(
  dirPath: string = '.',
  recursive: boolean = true,
  filePattern?: string,
): Promise<string[]> {
  const rootDir = process.cwd();
  const fullDir = path.join(rootDir, dirPath);
  const files: string[] = [];

  async function scanDir(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);

        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          if (recursive) {
            await scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          if (
            !filePattern ||
            entry.name.match(new RegExp(filePattern.replace(/\*/g, '.*')))
          ) {
            if (await isFileIgnored(relativePath)) continue;
            files.push(relativePath);
          }
        }
      }
    } catch (err) {
      console.log(
        CliStyle.warning(
          `无法读取目录 ${currentDir}: ${(err as Error).message}`,
        ),
      );
    }
  }

  await scanDir(fullDir);
  return files;
}

/**
 * 高级文件内容搜索，支持 regex 和上下文行。
 * @param searchPath - 搜索目录 (默认 '.')
 * @param regex - 正则表达式模式
 * @param filePattern - 文件 glob 模式 (可选)
 * @param contextLines - 匹配前后显示的行数 (默认 0)
 * @returns FileContextItem[]，每个包含匹配范围和 comment
 */
export async function advancedSearchFiles(
  searchPath: string = '.',
  regex: string,
  filePattern?: string,
  contextLines: number = 0,
): Promise<FileContextItem[]> {
  const rootDir = process.cwd();
  const fullSearchPath = path.join(rootDir, searchPath);
  const results: FileContextItem[] = [];
  const re = new RegExp(regex, 'gmi'); // global, multiline, ignore case

  async function searchInDir(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);

        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          await searchInDir(fullPath);
        } else if (entry.isFile()) {
          if (
            filePattern &&
            !entry.name.match(new RegExp(filePattern.replace(/\*/g, '.*')))
          )
            continue;

          const relativePath = path.relative(rootDir, fullPath);
          if (await isFileIgnored(relativePath)) continue;

          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split(/\r?\n/);
            let match: RegExpExecArray | null;
            const matchedRanges: { start: number; end: number }[] = [];

            while ((match = re.exec(content)) !== null) {
              const matchLine = content
                .substring(0, match.index)
                .split(/\r?\n/).length;
              const start = Math.max(1, matchLine - contextLines);
              const end = Math.min(lines.length, matchLine + contextLines);
              matchedRanges.push({ start, end });
            }

            if (matchedRanges.length > 0) {
              // 合并重叠范围或取第一个
              const range = matchedRanges[0]; // 简化，取第一个匹配
              results.push({
                path: relativePath,
                start: range.start,
                end: range.end,
                comment: `匹配 '${regex}' 在行 ${range.start}-${range.end}`,
              });
            }
          } catch (err) {
            // 忽略二进制文件
          }
        }
      }
    } catch (err) {}
  }

  await searchInDir(fullSearchPath);
  return results.slice(0, 10); // 限制 10 个结果
}
/**
 * 创建文件，如果目录不存在则创建目录。
 * @param filePath 文件路径
 * @param content 文件内容
 */
export async function createFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * 在文件中替换内容：读取文件，应用替换，然后写回。
 * @param filePath 文件路径
 * @param content 替换内容
 * @param find 要查找的字符串（可选，如果未提供则替换整个内容）
 */
export async function writeFileWithReplace(
  filePath: string,
  content: string,
  find?: string,
): Promise<void> {
  const originalContent = await fs.readFile(filePath, 'utf-8');
  const newContent = replaceInFile(originalContent, content, find);
  await fs.writeFile(filePath, newContent, 'utf-8');
}

/**
 * 移动或重命名文件。
 * @param oldPath 旧路径
 * @param newPath 新路径
 */
export async function moveFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await fs.access(oldPath);
  await fs.mkdir(path.dirname(newPath), { recursive: true });
  await fs.rename(oldPath, newPath);
}

/**
 * 删除文件。
 * @param filePath 文件路径
 */
export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}
