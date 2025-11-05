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
