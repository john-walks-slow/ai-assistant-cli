import { exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * 对传入的所有文件单独应用 template apply tidy -y
 * 支持文件夹和 glob 模式，会递归处理所有匹配的文件
 */
async function walkTidy() {
  const patterns = process.argv.slice(2); // 获取命令行参数中的模式列表

  if (patterns.length === 0) {
    console.error(
      '错误: 未提供任何文件或模式。请传入要处理的文件的路径、文件夹或 glob 模式。'
    );
    process.exit(1);
  }

  // 收集所有匹配的文件
  const allFiles = new Set<string>();

  for (const pattern of patterns) {
    try {
      // 检查是否是目录
      const stat = await fs.stat(pattern);
      if (stat.isDirectory()) {
        // 如果是目录，使用递归 glob
        const matchedFiles = await glob(`${pattern}/**/*`, {
          dot: true,
          absolute: true,
          windowsPathsNoEscape: true
        });
        matchedFiles.forEach((file) => allFiles.add(file));
      } else {
        // 如果是文件或 glob 模式
        const hasGlobChars = /[*?[\]]/.test(pattern);
        if (hasGlobChars) {
          const matchedFiles = await glob(pattern, {
            dot: true,
            absolute: true,
            windowsPathsNoEscape: true
          });
          matchedFiles.forEach((file) => allFiles.add(file));
        } else {
          // 单个文件
          allFiles.add(pattern);
        }
      }
    } catch (error) {
      // 如果 stat 失败，尝试作为 glob 处理
      try {
        const matchedFiles = await glob(pattern, {
          dot: true,
          absolute: true,
          windowsPathsNoEscape: true
        });
        matchedFiles.forEach((file) => allFiles.add(file));
      } catch (globError) {
        console.error(
          `处理模式 '${pattern}' 时出错: ${(error as Error).message}`
        );
      }
    }
  }

  const files = Array.from(allFiles);
  if (files.length === 0) {
    console.error('错误: 未找到任何匹配的文件。');
    process.exit(1);
  }

  console.log(`开始对 ${files.length} 个文件应用 tidy 模板...`);

  for (const file of files) {
    try {
      console.log(`\n处理文件: ${file}`);
      const command = `mai template apply tidy -y "${file}"`;
      console.log(`执行命令: ${command}`);

      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd()
      });

      if (stdout) {
        console.log('输出:', stdout);
      }
      if (stderr) {
        console.error('错误输出:', stderr);
      }

      console.log(`文件 ${file} 处理完成。`);
    } catch (error) {
      console.error(`处理文件 ${file} 时出错: ${(error as Error).message}`);
      // 继续处理下一个文件，不中断整个过程
    }
  }

  console.log('\n所有文件处理完毕。');
}

// 运行脚本
walkTidy().catch(console.error);
