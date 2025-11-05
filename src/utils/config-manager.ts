import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { CliStyle } from './cli-style'
import JSON5 from 'json5'

/**
 * 定义一个可配置的提示模板。
 */
export interface PromptTemplate {
  name: string      // 模板的唯一名称
  template: string  // 实际的提示模板字符串，支持占位符
  description?: string // 模板的可选描述
}

/**
 * MaiCLI 配置接口。
 */
export interface MaiConfig {
  templates?: PromptTemplate[] // 用户定义的提示模板列表
  model?: string
  systemPrompt?: string // 支持从配置文件配置系统提示词
  historyDepth?: number // 默认历史深度，用于自动注入最近N条历史
  temperature?: number // AI模型的temperature参数，控制输出的随机性
  autoContext?: {
    maxRounds?: number
    maxFiles?: number
  }
  providers?: Partial<ProvidersConfig> // 支持自定义providers
  // Add other config fields as needed
}

/**
 * 环境变量的默认值及其回退。
 */
export const ENV_VARS = {
  API_ENDPOINT: 'https://openrouter.ai/api/v1/chat/completions',
  API_KEY: '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', // Example default, encourage using env
  MODEL: '', // Will fallback to DEFAULT_MODEL
}

export interface ProviderConfig {
  url: string
  models?: string[]
  apiKeyEnv: string
}

export type ProvidersConfig = Record<string, ProviderConfig>

export const DEFAULT_PROVIDERS: ProvidersConfig = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    apiKeyEnv: 'OPENAI_API_KEY'
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      'x-ai/grok-code-fast-1',
      'qwen/qwen3-coder',
      'qwen/qwen3-coder:free',
      'moonshotai/kimi-k2:free',
      'openrouter/sonoma-sky-alpha',
      'openrouter/sonoma-dusk-alpha',
      'openai/gpt-4.1-mini',
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'z-ai/glm-4.5-air:free'
    ],
    apiKeyEnv: 'OPENROUTER_API_KEY'
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions',
    models: [
      'gemini-2.5-flash', 'gemini-2.5-pro'
    ],
    apiKeyEnv: 'GEMINI_API_KEY'
  },
  gemini_balance: {
    url: 'https://gemini-balance.johnr.workers.dev/v1/chat/completions',
    models: [
      'gemini-2.5-flash', 'gemini-2.5-pro'
    ],
    apiKeyEnv: 'GEMINI_BALANCE_API_KEY'
  },
  huawei: {
    url: 'http://api.openai.rnd.huawei.com/v1/chat/completions',
    models: [
      'gpt-oss-120b', 'gpt-oss-20b', 'glm-4.5-air'
    ],
    apiKeyEnv: 'HUAWEI_CHAT_API_KEY'

  }
} as const

export const DEFAULT_MODEL: string = 'openrouter/x-ai/grok-code-fast-1'

/**
 * 配置目录和文件路径。
 */
const MAI_CONFIG_DIR_NAME = '.mai'
const CONFIG_FILE_NAME = 'config.json5' // Keep json5 for now

/**
 * 获取 MaiCLI 配置目录的路径。
 * @returns 配置目录的路径。
 */
export function getMaiConfigDir(): string {
  return path.join(os.homedir(), MAI_CONFIG_DIR_NAME)
}

/**
 * 获取配置文件的路径。
 * @returns 配置文件的路径。
 */
export function getConfigFile(): string {
  return path.join(getMaiConfigDir(), CONFIG_FILE_NAME)
}

/**
 * 解析模型字符串 'provider/modelname'，支持 modelName 包含 '/'。
 * @param model - 模型字符串。
 * @returns 解析结果或 null。
 */
export function parseModel(model: string): { provider: string; modelName: string } | null {
  const knownProviders: string[] = Object.keys(DEFAULT_PROVIDERS) as string[]
  for (const provider of knownProviders) {
    if (model.startsWith(`${provider}/`)) {
      const modelName = model.slice(provider.length + 1)
      return { provider, modelName }
    }
  }
  return null
}

