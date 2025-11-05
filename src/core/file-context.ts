import * as fs from 'fs/promises';
import { glob } from 'glob';
import { CliStyle } from '../utils/cli-style';

/**
 * 读取指定文件的内容并将其格式化为上下文。
 * 支持文件路径中的 glob 模式以包含多个文件。
 * @param filePatterns - 文件路径或 glob 模式数组。
 * @returns 包含连接文件上下文的字符串。
 */
export async function getFileContext(filePatterns: string[]): Promise<string> {
  const uniqueFiles = new Set<string>();

  // 将每个 glob 模式扩展为实际文件路径
  for (const pattern of filePatterns) {
    try {
      const matchedFiles = await glob(pattern, { dot: true, absolute: true, windowsPathsNoEscape: true });
      matchedFiles.forEach((file) => uniqueFiles.add(file));
    } catch (error) {
      console.log(CliStyle.warning(`警告: 扩展 glob 模式 '${pattern}' 时出错。错误: ${(error as Error).message}`));
    }
  }

  const filesToRead = Array.from(uniqueFiles);

  if (filesToRead.length === 0) {
    console.log(CliStyle.warning('警告: 未找到与提供模式匹配的文件。'));
    return '';
  }

  // 读取每个唯一文件的内容并格式化。
  const fileContents = await Promise.all(
    filesToRead.map(async (file) => {
      try {
        if ((await fs.stat(file)).isDirectory()) {
          return '';
        }
        const content = await fs.readFile(file, 'utf-8');
        
        // 添加行号标记
        const lines = content.split('\n');
        const numberedContent = lines.map((line, index) => 
          `${String(index + 1).padStart(4)}|${line}`
        ).join('\n');
        
        return `--- FILE: ${file} ---\n${content}`;
      } catch (error) {
        console.log(CliStyle.warning(`警告: 无法读取文件 ${file}，跳过。错误: ${(error as Error).message}`));
        return '';
      }
    }),
  );

  // 过滤掉空字符串（来自不可读文件）并用双换行符连接上下文。
  return fileContents.filter(Boolean).join('\n\n');
}