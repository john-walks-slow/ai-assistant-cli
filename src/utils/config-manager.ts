import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * MaiCLI 配置接口。
 */
export interface MaiConfig {
  templates?: Array<{
    name: string;
    template: string;
    description?: string;
  }>;
  model?: string;
  systemPrompt?: string; // 支持从配置文件配置系统提示词
  // Add other config fields as needed
}

/**
 * 环境变量的默认值及其回退。
 */
export const ENV_VARS = {
  API_ENDPOINT: 'https://openrouter.ai/api/v1/chat/completions',
  API_KEY: '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', // Example default, encourage using env
  MODEL: '', // Will fallback to DEFAULT_MODEL
};

/**
 * 可用的 AI 模型。
 */
export const AVAILABLE_MODELS = [
  'x-ai/grok-code-fast-1',
  'qwen/qwen3-coder',
  'qwen/qwen3-coder:free',
  'moonshotai/kimi-k2:free',
  'openrouter/sonoma-sky-alpha',
  'openrouter/sonoma-dusk-alpha',
  'google/gemini-2.5-flash',
  'openai/gpt-4.1-mini',
  'gemini/gemini-2.0-flash-exp:free',
] as const;

export type ModelType = typeof AVAILABLE_MODELS[number];
export const DEFAULT_MODEL: ModelType = 'x-ai/grok-code-fast-1';

/**
 * 配置目录和文件路径。
 */
const MAI_CONFIG_DIR_NAME = '.mai';
const CONFIG_FILE_NAME = 'config.json5'; // Keep json5 for now

/**
 * 获取 MaiCLI 配置目录的路径。
 * @returns 配置目录的路径。
 */
export function getMaiConfigDir(): string {
  return path.join(os.homedir(), MAI_CONFIG_DIR_NAME);
}

/**
 * 获取配置文件的路径。
 * @returns 配置文件的路径。
 */
export function getConfigFile(): string {
  return path.join(getMaiConfigDir(), CONFIG_FILE_NAME);
}

/**
 * 缓存的配置对象。
 */
let configCache: MaiConfig | null = null;

/**
 * 加载配置，具有缓存和验证功能。
 * @returns MaiConfig 对象。
 */
export async function loadConfig(): Promise<MaiConfig> {
  if (configCache) return configCache; // 缓存以避免重复文件读取

  const configPath = getConfigFile();
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as MaiConfig; // Assume JSON for parsing
    // 验证模型
    if (parsed.model && !AVAILABLE_MODELS.includes(parsed.model as ModelType)) {
      parsed.model = DEFAULT_MODEL; // 如果无效则回退到默认值
    }
    configCache = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // 如果文件不存在，则为空配置
    }
    console.warn(`Warning: Unable to load config '${configPath}'. Falling back to defaults.`);
    return {};
  }
}

/**
 * 保存配置，并使缓存失效。
 * @param config - 要保存的配置。
 */
export async function saveConfig(config: MaiConfig): Promise<void> {
  const configDir = getMaiConfigDir();
  const configPath = getConfigFile();
  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    configCache = config; // 更新缓存
  } catch (error) {
    console.error(`Error: Unable to save config to '${configPath}'. ${ (error as Error).message }`);
    throw error;
  }
}

/**
 * 从环境变量或默认值获取 API 端点。
 * @returns API 端点字符串。
 */
export function getApiEndpoint(): string {
  return process.env.MAI_API_ENDPOINT || ENV_VARS.API_ENDPOINT;
}

/**
 * 从环境变量或默认值获取 API 密钥。
 * @returns API 密钥字符串。
 */
export function getApiKey(): string {
  return process.env.MAI_API_KEY || ENV_VARS.API_KEY;
}

/**
 * 从环境变量、配置或默认值获取当前模型。
 * 优化为首先检查环境变量，然后检查配置。
 * @returns 模型字符串。
 */
export async function getCurrentModel(): Promise<string> {
  let model = process.env.MAI_MODEL;
  if (model && AVAILABLE_MODELS.includes(model as ModelType)) {
    return model;
  }

  try {
    const config = await loadConfig();
    if (config.model && AVAILABLE_MODELS.includes(config.model as ModelType)) {
      return config.model;
    }
  } catch (error) {
    // 忽略配置错误
  }

  return DEFAULT_MODEL;
}

/**
 * 在配置中设置模型，并使缓存失效。
 * @param model - 要设置的模型。
 */
export async function setModel(model: ModelType): Promise<void> {
  const config = await loadConfig();
  config.model = model;
  await saveConfig(config); // 保存并使缓存失效
}

/**
 * 从配置中获取系统提示词，如果未设置则返回 undefined。
 * @returns 系统提示词字符串或 undefined。
 */
export async function getSystemPrompt(): Promise<string | undefined> {
  try {
    const config = await loadConfig();
    return config.systemPrompt;
  } catch (error) {
    // 忽略配置错误，返回 undefined
    return undefined;
  }
}

/**
 * 在配置中设置系统提示词。
 * @param prompt - 要设置的系统提示词。
 */
export async function setSystemPrompt(prompt: string): Promise<void> {
  const config = await loadConfig();
  config.systemPrompt = prompt;
  await saveConfig(config); // 保存并使缓存失效
}

/**
 * 重置配置缓存。
 * 这是一个内部函数，用于在外部重置配置后更新内存状态。
 */
export function resetConfigCache(): void {
  configCache = null;
}