/**
 * 缓存的配置对象。
 */
let configCache: MaiConfig | null = null

/**
 * 加载配置，具有缓存和验证功能。
 * @returns MaiConfig 对象。
 */
export async function loadConfig(): Promise<MaiConfig> {
  if (configCache) return configCache // 缓存以避免重复文件读取

  const configPath = getConfigFile()
  try {
    const content = await fs.readFile(configPath, 'utf-8')
    const parsed = JSON5.parse(content) as MaiConfig
    configCache = parsed
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {} // 如果文件不存在，则为空配置
    }
    console.warn(`Warning: Unable to load config '${configPath}'. Falling back to defaults.`)
    return {}
  }
}

/**
 * 保存配置，并使缓存失效。
 * @param config - 要保存的配置。
 */
export async function saveConfig(config: MaiConfig): Promise<void> {
  const configDir = getMaiConfigDir()
  const configPath = getConfigFile()
  try {
    console.log(CliStyle.info(`保存配置到: ${configPath}`)) // 添加日志
    await fs.mkdir(configDir, { recursive: true })
    const content = JSON.stringify(config, null, 2)
    await fs.writeFile(configPath, content, 'utf-8')
    console.log(CliStyle.success(`配置保存成功: ${configPath}`)) // 添加成功日志
    configCache = config // 更新缓存
  } catch (error) {
    console.error(CliStyle.error(`保存配置失败到 '${configPath}': ${(error as Error).message}`))
    // 尝试诊断常见问题
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(CliStyle.warning('目录不存在，请检查权限。'))
    } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      console.error(CliStyle.warning('权限不足，无法写入 ~/.mai 目录。请检查文件权限。'))
    }
    throw error
  }
}

/**
 * 从环境变量或默认值获取 API 端点。
 * @returns API 端点字符串。
 */
export async function getApiEndpoint(model?: string): Promise<string> {
  const currentModel = model || await getCurrentModel()
  const parsed = parseModel(currentModel)
  if (!parsed) {
    throw new Error(`Invalid model format: ${currentModel}. Expected 'provider/modelname'.`)
  }
  const config = await loadConfig()
  const providers = config.providers || {}
  const def = DEFAULT_PROVIDERS[parsed.provider]
  if (!def) {
    throw new Error(`Unknown provider: ${parsed.provider}`)
  }
  const pconfig = providers[parsed.provider] || def
  return pconfig.url
}

/**
 * 从环境变量或默认值获取 API 密钥。
 * 支持多个密钥的负载均衡，如果提供了逗号分隔的多个密钥，则随机选择一个。
 * @returns API 密钥字符串。
 */
export async function getApiKey(model?: string): Promise<string> {
  const currentModel = model || await getCurrentModel()
  const parsed = parseModel(currentModel)
  if (!parsed) {
    throw new Error(`Invalid model format: ${currentModel}. Expected 'provider/modelname'.`)
  }
  const config = await loadConfig()
  const providers = config.providers || {}
  const def = DEFAULT_PROVIDERS[parsed.provider]
  if (!def) {
    throw new Error(`Unknown provider: ${parsed.provider}`)
  }
  const pconfig = providers[parsed.provider] || def
  const key = process.env[pconfig.apiKeyEnv]
  if (!key) {
    if (parsed.provider === 'openrouter') {
      return ENV_VARS.API_KEY // 回退到默认 openrouter key
    }
    throw new Error(`API key not found for provider '${parsed.provider}'. Set ${pconfig.apiKeyEnv}.`)
  }

  // 支持多个密钥的负载均衡
  const keys = key.split(',').map(k => k.trim()).filter(k => k.length > 0)
  if (keys.length > 1) {
    const randomIndex = Math.floor(Math.random() * keys.length)
    return keys[randomIndex]
  }
  return key
}

