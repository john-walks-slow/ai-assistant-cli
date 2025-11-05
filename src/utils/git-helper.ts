import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 查找最近的 .git 目录以确定 Git 仓库的根目录。
 * 如果未找到 .git 目录，则回退到最近的 package.json 所在目录。
 * 如果两者都未找到，则返回起始目录。
 * 这对于正确解析 .gitignore 路径至关重要，因为 .gitignore 模式是相对于 Git 根目录的。
 * @param startDir - 开始查找的目录。
 * @returns Git 仓库根目录的路径。
 */
export async function findGitRoot(
  startDir: string = process.cwd(),
): Promise<string> {
  let currentDir = startDir;
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    const packageJsonPath = path.join(currentDir, 'package.json');
    try {
      await fs.access(gitPath); // 检查 .git 目录
      return currentDir;
    } catch (e) {
      /* 忽略 */
    }
    try {
      await fs.access(packageJsonPath); // 检查 package.json 文件
      return currentDir;
    } catch (e) {
      /* 忽略 */
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // 已到达根目录
      return startDir; // 如果未找到 .git 或 package.json，则回退到起始目录
    }
    currentDir = parentDir;
  }
}
