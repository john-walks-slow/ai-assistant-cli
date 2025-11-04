#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAI_CONFIG_DIR = path.join(os.homedir(), '.mai');
const TEMPLATES_DIR = path.join(MAI_CONFIG_DIR, 'templates');
const CONFIG_FILE = path.join(MAI_CONFIG_DIR, 'config.json5');

// 获取当前包的根目录
const packageRoot = path.resolve(__dirname, '..');
const defaultConfigPath = path.join(packageRoot, 'resources', 'config.json5');
const defaultTemplatesDir = path.join(packageRoot, 'resources', 'templates');

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 复制文件
 */
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * 主安装函数
 */
function setupDefaults() {
  console.log('设置 MAI 默认配置和模板...');

  try {
    // 确保目录存在
    ensureDir(MAI_CONFIG_DIR);
    ensureDir(TEMPLATES_DIR);

    // 复制默认配置文件（如果不存在）
    if (!fs.existsSync(CONFIG_FILE)) {
      if (fs.existsSync(defaultConfigPath)) {
        copyFile(defaultConfigPath, CONFIG_FILE);
        console.log('✅ 已创建默认配置文件');
      } else {
        console.warn('⚠️  默认配置文件不存在，跳过配置设置');
      }
    } else {
      console.log('ℹ️  配置文件已存在，跳过配置设置');
    }

    // 复制默认模板（如果目录为空）
    if (fs.existsSync(defaultTemplatesDir)) {
      const templateFiles = fs
        .readdirSync(defaultTemplatesDir)
        .filter((file) => file.endsWith('.md') || file.endsWith('.txt'));

      if (templateFiles.length > 0) {
        let copied = 0;
        for (const templateFile of templateFiles) {
          const srcPath = path.join(defaultTemplatesDir, templateFile);
          const destPath = path.join(TEMPLATES_DIR, templateFile);

          if (!fs.existsSync(destPath)) {
            copyFile(srcPath, destPath);
            copied++;
          }
        }
        if (copied > 0) {
          console.log(`✅ 已创建 ${copied} 个默认模板`);
        } else {
          console.log('ℹ️  所有默认模板已存在，跳过模板设置');
        }
      }
    } else {
      console.warn('⚠️  默认模板目录不存在，跳过模板设置');
    }

    console.log('🎉 MAI 初始设置完成！');
    console.log(`📁 配置文件: ${CONFIG_FILE}`);
    console.log(`📁 模板目录: ${TEMPLATES_DIR}`);
  } catch (error) {
    console.error('❌ 设置默认配置失败:', error.message);
    process.exit(1);
  }
}

// 只在直接运行此脚本时执行
if (require.main === module) {
  setupDefaults();
}

module.exports = { setupDefaults };
