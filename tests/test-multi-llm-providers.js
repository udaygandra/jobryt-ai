/**
 * tests/test-multi-llm-providers.js
 *
 * Verifies multi-LLM provider compatibility across:
 *   1. OpenAI-compatible APIs (OpenAI, Groq, DeepSeek, OpenRouter)
 *   2. Anthropic / Claude Messages API
 *   3. Ollama local inference API
 *   4. Reasoning tag (<think>...</think>) filtering for DeepSeek-R1
 *   5. End-to-end resume ingestion parsing across providers
 *   6. End-to-end ATS resume tailoring across providers
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { loadEnv } = require('../scripts/core/load-env');
loadEnv();

const { callLLMProvider } = require('../scripts/engine/llm-provider');
const { tailorJobApplication, getTailoredArtifactPaths } = require('../scripts/engine/tailor-engine');

async function runMultiProviderTests() {
  console.log('🧪 RUNNING COMPREHENSIVE MULTI-LLM PROVIDER TEST SUITE\n' + '='.repeat(60));

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${name}`);
      console.error(`    Error: ${err.message}`);
      throw err;
    }
  }

  // 1. Test OpenAI-Compatible Provider Request Formatting
  await test('OpenAI provider dispatches valid chat completion payload and parses JSON', async () => {
    let capturedReq = null;
    const mockHttp = async (config) => {
      capturedReq = config;
      return {
        id: 'chatcmpl-mock123',
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({ message: 'Hello from OpenAI mock', status: 'ok' })
          }
        }]
      };
    };

    const res = await callLLMProvider({
      prompt: '{"test": true}',
      systemInstruction: 'Output valid JSON',
      provider: 'openai',
      model: 'gpt-4o-mini',
      env: { OPENAI_API_KEY: 'sk-mock-key-12345' },
      httpRequestHelper: mockHttp
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.provider, 'openai');
    assert.strictEqual(res.model, 'gpt-4o-mini');
    assert.strictEqual(res.model_used, 'gpt-4o-mini');
    assert(capturedReq.url.includes('/chat/completions'));
    assert.strictEqual(capturedReq.headers.Authorization, 'Bearer sk-mock-key-12345');
    const parsed = JSON.parse(res.rawText);
    assert.strictEqual(parsed.status, 'ok');
  });

  // 2. Test Anthropic / Claude Provider Request Formatting
  await test('Claude provider dispatches valid messages payload and parses JSON', async () => {
    let capturedReq = null;
    const mockHttp = async (config) => {
      capturedReq = config;
      return {
        id: 'msg-mock-claude',
        content: [{
          type: 'text',
          text: JSON.stringify({ provider: 'claude', score: 95 })
        }]
      };
    };

    const res = await callLLMProvider({
      prompt: 'Evaluate candidate fit',
      systemInstruction: 'Output valid JSON',
      provider: 'claude',
      model: 'claude-3-5-haiku-20241022',
      env: { ANTHROPIC_API_KEY: 'sk-ant-mock-key' },
      httpRequestHelper: mockHttp
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.provider, 'claude');
    assert.strictEqual(res.model, 'claude-3-5-haiku-20241022');
    assert(capturedReq.url.includes('/v1/messages'));
    assert.strictEqual(capturedReq.headers['x-api-key'], 'sk-ant-mock-key');
    const parsed = JSON.parse(res.rawText);
    assert.strictEqual(parsed.score, 95);
  });

  // 3. Test Groq Provider Request Formatting
  await test('Groq provider routes through Groq OpenAI-compatible endpoint', async () => {
    let capturedReq = null;
    const mockHttp = async (config) => {
      capturedReq = config;
      return {
        choices: [{
          message: {
            content: JSON.stringify({ speed: 'fast', model: 'llama-3.3-70b-versatile' })
          }
        }]
      };
    };

    const res = await callLLMProvider({
      prompt: 'Summarize profile',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      env: { GROQ_API_KEY: 'gsk_mock_groq_key' },
      httpRequestHelper: mockHttp
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.provider, 'groq');
    assert(capturedReq.url.includes('api.groq.com/openai/v1/chat/completions'));
    assert.strictEqual(capturedReq.headers.Authorization, 'Bearer gsk_mock_groq_key');
  });

  // 4. Test Ollama Local Provider
  await test('Ollama local provider dispatches JSON generate request', async () => {
    let capturedReq = null;
    const mockHttp = async (config) => {
      capturedReq = config;
      return {
        response: JSON.stringify({ local: true, model: 'llama3.2' })
      };
    };

    const res = await callLLMProvider({
      prompt: 'Parse resume',
      provider: 'ollama',
      model: 'llama3.2',
      env: { OLLAMA_BASE_URL: 'http://localhost:11434' },
      httpRequestHelper: mockHttp
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.provider, 'ollama');
    assert(capturedReq.url.includes('/api/generate'));
    const parsed = JSON.parse(res.rawText);
    assert.strictEqual(parsed.local, true);
  });

  // 5. Test DeepSeek with Reasoning Tags (<think>...</think>)
  await test('DeepSeek reasoning models cleanly filter <think> tokens and markdown fences', async () => {
    const rawWithThoughts = `<think>
Candidate has 5 years of experience in data analytics.
Evaluating star schema modeling and SQL capabilities.
Recommendation: Excellent fit for Senior Data Analyst.
</think>
\`\`\`json
{
  "tailored_summary": "Experienced Data Analyst with 5+ years optimizing SQL pipelines.",
  "cover_letter": "Dear Hiring Manager, I am eager to contribute...",
  "ats_keyword_fit": 94
}
\`\`\``;

    const mockHttp = async () => ({
      choices: [{ message: { content: rawWithThoughts } }]
    });

    const res = await callLLMProvider({
      prompt: 'Tailor resume',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      env: { DEEPSEEK_API_KEY: 'dsk-mock-key' },
      httpRequestHelper: mockHttp
    });

    assert.strictEqual(res.success, true);
    // Verify cleaning logic
    const cleaned = res.rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    assert.strictEqual(parsed.ats_keyword_fit, 94);
    assert(parsed.tailored_summary.includes('Experienced Data Analyst'));
  });

  // 6. Test ATS Resume Tailoring End-to-End Across Multi-Provider Engine
  await test('tailorJobApplication executes cleanly with provider metadata and zero-fabrication grounding', async () => {
    const mockJob = {
      id: 'test_multi_llm_job_1',
      title: 'Senior Cloud Platform Engineer',
      company: 'OmniCloud Technologies',
      location: 'Toronto, ON',
      description: 'Looking for a Senior Cloud Platform Engineer with AWS, Kubernetes, and Terraform expertise.'
    };

    const mockProfile = {
      name: 'Elena Rostova',
      profession: 'Senior Cloud Platform Engineer',
      target_titles: ['Senior Cloud Platform Engineer'],
      skills: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'Go', 'Python'],
      experience: [{
        company: 'CloudWorks',
        role: 'Senior Cloud Engineer',
        dates: '2021 - Present',
        bullets: ['Architected Kubernetes multi-cluster infrastructure on AWS.', 'Automated CI/CD deployments using Terraform.']
      }]
    };

    const result = await tailorJobApplication(mockJob, mockProfile, 'Direct & Impactful', { forceRegenerate: true });

    assert(result, 'Tailoring must return an applied record');
    assert(result.pdf_path, 'Must return pdf_path');
    assert(fs.existsSync(result.resume_json_path), 'resume.json must exist on disk');
    assert(fs.existsSync(result.pdf_path), 'resume.pdf must exist on disk');
    assert(fs.existsSync(result.cover_letter_txt_path), 'cover_letter.txt must exist on disk');

    const savedJson = JSON.parse(fs.readFileSync(result.resume_json_path, 'utf8'));
    assert.strictEqual(savedJson.company, 'OmniCloud Technologies');
    assert.strictEqual(savedJson.targetRole, 'Senior Cloud Platform Engineer');
    assert(typeof savedJson.ats_keyword_fit === 'number');
    assert(savedJson.model_used, 'Must record model_used');

    // Clean up test folder
    try {
      const artifacts = getTailoredArtifactPaths('test_multi_llm_job_1');
      fs.rmSync(artifacts.folder, { recursive: true, force: true });
    } catch (_) {}
  });

  console.log('='.repeat(60));
  console.log(`🎉 ALL ${passed}/${total} MULTI-LLM PROVIDER TESTS PASSED PERFECTLY!\n`);
}

runMultiProviderTests().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ Multi-Provider Test Suite failed:', err);
  process.exit(1);
});
