/**
 * 法典 — Pipeline 引擎
 * 
 * 核心逻辑：把 7 个 AI Agent 的 System Prompt 按顺序串起来，
 * 依次调用 DeepSeek API，前一步输出 → 下一步输入。
 * 
 * 完全不依赖 EasyClaw，纯 Node.js + HTTP。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

// ── 配置 ──
const AGENTS_DIR = path.join(__dirname, 'agents');
const CONFIG_FILE = path.join(__dirname, 'agents', 'agent-config.json');
const KEY_FILE = path.join(require('os').homedir(), '.fadian-api-key');

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';  // 等价于 DeepSeek V4 Pro

// ── API Key 管理 ──
function saveApiKey(key) {
  fs.writeFileSync(KEY_FILE, key.trim(), 'utf-8');
}

function getApiKey() {
  try {
    return fs.readFileSync(KEY_FILE, 'utf-8').trim();
  } catch {
    return null;
  }
}

// ── 读取 Agent System Prompt ──
function loadAgentPrompt(agentId) {
  const soulPath = path.join(AGENTS_DIR, agentId, 'SOUL.md');
  const agentPath = path.join(AGENTS_DIR, agentId, 'AGENTS.md');

  let prompt = '';

  // SOUL.md 是核心人设
  if (fs.existsSync(soulPath)) {
    prompt += fs.readFileSync(soulPath, 'utf-8').trim();
  }

  // AGENTS.md 是行为准则
  if (fs.existsSync(agentPath)) {
    const agents = fs.readFileSync(agentPath, 'utf-8').trim();
    // 只取核心内容，不要重复的框架信息
    if (agents) {
      prompt += '\n\n## 行为准则\n' + agents;
    }
  }

  return prompt;
}

// ── 调用 DeepSeek API ──
async function callLLM(systemPrompt, userMessage, onChunk) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API Key 未配置，请在设置中填入 DeepSeek API Key');
  }

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.3,    // 低温度，法律场景要求稳定
    max_tokens: 8192,
    stream: !!onChunk
  });

  if (!onChunk) {
    // 非流式
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API 调用失败 (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  // 流式
  const response = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 调用失败 (${response.status}): ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          if (onChunk) onChunk(content);
        }
      } catch { /* 跳过解析错误的行 */ }
    }
  }

  return fullContent;
}

// ── Pipeline 阶段定义 ──
const PIPELINES = {
  // 标准合同审查：审查官 → 研究员 → 合规顾问
  contract_review: {
    name: '标准合同审查',
    steps: [
      { id: 'creator', name: '合同审查官', emoji: '🔍', desc: '逐条审查合同，标注风险条款' },
      { id: 'researcher', name: '法规研究员', emoji: '📚', desc: '检索相关法律法规，提供法条依据' },
      { id: 'compliance', name: '合规顾问', emoji: '📋', desc: '整合审查与法规，输出合规报告' }
    ]
  },

  // 法律文书起草：研究员 → 起草员 → 审查官
  legal_drafting: {
    name: '法律文书起草',
    steps: [
      { id: 'researcher', name: '法规研究员', emoji: '📚', desc: '收集相关法规和模板' },
      { id: 'drafter', name: '文书起草员', emoji: '✍️', desc: '起草法律文书初稿' },
      { id: 'creator', name: '合同审查官', emoji: '🔍', desc: '交叉审查文书内容' }
    ]
  },

  // 完整案件准备：审查官 → 分析官 → 证据员 → 合规顾问
  full_case_prep: {
    name: '完整案件准备',
    steps: [
      { id: 'creator', name: '合同审查官', emoji: '🔍', desc: '审查争议合同' },
      { id: 'analyst', name: '案例分析官', emoji: '⚖️', desc: '检索类案判例' },
      { id: 'evidence', name: '证据梳理员', emoji: '📎', desc: '梳理证据链和时间线' },
      { id: 'compliance', name: '合规顾问', emoji: '📋', desc: '整合输出完整报告' }
    ]
  }
};

