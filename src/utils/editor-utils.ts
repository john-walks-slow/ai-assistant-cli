import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { CliStyle } from './cli-style';

/**
 * 在用户的默认文本编辑器中打开内容（硬编码为VS Code）。
 * 进程会等待编辑器关闭。
 * @param content - 要编辑的内容。
 * @returns 编辑器关闭后的内容。
 */
export async function openInEditor(content: string): Promise<string> {
  const editor = 'code'; // 硬编码为VS Code
  const projectRoot = process.cwd();
  const tempFilePath = path.join(os.tmpdir(), `mai-edit-${Date.now()}.tmp`);

  try {
    await fs.writeFile(tempFilePath, content, 'utf8');
    await runProcess(editor, ['--folder-uri', projectRoot, '--wait', tempFilePath]);
    return await fs.readFile(tempFilePath, 'utf8');
  } finally {
    await fs.unlink(tempFilePath).catch(() => { /* 清理时忽略错误 */ });
  }
}

/**
 * 在VS Code中显示两个内容之间的差异，并允许用户编辑新内容（支持部分编辑的完整上下文审查）。
 * 进程会等待VS Code差异窗口关闭。如果用户保存了对新内容的更改，则返回修改后的内容。
 * @param originalContent - 原始文件内容。
 * @param newContent - AI提议的新内容（对于部分编辑，应为应用更改后的完整内容）。
 * @param fileNameHint - 可选，用于临时文件名的提示，例如 "my-file.ts"。
 * @returns 用户编辑并保存后的新内容，如果没有保存更改则返回 `null`。
 */
export async function showDiffInVsCode(originalContent: string, newContent: string, fileNameHint?: string): Promise<string | null> {
  const tempDir = path.join(process.cwd(), '.ai-temp');
  await fs.mkdir(tempDir, { recursive: true }).catch(() => { /* 忽略已存在错误 */ });
  const timestamp = Date.now();
  const baseName = fileNameHint ? path.basename(fileNameHint, path.extname(fileNameHint)) : 'mai';
  const extName = fileNameHint ? path.extname(fileNameHint) : '.tmp';

  const originalPath = path.join(tempDir, `${baseName}-original-${timestamp}${extName}`);
  const newPath = path.join(tempDir, `${baseName}-new-${timestamp}${extName}`);
  const editor = 'code'; // 硬编码为VS Code
  const projectRoot = process.cwd();

  try {
    await fs.writeFile(originalPath, originalContent, 'utf8');
    await fs.writeFile(newPath, newContent, 'utf8'); // 写入AI提议的内容到新文件
    await runProcess(editor, [
      //'--folder-uri', projectRoot,
      '--diff', '--wait', originalPath, newPath]);

    // 读取用户可能已修改的newPath内容
    const editedContent = await fs.readFile(newPath, 'utf8');

    // 如果编辑后的内容与原始新内容不同，则返回编辑后的内容
    if (editedContent !== newContent) {
      console.log(CliStyle.success('检测到并保存了差异审查中的修改。'));
      return editedContent;
    } else {
      console.log(CliStyle.muted('在差异审查中未检测到修改。'));
      return null;
    }
  } catch (error) {
    console.error(CliStyle.error('打开VS Code差异时出错。`code`命令是否在您的PATH中？'));
    console.error(CliStyle.error(String(error)));
    return null; // 发生错误时返回null
  } finally {
    // 清理临时文件
    await Promise.all([
      fs.unlink(originalPath).catch(() => { /* 清理时忽略错误 */ }),
      fs.unlink(newPath).catch(() => { /* 清理时忽略错误 */ })
    ]);
  }
}

/**
 * 运行外部进程并等待其退出。
 * @param command - 要执行的命令。
 * @param args - 命令的参数数组。
 * @returns 如果进程成功退出，则解析的Promise。
 */
function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, { stdio: 'inherit', shell: true });
    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`进程以代码 ${code} 退出`));
      }
    });
    childProcess.on('error', (err) => {
      reject(err);
    });
  });
}