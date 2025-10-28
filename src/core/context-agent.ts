import fs from 'fs/promises';
import { CliStyle } from '../utils/cli-style';
import { getAutoContextConfig } from '../utils/config-manager';
import {
  listFilesInDirectory,
  advancedSearchFiles,
  getProjectOverview,
  validateFilePaths
} from '../utils/file-utils';
import { getAiResponse } from '../utils/network';
import { FileContextItem } from './file-context';

interface AiContextSuggestion {
  reasoning: string;
  sufficient: boolean;
  suggestedActions: ActionSuggestion[];
}

interface ActionSuggestion {
  type: 'addFile' | 'readFile' | 'removeFile' | 'fileList' | 'contentSearch';
  params: {
    path?: string;
    reason: string;
    recursive?: boolean;
    filePattern?: string;
    regex?: string;
    contextLines?: number;
  };
}

async function parseContextAgentResponse(
  aiResponse: string
): Promise<AiContextSuggestion> {
  try {
    const jsonMatch = aiResponse.match(
      /```json\s*([\s\S]*?)\s*```|(\{[\s\S]*\})/
    );
    if (jsonMatch) {
      const jsonString = jsonMatch[1] || jsonMatch[2];
      const parsed = JSON.parse(jsonString);
      return {
        reasoning: parsed.reasoning || 'No reasoning provided.',
        sufficient: parsed.sufficient || false,
        suggestedActions: parsed.suggestedActions || []
      };
    }
    throw new Error('No valid JSON block found in the AI response.');
  } catch (e) {
    console.log(
      CliStyle.error(`Failed to parse AI response: ${(e as Error).message}`)
    );
    return {
      reasoning: 'Critical error: Failed to parse the last AI response.',
      sufficient: false,
      suggestedActions: []
    };
  }
}

/**
 * Creates a context item placeholder for a file, without reading its content.
 * This is used by the 'addFile' action.
 */
function createFileContextPlaceholder(
  filePath: string,
  reason: string
): FileContextItem {
  return {
    path: filePath,
    comment: `File added to context. Reason: ${reason}`,
    content: undefined, // Content is explicitly not read here
    start: undefined,
    end: undefined
  };
}

/**
 * Executes a single suggested action from the AI.
 * @param action The action to execute.
 * @param currentContext The current list of context items, needed for 'readFile'.
 * @returns A promise that resolves to an array of new or updated FileContextItem objects.
 */
async function executeSuggestedAction(
  action: ActionSuggestion,
  currentContext: FileContextItem[]
): Promise<FileContextItem[]> {
  try {
    switch (action.type) {
      case 'addFile': {
        const { path } = action.params;
        if (!path) throw new Error('path is missing for addFile');
        if (currentContext.some((item) => item.path === path)) {
          console.log(CliStyle.info(`--> File ${path} is already in context.`));
          return [];
        }
        return [createFileContextPlaceholder(path, action.params.reason ?? '')];
      }

      case 'readFile': {
        const { path } = action.params;
        if (!path) throw new Error('path is missing for readFile');

        const existingItem = currentContext.find((item) => item.path === path);

        // If item exists and content is already read, do nothing.
        if (existingItem?.content) {
          console.log(
            CliStyle.info(`--> Content for ${path} has already been read.`)
          );
          return [];
        }

        console.log(CliStyle.info(`--> Reading content for ${path}...`));
        const content = await fs.readFile(path, 'utf-8');
        const reason = action.params.reason ?? '';

        // Return a complete FileContextItem.
        // The calling loop will either update an existing placeholder or add this as a new item.
        const comment = existingItem
          ? `Full content read. Reason: ${reason}`
          : `File read and added to context. Reason: ${reason}`;

        return [
          {
            path: path,
            content: content,
            comment: comment,
            // Preserve existing start/end if the item was a search result snippet
            start: existingItem?.start,
            end: existingItem?.end
          }
        ];
      }

      case 'fileList': {
        const { path = '.', recursive = true, filePattern } = action.params;
        const files = await listFilesInDirectory(path, recursive, filePattern);
        return files.map((f) =>
          createFileContextPlaceholder(f, `Listed from directory: ${path}`)
        );
      }

      case 'contentSearch': {
        const {
          path = '.',
          regex,
          filePattern,
          contextLines = 3
        } = action.params;
        if (!regex) throw new Error('regex is missing for contentSearch');
        return await advancedSearchFiles(
          path,
          regex,
          filePattern,
          contextLines
        );
      }

      // 'removeFile' is handled directly in the main loop and does not return items.
      case 'removeFile':
        return [];
    }
  } catch (err) {
    console.log(
      CliStyle.warning(
        `Execution failed for action ${action.type}: ${(err as Error).message}`
      )
    );
  }
  return [];
}

