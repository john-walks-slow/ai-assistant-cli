import { prepareAutoContext } from '../src/core/context-agent';
import { getAiResponse } from '../src/utils/network';
import { FileContextItem } from '../src/core/file-context';
import { getProjectOverview } from '../src/utils/file-utils';

// Mock getAiResponse to return a fixed response for testing
// jest.mock('../src/utils/network', () => ({
//   getAiResponse: jest.fn().mockResolvedValue(JSON.stringify({
//     files: [{ path: 'src/index.ts', summary: 'Test file' }],
//     sufficient: true,
//     reason: 'Test sufficient',
//     suggestedSearches: []
//   }))
// }));

// Simple test function
async function testContextAgent() {
  console.log('Testing prepareAutoContext...');
  const userPrompt = 'Improve context agent';
  const context = await prepareAutoContext(userPrompt);
  console.log('Collected context:', context);
  console.log('Test completed.');
}

// Run test
testContextAgent().catch(console.error);
// getProjectOverview().then(str=>console.log(str))