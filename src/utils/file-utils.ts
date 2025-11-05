import * as fs from 'fs/promises';

export async function replaceLines(filePath: string, newContent: string, startLine?: number, endLine?: number, encoding: BufferEncoding = 'utf8') {
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
export function replaceInFile(originalContent: string, content: string, find?: string): string {
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
      throw new Error(`找到多个匹配项: ${JSON.stringify(adaptedFind)}，请指定更具体的匹配模式`);
    }

    newContent = originalContent.replace(adaptedFind, replacementString);
  }

  return newContent;
}