export async function prepareAutoContext(
  userPrompt: string
): Promise<FileContextItem[]> {
  const { maxRounds, maxFiles } = await getAutoContextConfig();

  let currentContextItems: FileContextItem[] = [];
  const projectKnowledgeBase = `User Task: "${userPrompt}"\nProject Overview:\n${await getProjectOverview()}`;
  let sufficient = false;

  const systemPrompt = await getContextAgentSystemPrompt();
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt }
  ];

  for (let round = 1; round <= maxRounds && !sufficient; round++) {
    console.log(
      CliStyle.info(`\n===== Auto Context Round ${round}/${maxRounds} =====`)
    );

    const userPromptForAi = buildUserPromptForContextAgent(
      userPrompt,
      projectKnowledgeBase,
      currentContextItems,
      round
    );

    messages.push({ role: 'user', content: userPromptForAi });

    const aiResponse = await getAiResponse(messages);
    console.log(
      CliStyle.debug(`AI Raw Response (Round ${round}): ${aiResponse}`)
    );
    messages.push({ role: 'assistant', content: aiResponse });

    const suggestion = await parseContextAgentResponse(aiResponse);
    console.log(
      CliStyle.info(
        `AI Plan (Round ${round}):\n${JSON.stringify(suggestion, null, 2)}`
      )
    );
    console.log(
      CliStyle.info(
        `AI's current reasoning: ${suggestion.reasoning || 'No reasoning provided.'}`
      )
    );

    sufficient = suggestion.sufficient;
    if (sufficient) {
      console.log(
        CliStyle.success(
          `AI has determined the context is sufficient. Reason: ${suggestion.reasoning || 'No specific reason provided.'}`
        )
      );
      break;
    }

    if (
      !suggestion.suggestedActions ||
      suggestion.suggestedActions.length === 0
    ) {
      console.log(
        CliStyle.warning(`AI did not suggest any actions. Ending process.`)
      );
      break;
    }

    for (const action of suggestion.suggestedActions) {
      console.log(
        CliStyle.info(
          `Executing AI action: ${action.type} - ${JSON.stringify(action.params)}`
        )
      );

      if (action.type === 'removeFile') {
        const { path } = action.params;
        if (path) {
          const beforeCount = currentContextItems.length;
          currentContextItems = currentContextItems.filter(
            (item) => item.path !== path
          );
          console.log(
            CliStyle.info(
              `--> Removed ${beforeCount - currentContextItems.length} items matching ${path}`
            )
          );
        }
        continue;
      }

      const actionResults = await executeSuggestedAction(
        action,
        currentContextItems
      );

      if (actionResults.length > 0) {
        console.log(
          CliStyle.success(
            `--> Found/updated ${actionResults.length} items from action.`
          )
        );

        for (const resultItem of actionResults) {
          const existingItemIndex = currentContextItems.findIndex(
            (item) =>
              item.path === resultItem.path && item.start === resultItem.start
          );

          if (existingItemIndex !== -1) {
            // This handles updates, e.g., from 'readFile'
            console.log(
              CliStyle.info(`--> Updating context for ${resultItem.path}`)
            );
            currentContextItems[existingItemIndex] = resultItem;
          } else {
            // This handles new additions from 'addFile', 'fileList', 'contentSearch'
            if (
              !currentContextItems.some((item) => item.path === resultItem.path)
            ) {
              currentContextItems.push(resultItem);
            }
          }
        }
      }

      if (currentContextItems.length > maxFiles) {
        console.log(
          CliStyle.warning(`Context limit (${maxFiles}) reached. Exiting.`)
        );
        break;
      }
    }

    console.log(
      CliStyle.info(`Current context items: ${currentContextItems.length}`)
    );
  }

  if (!sufficient) {
    console.log(
      CliStyle.warning(
        `Max rounds (${maxRounds}) reached, but AI did not confirm context sufficiency.`
      )
    );
  }

  const validItems = await validateFilePaths(currentContextItems);
  console.log(
    CliStyle.success(
      `\n===== Auto Context Complete: Collected ${validItems.length} valid items =====`
    )
  );
  return validItems;
}