/**
 * 从环境变量、配置或默认值获取当前模型。
 * 优化为首先检查环境变量，然后检查配置。
 * @returns 模型字符串。
 */
export async function getCurrentModel(): Promise<string> {
  let model = process.env.MAI_MODEL
  if (model) {
    const available = await getAvailableModels()
    if (available.includes(model)) {
      return model
    }
  }

  try {
    const config = await loadConfig()
    if (config.model) {
      const available = await getAvailableModels()
      if (available.includes(config.model)) {
        return config.model
      }
    }
  } catch (error) {
    // 忽略配置错误
  }

  return DEFAULT_MODEL
}

/**
 * 获取当前模型的 provider。
 * @returns string 或 null 如果解析失败。
 */
export async function getCurrentProvider(): Promise<string | null> {
  const currentModel = await getCurrentModel()
  const parsed = parseModel(currentModel)
  return parsed ? parsed.provider : null
}

/**
 * 获取当前模型的 modelName。
 * @returns 模型名称字符串或 null 如果解析失败。
 */
export async function getCurrentModelName(): Promise<string | null> {
  const currentModel = await getCurrentModel()
  const parsed = parseModel(currentModel)
  return parsed ? parsed.modelName : null
}

/**
 * 在配置中设置模型，并使缓存失效。
 * @param model - 要设置的模型。
 */
export async function setModel(model: string): Promise<void> {
  const available = await getAvailableModels()
  if (!available.includes(model)) {
    throw new Error(`Invalid model: ${model}. Must be one of: ${available.slice(0, 5).join(', ')}...`)
  }
  const config = await loadConfig()
  config.model = model
  await saveConfig(config) // 保存并使缓存失效
}

/**
 * 从配置中获取系统提示词，如果未设置则返回 undefined。
 * @returns 系统提示词字符串或 undefined。
 */
export async function getSystemPrompt(): Promise<string | undefined> {
  try {
    const config = await loadConfig()
    return config.systemPrompt
  } catch (error) {
    // 忽略配置错误，返回 undefined
    return undefined
  }
}

/**
 * 在配置中设置系统提示词。
 * @param prompt - 要设置的系统提示词。
 */
export async function setSystemPrompt(prompt: string): Promise<void> {
  const config = await loadConfig()
  config.systemPrompt = prompt
  await saveConfig(config) // 保存并使缓存失效
}

/**
 * 从配置中获取历史深度，如果未设置则返回默认值 0。
 * @returns 历史深度数字。
 */
export async function getHistoryDepth(): Promise<number> {
  try {
    const config = await loadConfig()
    return config.historyDepth || 0
  } catch (error) {
    // 忽略配置错误，返回默认值
    return 0
  }
}

/**
 * 在配置中设置历史深度。
 * @param depth - 要设置的历史深度。
 */
export async function setHistoryDepth(depth: number): Promise<void> {
  const config = await loadConfig()
  config.historyDepth = depth
  await saveConfig(config) // 保存并使缓存失效
}

/**
 * 从配置中获取temperature，如果未设置则返回默认值 0.7。
 * @returns temperature数字。
 */
export async function getTemperature(): Promise<number> {
  try {
    const config = await loadConfig()
    return config.temperature !== undefined ? config.temperature : 0.7
  } catch (error) {
    // 忽略配置错误，返回默认值
    return 0.7
  }
}

/**
 * 在配置中设置temperature。
 * @param temperature - 要设置的temperature值。
 */
export async function setTemperature(temperature: number): Promise<void> {
  if (temperature < 0 || temperature > 2) {
    throw new Error('Temperature must be between 0 and 2')
  }
  const config = await loadConfig()
  config.temperature = temperature
  await saveConfig(config) // 保存并使缓存失效
}

/**
 * 重置配置缓存。
 * 这是一个内部函数，用于在外部重置配置后更新内存状态。
 */
