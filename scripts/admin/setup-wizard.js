#!/usr/bin/env node
/**
 * setup-wizard.js — Interactive Setup Wizard for Jobryt AI Agent
 *
 * PURPOSE:
 *   Guides users through configuration step-by-step.
 *   Prompts for user-specific settings: Telegram credentials, AI provider selection,
 *   model preference (e.g. gemini-3.8-flash), API keys, and job preferences.
 *   Writes a secure, clean configuration file (.env or .env.prod) free of dead legacy keys.
 *
 * USAGE:
 *   npm run setup
 *   node scripts/admin/setup-wizard.js --prod
 *   node scripts/admin/setup-wizard.js --target .env.prod
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Parse CLI flags if provided
const args = process.argv.slice(2);
let cliTargetEnv = '';
if (args.includes('--prod')) {
  cliTargetEnv = '.env.prod';
} else if (args.includes('--local') || args.includes('--dev')) {
  cliTargetEnv = '.env';
} else {
  const targetIdx = args.findIndex(a => a === '--target' || a === '--env' || a === '-o');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    cliTargetEnv = args[targetIdx + 1];
  }
}

const rootDir = path.resolve(__dirname, '..', '..');
const defaultEnvPath = path.resolve(rootDir, cliTargetEnv || '.env');

// Parse existing env file if present
function parseEnv(filePath) {
  const res = {};
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        res[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
      }
    }
  }
  return res;
}

const existingEnv = parseEnv(defaultEnvPath);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question, defaultValue = '') {
  return new Promise(resolve => {
    const prompt = defaultValue ? `${question} [Default: ${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function runWizard() {
  console.log('\n' + '='.repeat(70));
  console.log('JOBRYT AI AGENT - INTERACTIVE SETUP WIZARD');
  console.log('='.repeat(70));
  console.log('Guided configuration for local and cloud deployment.\n');

  // 1. Environment Target Selection
  let targetEnvFile = cliTargetEnv;
  if (!targetEnvFile) {
    console.log('----------------------------------------------------------------------');
    console.log('CONFIGURATION TARGET');
    console.log('1) Local Development (.env)');
    console.log('2) Production / Cloud VPS / Server (.env.prod)');
    const envModeChoice = await ask('Select Environment Target (1 or 2)', '1');
    targetEnvFile = (envModeChoice === '2' || envModeChoice.toLowerCase().includes('prod'))
      ? '.env.prod'
      : '.env';
  }

  const isProd = targetEnvFile === '.env.prod' || targetEnvFile.includes('prod');
  const targetSavePath = path.resolve(rootDir, targetEnvFile);
  console.log(`\nConfiguring target file: ${targetEnvFile}\n`);

  const activeExistingEnv = targetEnvFile !== defaultEnvPath
    ? { ...existingEnv, ...parseEnv(targetSavePath) }
    : existingEnv;

  // 2. Telegram Bot Token
  console.log('----------------------------------------------------------------------');
  console.log('[Step 1 of 5] Telegram Bot Token (Required)');
  console.log('   1. Open the Telegram app on your phone or desktop.');
  console.log('   2. Search for: @BotFather');
  console.log('   3. Send command: /newbot');
  console.log('   4. Choose a display name and username for your bot.');
  console.log('   5. BotFather will reply with an API token (e.g. 123456789:ABCdefGh...).');
  console.log('----------------------------------------------------------------------');
  const defaultToken = activeExistingEnv.TELEGRAM_BOT_TOKEN || '';
  const botToken = await ask('Paste your Telegram Bot Token', defaultToken);

  // 3. Telegram Chat ID & User Lock
  console.log('\n----------------------------------------------------------------------');
  console.log('[Step 2 of 5] Telegram Chat ID & Security Lock (Required)');
  console.log('   1. In Telegram, search for: @userinfobot');
  console.log('   2. Tap "Start" or send "hi".');
  console.log('   3. It will reply with your numeric ID (e.g. 123456789).');
  console.log('   (This locks the bot strictly to YOU so no unauthorized user can trigger actions)');
  console.log('----------------------------------------------------------------------');
  const defaultChatId = activeExistingEnv.TELEGRAM_CHAT_ID || activeExistingEnv.TELEGRAM_ALLOWED_USER_IDS || '';
  const chatId = await ask('Paste your numeric Telegram Chat ID', defaultChatId);

  // 4. AI Provider Selection
  console.log('\n----------------------------------------------------------------------');
  console.log('[Step 3 of 5] AI / LLM Provider & Primary Model');
  console.log('   Select your preferred AI engine:');
  console.log('   1) Google Gemini (Default - Free Tier Available, 10-Model Waterfall)');
  console.log('   2) OpenAI (GPT-4o, GPT-4o-mini, o3-mini)');
  console.log('   3) Anthropic Claude (Claude 3.5 Sonnet / Haiku)');
  console.log('   4) Groq (Ultra-Fast Inference: Llama 3.3, DeepSeek R1)');
  console.log('   5) DeepSeek (DeepSeek-Chat, DeepSeek-Reasoner)');
  console.log('   6) OpenRouter (Multi-Provider Gateway)');
  console.log('   7) Ollama (Local Offline Inference)');
  console.log('----------------------------------------------------------------------');
  
  const currentProvider = (activeExistingEnv.LLM_PROVIDER || 'gemini').toLowerCase();
  let defaultProviderChoice = '1';
  if (currentProvider === 'openai') defaultProviderChoice = '2';
  else if (currentProvider === 'claude' || currentProvider === 'anthropic') defaultProviderChoice = '3';
  else if (currentProvider === 'groq') defaultProviderChoice = '4';
  else if (currentProvider === 'deepseek') defaultProviderChoice = '5';
  else if (currentProvider === 'openrouter') defaultProviderChoice = '6';
  else if (currentProvider === 'ollama') defaultProviderChoice = '7';

  const providerChoice = await ask('Select AI Provider (1-7)', defaultProviderChoice);

  let selectedProvider = 'gemini';
  let defaultModel = 'gemini-3.8-flash';
  let providerKeyVar = 'GEMINI_API_KEY';
  let keyInstructions = 'Get key from https://aistudio.google.com/app/apikey';

  switch (providerChoice.trim()) {
    case '2':
      selectedProvider = 'openai';
      defaultModel = 'gpt-4o-mini';
      providerKeyVar = 'OPENAI_API_KEY';
      keyInstructions = 'Get key from https://platform.openai.com/api-keys';
      break;
    case '3':
      selectedProvider = 'claude';
      defaultModel = 'claude-3-5-haiku-20241022';
      providerKeyVar = 'ANTHROPIC_API_KEY';
      keyInstructions = 'Get key from https://console.anthropic.com/settings/keys';
      break;
    case '4':
      selectedProvider = 'groq';
      defaultModel = 'llama-3.3-70b-versatile';
      providerKeyVar = 'GROQ_API_KEY';
      keyInstructions = 'Get key from https://console.groq.com/keys';
      break;
    case '5':
      selectedProvider = 'deepseek';
      defaultModel = 'deepseek-chat';
      providerKeyVar = 'DEEPSEEK_API_KEY';
      keyInstructions = 'Get key from https://platform.deepseek.com/api_keys';
      break;
    case '6':
      selectedProvider = 'openrouter';
      defaultModel = 'meta-llama/llama-3.3-70b-instruct';
      providerKeyVar = 'OPENROUTER_API_KEY';
      keyInstructions = 'Get key from https://openrouter.ai/keys';
      break;
    case '7':
      selectedProvider = 'ollama';
      defaultModel = 'llama3.2';
      providerKeyVar = '';
      keyInstructions = 'Ensure Ollama is running at http://localhost:11434';
      break;
    default:
      selectedProvider = 'gemini';
      defaultModel = 'gemini-3.8-flash';
      providerKeyVar = 'GEMINI_API_KEY';
      keyInstructions = 'Get key from https://aistudio.google.com/app/apikey (starts with AIza... or AQ...)';
      break;
  }

  console.log(`\nSelected Provider: ${selectedProvider.toUpperCase()}`);
  console.log(`Instructions: ${keyInstructions}`);

  let providerApiKey = '';
  if (providerKeyVar) {
    const existingKey = activeExistingEnv[providerKeyVar] || '';
    providerApiKey = await ask(`Paste your ${providerKeyVar}`, existingKey);
  }

  const modelChoice = await ask(`Preferred Primary Model`, activeExistingEnv.LLM_MODEL || defaultModel);

  // 5. Optional Adzuna & USAJOBS API
  console.log('\n----------------------------------------------------------------------');
  console.log('[Step 4 of 5] Job Board Search & API Keys (Optional)');
  console.log('   Note: LinkedIn, Canada Job Bank, Jobicy, Remotive, Himalayas, and');
  console.log('   ArbeitNow work immediately without requiring API keys.');
  console.log('   If you have an Adzuna developer account, enter your credentials below.');
  console.log('   (Press Enter to skip if you do not have one yet).');
  console.log('----------------------------------------------------------------------');
  const adzunaId = await ask('Adzuna App ID (optional)', activeExistingEnv.ADZUNA_APP_ID || '');
  const adzunaKey = await ask('Adzuna App Key (optional)', activeExistingEnv.ADZUNA_APP_KEY || '');
  const usajobsKey = await ask('USAJOBS Federal API Key (optional)', activeExistingEnv.USAJOBS_API_KEY || '');

  // 6. General Preferences
  console.log('\n----------------------------------------------------------------------');
  console.log('[Step 5 of 5] General Preferences & Search Defaults');
  console.log('----------------------------------------------------------------------');
  const timezone = await ask('Timezone (e.g. America/Toronto, America/New_York, UTC)', activeExistingEnv.TIMEZONE || 'America/Toronto');
  const searchRole = await ask('Default Search Title (e.g. Data Analyst, Software Engineer)', activeExistingEnv.ADZUNA_SEARCH_ROLE || 'Data Analyst');
  const searchLocation = await ask('Default Search Location (e.g. Toronto, New York, Remote)', activeExistingEnv.ADZUNA_SEARCH_LOCATION || 'Toronto');

  // Build clean .env file contents
  const envContent = `# ==============================================================================
# Jobryt AI Agent — Environment Configuration
# Generated by Interactive Setup Wizard
# ==============================================================================

# --- 1. Telegram Bot (Mandatory for alerts & commands) ---
TELEGRAM_BOT_TOKEN=${botToken}
TELEGRAM_CHAT_ID=${chatId}

# --- 2. AI / LLM Provider Configuration ---
LLM_PROVIDER=${selectedProvider}
LLM_MODEL=${modelChoice}

# Primary Provider Key
${selectedProvider === 'gemini' ? `GEMINI_API_KEY=${providerApiKey}` : `GEMINI_API_KEY=${activeExistingEnv.GEMINI_API_KEY || ''}`}

# OpenAI (required only if LLM_PROVIDER=openai)
OPENAI_API_KEY=${selectedProvider === 'openai' ? providerApiKey : (activeExistingEnv.OPENAI_API_KEY || '')}
OPENAI_BASE_URL=${activeExistingEnv.OPENAI_BASE_URL || 'https://api.openai.com/v1'}

# Anthropic Claude (required only if LLM_PROVIDER=claude)
ANTHROPIC_API_KEY=${selectedProvider === 'claude' ? providerApiKey : (activeExistingEnv.ANTHROPIC_API_KEY || '')}

# Groq (required only if LLM_PROVIDER=groq)
GROQ_API_KEY=${selectedProvider === 'groq' ? providerApiKey : (activeExistingEnv.GROQ_API_KEY || '')}

# DeepSeek (required only if LLM_PROVIDER=deepseek)
DEEPSEEK_API_KEY=${selectedProvider === 'deepseek' ? providerApiKey : (activeExistingEnv.DEEPSEEK_API_KEY || '')}

# OpenRouter (required only if LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=${selectedProvider === 'openrouter' ? providerApiKey : (activeExistingEnv.OPENROUTER_API_KEY || '')}

# Ollama local inference (required only if LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=${activeExistingEnv.OLLAMA_BASE_URL || 'http://localhost:11434'}

# --- 3. Job Board Integrations (Optional) ---
ADZUNA_APP_ID=${adzunaId}
ADZUNA_APP_KEY=${adzunaKey}
USAJOBS_API_KEY=${usajobsKey}

# --- 4. System Settings & Runtime Paths ---
DATA_DIR=${activeExistingEnv.DATA_DIR || './data'}
SCRIPTS_DIR=${activeExistingEnv.SCRIPTS_DIR || './scripts'}
PROMPTS_DIR=${activeExistingEnv.PROMPTS_DIR || './prompts'}
TIMEZONE=${timezone}
MIN_SCORE_THRESHOLD=${activeExistingEnv.MIN_SCORE_THRESHOLD || '60'}
MAX_UPLOAD_SIZE_MB=${activeExistingEnv.MAX_UPLOAD_SIZE_MB || '5'}
ADZUNA_COUNTRY=${activeExistingEnv.ADZUNA_COUNTRY || ''}
ADZUNA_SEARCH_ROLE=${searchRole}
ADZUNA_SEARCH_LOCATION=${searchLocation}

# --- 5. Outbound SMTP Email (Optional) ---
SMTP_HOST=${activeExistingEnv.SMTP_HOST || 'smtp.gmail.com'}
SMTP_PORT=${activeExistingEnv.SMTP_PORT || '465'}
SMTP_USER=${activeExistingEnv.SMTP_USER || ''}
SMTP_PASSWORD=${activeExistingEnv.SMTP_PASSWORD || ''}

# --- 6. Deployment & Tunneling (Optional) ---
WEBHOOK_URL=${activeExistingEnv.WEBHOOK_URL || ''}
CLOUDFLARE_TUNNEL_TOKEN=${activeExistingEnv.CLOUDFLARE_TUNNEL_TOKEN || ''}
`;

  // Backup existing file if present
  if (fs.existsSync(targetSavePath)) {
    const backupPath = `${targetSavePath}.bak`;
    try {
      fs.copyFileSync(targetSavePath, backupPath);
      fs.chmodSync(backupPath, 0o600);
      console.log(`[Backup] Existing ${targetEnvFile} backed up to ${path.basename(backupPath)}`);
    } catch (bakErr) {
      console.warn(`[Warning] Could not create backup file: ${bakErr.message}`);
    }
  }

  fs.writeFileSync(targetSavePath, envContent.trim() + '\n', 'utf8');
  try {
    fs.chmodSync(targetSavePath, 0o600);
  } catch (_) {}

  console.log('\n' + '='.repeat(70));
  console.log(`✅ SETUP WIZARD COMPLETED SUCCESSFULLY!`);
  console.log(`Target configuration written to: ${targetEnvFile}`);
  console.log('='.repeat(70));
  console.log('\nNext steps:');
  console.log('  1. Run tests: npm test');
  console.log('  2. Start local server: npm run dev\n');
  rl.close();
}

runWizard().catch(err => {
  console.error('\n❌ Setup Wizard encountered an error:', err.message);
  rl.close();
  process.exit(1);
});
