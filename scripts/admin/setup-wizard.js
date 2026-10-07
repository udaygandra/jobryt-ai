#!/usr/bin/env node
/**
 * setup-wizard.js — Interactive Setup Wizard for Jobryt AI Agent
 *
 * PURPOSE:
 *   Guides users through configuration step-by-step.
 *   Auto-generates encryption keys, provides guided steps for API tokens,
 *   writes a secure, production-ready configuration file (.env or .env.prod),
 *   and enforces 0o600 file permissions with automatic backup (.bak).
 *
 * USAGE:
 *   npm run setup
 *   node scripts/admin/setup-wizard.js --prod
 *   node scripts/admin/setup-wizard.js --target .env.prod
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

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
    console.log('2) Production / Cloud VPS / Oracle Cloud (.env.prod)');
    const envModeChoice = await ask('Select Environment Target (1 or 2)', '1');
    targetEnvFile = (envModeChoice === '2' || envModeChoice.toLowerCase().includes('prod'))
      ? '.env.prod'
      : '.env';
  }

  const isProd = targetEnvFile === '.env.prod' || targetEnvFile.includes('prod');
  const targetSavePath = path.resolve(rootDir, targetEnvFile);
  console.log(`\nConfiguring target file: ${targetEnvFile}\n`);

  // Re-read existing file if different from default
  const activeExistingEnv = targetEnvFile !== defaultEnvPath
    ? { ...existingEnv, ...parseEnv(targetSavePath) }
    : existingEnv;

  const encryptionKey = activeExistingEnv.N8N_ENCRYPTION_KEY || crypto.randomBytes(16).toString('hex');

  // Normalize provider to 'gemini'
  let rawProvider = (activeExistingEnv.LLM_PROVIDER || 'gemini').toLowerCase().trim();
  if (rawProvider === 'google') rawProvider = 'gemini';

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

  // 4. Google Gemini API Key
  console.log('\n----------------------------------------------------------------------');
  console.log('[Step 3 of 5] Google Gemini API Key (Required - Free Tier Available)');
  console.log('   1. Open in your browser: https://aistudio.google.com/app/apikey');
  console.log('   2. Sign in with any Google account.');
  console.log('   3. Click "Create API Key" and copy the key (starts with AIza... or AQ...).');
  console.log('----------------------------------------------------------------------');
  const defaultGeminiKey = activeExistingEnv.GEMINI_API_KEY || '';
  const geminiKey = await ask('Paste your Gemini API Key', defaultGeminiKey);

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

  // 6. Recruiter Outreach Keys
  console.log('\n----------------------------------------------------------------------');
  console.log('[Step 5 of 5] Recruiter Outreach Integrations (Optional)');
  console.log('   Note: If omitted, the engine automatically uses 1-Tap Google X-Ray');
  console.log('   search links with zero cost and no API keys required.');
  console.log('   - Serper API (google.serper.dev - recruiter intelligence)');
  console.log('   - Hunter.io (hunter.io - corporate email pattern discovery)');
  console.log('   (Press Enter to skip if not using these services).');
  console.log('----------------------------------------------------------------------');
  const serperKey = await ask('Serper API Key (optional)', activeExistingEnv.SERPER_API_KEY || '');
  const hunterKey = await ask('Hunter API Key (optional)', activeExistingEnv.HUNTER_API_KEY || '');

  // 7. General Preferences
  console.log('\n----------------------------------------------------------------------');
  console.log('GENERAL SETTINGS & DEFAULTS');
  console.log('----------------------------------------------------------------------');
  const timezone = await ask('Timezone (e.g. UTC, America/New_York, America/Toronto)', activeExistingEnv.TIMEZONE || 'UTC');
  const searchRole = await ask('Default Search Title (e.g. Software Engineer, Data Analyst)', activeExistingEnv.ADZUNA_SEARCH_ROLE || '');
  const searchLocation = await ask('Default Search Location (e.g. Remote, Austin, Toronto)', activeExistingEnv.ADZUNA_SEARCH_LOCATION || '');

  // Build clean .env file contents
  const envContent = `# Mandatory Runtime Configuration

# Telegram bot credentials
TELEGRAM_BOT_TOKEN=${botToken}
TELEGRAM_CHAT_ID=${chatId}
TELEGRAM_ALLOWED_USER_IDS=${chatId}

# Primary AI provider (gemini is default and supports 10-model waterfall)
LLM_PROVIDER=${rawProvider}
GEMINI_API_KEY=${geminiKey}

# n8n internal encryption key (used for encrypting credential store)
N8N_ENCRYPTION_KEY=${encryptionKey}

# Network binding (127.0.0.1 restricts direct port exposure to localhost)
N8N_PORT=${activeExistingEnv.N8N_PORT || '5678'}
N8N_HOST_BINDING=${activeExistingEnv.N8N_HOST_BINDING || '127.0.0.1'}
N8N_WORKFLOW_ID=${activeExistingEnv.N8N_WORKFLOW_ID || 'master-bot'}

# Optional Job Board APIs
ADZUNA_APP_ID=${adzunaId}
ADZUNA_APP_KEY=${adzunaKey}
USAJOBS_API_KEY=${usajobsKey}

# Outbound Email SMTP Credentials (Optional)
SMTP_HOST=${activeExistingEnv.SMTP_HOST || 'smtp.gmail.com'}
SMTP_PORT=${activeExistingEnv.SMTP_PORT || '465'}
SMTP_USER=${activeExistingEnv.SMTP_USER || ''}
SMTP_PASSWORD=${activeExistingEnv.SMTP_PASSWORD || ''}

# Internal Directories
DATA_DIR=${activeExistingEnv.DATA_DIR || './data'}
SCRIPTS_DIR=${activeExistingEnv.SCRIPTS_DIR || './scripts'}
PROMPTS_DIR=${activeExistingEnv.PROMPTS_DIR || './prompts'}
WORKFLOWS_DIR=${activeExistingEnv.WORKFLOWS_DIR || './workflows'}

# Telegram Bridge Internal Webhook Routing
TELEGRAM_WEBHOOK_PATH=${activeExistingEnv.TELEGRAM_WEBHOOK_PATH || 'telegram-callback'}
TELEGRAM_WEBHOOK_ID=${activeExistingEnv.TELEGRAM_WEBHOOK_ID || 'e6a4b123-5e6f-7a8b-9c0d-1e2f3a4b5c6d'}

# Filtering & Regional Preferences
TIMEZONE=${timezone}
MIN_SCORE_THRESHOLD=${activeExistingEnv.MIN_SCORE_THRESHOLD || '60'}
MAX_UPLOAD_SIZE_MB=${activeExistingEnv.MAX_UPLOAD_SIZE_MB || '5'}
ADZUNA_COUNTRY=${activeExistingEnv.ADZUNA_COUNTRY || ''}
ADZUNA_SEARCH_ROLE=${searchRole}
ADZUNA_SEARCH_LOCATION=${searchLocation}

# Recruiter Discovery Keys (Optional)
SERPER_API_KEY=${serperKey}
HUNTER_API_KEY=${hunterKey}

# Secondary LLM Providers (Optional overrides)
LLM_MODEL=${activeExistingEnv.LLM_MODEL || ''}
LLM_API_KEY=${activeExistingEnv.LLM_API_KEY || ''}
OPENAI_API_KEY=${activeExistingEnv.OPENAI_API_KEY || ''}
OPENAI_BASE_URL=${activeExistingEnv.OPENAI_BASE_URL || 'https://api.openai.com/v1'}
ANTHROPIC_API_KEY=${activeExistingEnv.ANTHROPIC_API_KEY || ''}
GROQ_API_KEY=${activeExistingEnv.GROQ_API_KEY || ''}
DEEPSEEK_API_KEY=${activeExistingEnv.DEEPSEEK_API_KEY || ''}
OPENROUTER_API_KEY=${activeExistingEnv.OPENROUTER_API_KEY || ''}
OLLAMA_BASE_URL=${activeExistingEnv.OLLAMA_BASE_URL || 'http://localhost:11434'}

# Webhook & Tunneling (Leave blank for internal bridge long-polling)
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

  // Write new file with restricted mode 0o600 (owner read/write only)
  fs.writeFileSync(targetSavePath, envContent, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(targetSavePath, 0o600);
  } catch (_) {}

  console.log('\n' + '='.repeat(70));
  console.log(`CONFIGURATION WRITTEN TO ${targetEnvFile}`);
  console.log('='.repeat(70));
  console.log(`File Permissions: 0600 (Restricted to owner read/write)`);
  console.log(`Target Path:      ${targetSavePath}\n`);
  console.log('n8n Owner Account:');
  console.log('   When opening n8n for the first time, set your private admin credentials');
  console.log('   in the web interface (via SSH tunnel: ssh -L 5678:localhost:5678 ...).\n');
  console.log('Launch Commands:');
  if (isProd) {
    console.log('   ENV_FILE=.env.prod docker compose --env-file .env.prod \\');
    console.log('     -f docker-compose.yml -f docker-compose.prod.yml up -d');
  } else {
    console.log('   docker compose up -d');
  }
  console.log('\nTelegram Verification:');
  console.log('   Open Telegram and send /start or /help to your bot.');
  console.log('='.repeat(70) + '\n');

  rl.close();
}

runWizard().catch(err => {
  console.error('\n[Error] Setup Wizard failed:', err.message);
  rl.close();
  process.exit(1);
});