export function resetConfigCache(): void {
  configCache = null
}

/**
 * 可配置选项的描述接口。
 */
export interface ConfigOption {
  key: string
  name: string
  description?: string
  type: 'select' | 'text' | 'number' | 'boolean'
  options?: string[] // 对于 select 类型
  min?: number // 对于 number 类型
  max?: number
  getter: () => Promise<any>
  setter: (value: any) => Promise<void>
}

/**
 * 获取所有可配置选项。
 * 这允许动态扩展配置，而无需修改 set 命令。
 * @returns ConfigOption 数组。
 */
export async function getAvailableModels(): Promise<string[]> {
  const config = await loadConfig()
  const providers = config.providers || {}
  const allModels: string[] = []
  for (const [prov, def] of Object.entries(DEFAULT_PROVIDERS)) {
    const pconfig = providers[prov as keyof typeof DEFAULT_PROVIDERS] || def
    const models = pconfig.models || def.models || []
    for (const m of models) {
      allModels.push(`${prov}/${m}`)
    }
  }
  return allModels
}

export async function getAutoContextConfig(): Promise<{ maxRounds: number; maxFiles: number }> {
  try {
    const config = await loadConfig()
    return {
      maxRounds: config.autoContext?.maxRounds || 10,
      maxFiles: config.autoContext?.maxFiles || 20,
    }
  } catch (error) {
    // 忽略配置错误，返回默认值
    return { maxRounds: 10, maxFiles: 20 }
  }
}

export async function setAutoContextMaxRounds(rounds: number): Promise<void> {
  const config = await loadConfig()
  if (!config.autoContext) config.autoContext = {}
  config.autoContext.maxRounds = rounds
  await saveConfig(config)
}

export async function setAutoContextMaxFiles(files: number): Promise<void> {
  const config = await loadConfig()
  if (!config.autoContext) config.autoContext = {}
  config.autoContext.maxFiles = files
  await saveConfig(config)
}

export async function getConfigurableOptions(): Promise<ConfigOption[]> {
  const availableModels = await getAvailableModels()
  const options: ConfigOption[] = [
    {
      key: 'model',
      name: 'AI 模型',
      description: '选择使用的 AI 模型',
      type: 'select',
      options: availableModels,
      getter: getCurrentModel,
      setter: setModel,
    },
    {
      key: 'systemPrompt',
      name: '系统提示词',
      description: '自定义 AI 的系统提示词，用于定义行为和角色',
      type: 'text',
      getter: getSystemPrompt,
      setter: setSystemPrompt,
    },
    {
      key: 'historyDepth',
      name: '历史深度',
      description: '自动注入最近 N 条历史记录到提示中 (0 表示禁用)',
      type: 'number',
      min: 0,
      max: 50,
      getter: getHistoryDepth,
      setter: setHistoryDepth,
    },
    {
      key: 'temperature',
      name: 'Temperature',
      description: 'AI模型的temperature参数，控制输出的随机性 (0-2)',
      type: 'number',
      min: 0,
      max: 2,
      getter: getTemperature,
      setter: setTemperature,
    },
    {
      key: 'autoContext.maxRounds',
      name: '自动上下文轮次上限',
      description: 'Auto-Context 最大迭代轮次 (1-5)',
      type: 'number',
      min: 1,
      max: 5,
      getter: async () => (await getAutoContextConfig()).maxRounds,
      setter: (rounds: number) => setAutoContextMaxRounds(rounds),
    },
    {
      key: 'autoContext.maxFiles',
      name: '自动上下文文件上限',
      description: 'Auto-Context 最大文件数量 (1-20)',
      type: 'number',
      min: 1,
      max: 20,
      getter: async () => (await getAutoContextConfig()).maxFiles,
      setter: (files: number) => setAutoContextMaxFiles(files),
    },
    // 未来可在此添加更多选项，如 templates 等
  ]

  return options
}