function buildUserPromptForContextAgent(
  task: string,
  projectKnowledge: string,
  currentFiles: FileContextItem[],
  round: number
): string {
  let prompt = `**User's Primary Task:**\n"${task}"\n\n`;

  if (round === 1) {
    prompt += `**Project Knowledge (Initial):**\n${projectKnowledge}\n\n`;
    prompt += `No context has been collected yet.\n\n`;
    prompt += `**Your Task:**\nAnalyze the user's task and project knowledge. Generate your first JSON response with your 'reasoning' and initial 'suggestedActions' to explore the codebase. Set 'sufficient' to false.`;
  } else {
    prompt += `**Conversation History is available. Current round: ${round}.**\n\n`;
    if (currentFiles.length > 0) {
      const contextComment = currentFiles
        .map((item) => {
          const status = item.content ? '[Content Read]' : '[Path Only]';
          return `- ${status} ${item.path}${item.start ? ` (lines ${item.start}-${item.end})` : ''}: ${item.comment || 'Content snippet'}`;
        })
        .join('\n');
      prompt += `**Current Collected Context Comment:**\n${contextComment}\n\n`;
    } else {
      prompt += `No context has been collected yet.\n\n`;
    }
    prompt += `**Your Task:**\nBased on the full conversation history and current context, generate your next JSON response. Update your 'reasoning', provide next 'suggestedActions', and set 'sufficient' to true only when you have *read* all necessary files.`;
  }
  return prompt;
}

async function getContextAgentSystemPrompt(): Promise<string> {
  return `You are ContextCrafter, an expert AI developer assistant. Your sole mission is to prepare the complete and accurate file context for a given task. You operate in an iterative loop.

**Core Workflow:**

1.  **Discover:** Use \`fileList\` and \`contentSearch\` to find potentially relevant files.
2.  **Read & Analyze:** Use the \`readFile\` action to read the contents of files that seem important. This will automatically add the file to the context if it's not already there.
3.  **Bookmark (Optional):** If you are unsure if you need a file's content yet, but want to keep track of it, you can use \`addFile\`. This adds a file to the context without reading its content. You can read it later with \`readFile\`.
4.  **Refine (Optional):** If you are certain a file is irrelevant, use \`removeFile\` to discard it. Use this sparingly.
5.  **Conclude:** Set \`sufficient\` to \`true\` **only when** you have successfully **read the content** of all files required to complete the task.

**Actions (\`suggestedActions\`):**

*   **\`readFile\`:** Reads the full content of a file. This is your primary tool. If the file is not already in the context, it will be added. Use this when you need to see implementation details.
    *   Example: \`{"type": "readFile", "params": {"path": "src/api/user-routes.ts", "reason": "I need to examine the function signatures and logic inside the routes."}}\`
*   **\`addFile\`:** (Optional) Adds a file's path to the context as a placeholder without reading it. Use this to bookmark a file if you are not yet sure you need its full content.
    *   Example: \`{"type": "addFile", "params": {"path": "src/api/user-routes.ts", "reason": "This file likely contains the API endpoints for users."}}\`
*   **\`removeFile\`:** (Use sparingly) Removes a file from the context only if you are certain it is irrelevant.
    *   Example: \`{"type": "removeFile", "params": {"path": "src/legacy-code.ts", "reason": "This file is deprecated and not related to the task."}}\`
*   **\`fileList\`:** List files in a directory to discover the project structure.
    *   Example: \`{"type": "fileList", "params": {"path": "src/components", "recursive": true, "reason": "Discover all component files."}}\`
*   **\`contentSearch\`:** Search for a specific string or regex across files. This is useful when you don't know the exact file name.
    *   Example: \`{"type": "contentSearch", "params": {"path": "src", "regex": "function\\\\s\\\\+calculateTotalPrice\\\\(", "reason": "Find the price calculation logic."}}\`

**Output Format (Strict JSON only):**

Your entire output must be a single JSON object. No extra text.

\`\`\`json
{
  "reasoning": "My hypothesis: The core logic is in the services directory. I will read the main service file to understand its functions.",
  "sufficient": false,
  "suggestedActions": [
    {
      "type": "readFile",
      "params": {
        "path": "src/services/main-service.ts",
        "reason": "This is likely the main entry point for the business logic."
      }
    },
    {
      "type": "contentSearch",
      "params": {
        "path": "src/services",
        "regex": "processUserData",
        "contextLines": 10,
        "reason": "Find the specific implementation of the user data processing logic."
      }
    }
  ]
}
\`\`\``;
}
