import axios, { AxiosError } from 'axios';
import * as fs from 'fs/promises';
import { CliStyle } from './cli-style';
import { getApiEndpoint, getApiKey, getCurrentModel, getCurrentModelName } from './config-manager';

/**
 * 延迟执行指定毫秒数。
 * @param ms - 等待的毫秒数。
 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AI API响应中的单个选择。
 */
interface AiChoice {
  message: {
    content: string;
  };
}

/**
 * AI API响应的整体结构。
 */
interface AiApiResponse {
  choices: AiChoice[];
}

/**
 * 使用 Axios 发送网络请求的工具类。
 * 此版本使用 Axios 替代 cURL，提供更好的错误处理和 promises 支持。
 */
export class AxiosNetwork {
  /**
   * 执行一个网络请求。
   * @param options - 请求选项。
   * @returns 返回一个 Promise，成功时解析为服务器响应的 JSON 对象。
   */
  static async invoke<T = any>(options: {
    uri: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: Record<string, any> | any[];
    timeout?: number; // 超时时间 (毫秒)，默认为 60000 ms
  }): Promise<T> {
    const {
      uri,
      method = 'POST',
      headers = {},
      body,
      timeout = 60000, // 默认60秒超时
    } = options;

    // 构造请求配置
    const finalHeaders = {
      'Content-Type': 'application/json;charset=utf-8',
      ...headers,
    };

    const config = {
      url: uri,
      method: method.toUpperCase(),
      headers: finalHeaders,
      data: body ? JSON.stringify(body) : undefined,
      timeout,
    };

    try {
      const response = await axios(config);
      if (response.status === 204) {
        // 对于 204 No Content 等情况，返回 null
        return null as any;
      }
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const axiosError = error as AxiosError;
        const errorMessage = axiosError.response?.data ? JSON.stringify(axiosError.response.data) : axiosError.message;
        throw new Error(`Axios request failed with status ${axiosError.response?.status || 'unknown'}: ${errorMessage}`);
      } else {
        throw new Error(`Unexpected error: ${String(error)}`);
      }
    }
  }
}

/**
 * 从配置的AI模型获取响应，带有重试逻辑。
 * @param prompt - 发送给AI的用户指令。
 * @param systemPrompt - 可选的系统指令。
 * @param retries - 失败时重试次数。
 * @param debug - 是否打印原始请求负载。
 * @returns AI响应的字符串内容。
 * @throws {Error} 如果AI请求失败。
 */
export async function getAiResponse(messages: { role: string; content: string }[], retries = 3): Promise<string> {
  const model = await getCurrentModelName(); // Use centralized getCurrentModel
  const payload = {
    model,
    messages,
  };

  CliStyle.printDebug('--- 原始AI请求负载 ---');
  CliStyle.printDebugContent(JSON.stringify(payload, null, 2));
  CliStyle.printDebug('-------------------------------------');

  for (let i = 0; i < retries; i++) {
    try {
      const aiResponse: AiApiResponse = await AxiosNetwork.invoke({
        uri: await getApiEndpoint(), // Use centralized getApiEndpoint
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await getApiKey()}`, // Use centralized getApiKey
        },
        body: payload,
      });

      CliStyle.printDebug('--- 原始AI响应负载 ---');
      CliStyle.printDebugContent(aiResponse.choices[0].message.content.trim());
      CliStyle.printDebug('-------------------------------------');
      if (aiResponse.choices && aiResponse.choices.length > 0 && aiResponse.choices[0].message?.content) {
        return aiResponse.choices[0].message.content.trim();
      } else {
        console.error('错误：AI响应格式不符合预期。', JSON.stringify(aiResponse));
        throw new Error('无效的AI响应格式。');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`第 ${i + 1} 次尝试（共 ${retries} 次）失败。`, errorMessage);
      if (i === retries - 1) {
        console.error('最后一次尝试失败。中止。');
        throw error;
      }
      const backoffTime = 2 ** i;
      console.warn(`将在 ${backoffTime} 秒后重试...`);
      await delay(1000 * backoffTime);
    }
  }

  throw new Error('AI请求在所有重试后失败。');
}