// ── 运行 Pipeline ──
async function runPipeline(content, fileName, pipelineType, onProgress) {
  const pipeline = PIPELINES[pipelineType];
  if (!pipeline) {
    throw new Error(`未知的审查模式: ${pipelineType}`);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('未配置 API Key，请在左侧面板填入 DeepSeek API Key');
  }

  const results = { stages: [], finalReport: '' };
  let previousOutput = '';
  const startTime = Date.now();

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const systemPrompt = loadAgentPrompt(step.id);

    if (!systemPrompt) {
      throw new Error(`未找到 Agent "${step.id}" 的配置文件`);
    }

    // 构造给当前 Agent 的输入
    let userMessage;
    if (i === 0) {
      // 第一步：直接给合同原文
      userMessage = `请对以下合同文件进行审查分析。\n\n文件名：${fileName}\n\n合同内容：\n\n${content}`;
    } else {
      // 后续步骤：把上一步的输出作为输入
      userMessage = `请基于以下上一阶段的产出，进行本阶段的工作。\n\n---\n原合同文件名：${fileName}\n\n上一阶段产出：\n\n${previousOutput}\n\n---\n\n原始合同原文（备查）：\n\n${content}`;
    }

    // 通知进度
    if (onProgress) {
      onProgress({
        stage: i,
        stageName: step.name,
        stageEmoji: step.emoji,
        stageDesc: step.desc,
        status: 'running',
        totalStages: pipeline.steps.length
      });
    }

    // 调用 LLM
    const output = await callLLM(systemPrompt, userMessage);
    previousOutput = output;

    results.stages.push({
      name: step.name,
      emoji: step.emoji,
      agentId: step.id,
      output
    });

    if (onProgress) {
      onProgress({
        stage: i,
        stageName: step.name,
        stageEmoji: step.emoji,
        stageDesc: step.desc,
        status: 'done',
        totalStages: pipeline.steps.length
      });
    }
  }

  // 总指挥验收：最后一个 Agent 的输出直接作为最终报告
  // 在真正的多 Agent 系统中总指挥会做最后验收，这里简化处理
  results.finalReport = results.stages[results.stages.length - 1].output;
  results.elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  results.pipelineName = pipeline.name;

  return results;
}

// ── 列出可用的 Pipelines ──
function listPipelines() {
  return Object.entries(PIPELINES).map(([id, p]) => ({
    id,
    name: p.name,
    steps: p.steps.map(s => ({ name: s.name, emoji: s.emoji }))
  }));
}

// ── 内嵌 HTTP Server（供前端通过 REST API 调用）──
let server = null;
const PORT = 28999;

async function startServer() {
  server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Health
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Check Key
    if (url.pathname === '/api/check-key') {
      const key = getApiKey();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hasKey: !!key }));
      return;
    }

    // Save Key
    if (req.method === 'POST' && url.pathname === '/api/save-key') {
      const body = await readBody(req);
      const { apiKey } = JSON.parse(body);
      saveApiKey(apiKey);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // List Pipelines
    if (url.pathname === '/api/pipelines') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(listPipelines()));
      return;
    }

    // Run Review (SSE 流式)
    if (req.method === 'POST' && url.pathname === '/api/run-review') {
      const body = await readBody(req);
      const { content, fileName, pipelineType } = JSON.parse(body);

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await runPipeline(content, fileName, pipelineType, (progress) => {
          send('progress', progress);
        });
        send('done', result);
      } catch (err) {
        send('error', { error: err.message });
      }

      res.end();
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`⚖️  法典 Pipeline 引擎已启动，端口 ${PORT}`);
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
  });
}

// ── 导出 ──
module.exports = {
  saveApiKey,
  getApiKey,
  loadAgentPrompt,
  callLLM,
  runPipeline,
  listPipelines,
  startServer,
  stopServer
};
