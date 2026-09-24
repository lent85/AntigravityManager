export interface LandingPageData {
  title: string;
  description: string;
  port: number;
  modelsCount: number;
  models: Array<{
    id: string;
    displayName: string;
    pricing?: {
      prompt_price_per_m?: number;
      completion_price_per_m?: number;
      request_price?: number;
    };
  }>;
  baseUrl: string;
}

export function renderLandingPageHtml(data: LandingPageData): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title} - AI Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card: #111726;
      --card-border: #1e293b;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --accent: #8b5cf6;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --font: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.5;
      padding: 0;
      margin: 0;
      min-height: 100vh;
    }
    .gradient-header {
      background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59, 130, 246, 0.25), transparent);
      border-bottom: 1px solid var(--card-border);
      padding: 3rem 1.5rem 2.5rem;
      text-align: center;
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 1rem;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      background: linear-gradient(135deg, #ffffff 0%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
      max-width: 600px;
      margin: 0 auto 1.5rem;
    }
    .endpoints-bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1rem;
      max-width: 800px;
      margin: 0 auto;
    }
    .endpoint-chip {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      font-family: var(--mono);
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .endpoint-chip span.label {
      color: var(--primary);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
    }
    .tabs-nav {
      display: flex;
      gap: 0.5rem;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 1.5rem;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.95rem;
      font-weight: 600;
      padding: 0.75rem 1.25rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: var(--text);
    }
    .tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    .card-desc {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 1.25rem;
    }
    .code-block {
      position: relative;
      background: #060911;
      border: 1px solid #1a2234;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      font-family: var(--mono);
      font-size: 0.85rem;
      overflow-x: auto;
      color: #e2e8f0;
      margin-bottom: 1rem;
    }
    .btn-copy {
      position: absolute;
      top: 0.6rem;
      right: 0.6rem;
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      font-family: var(--font);
      transition: background 0.2s;
    }
    .btn-copy:hover {
      background: #334155;
    }
    .table-container {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9rem;
    }
    th, td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    th {
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .tag {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      margin-right: 0.25rem;
    }
    .tag-purple {
      background: rgba(139, 92, 246, 0.15);
      color: #c084fc;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
    }
    .prompt-box {
      background: #060911;
      border: 1px solid #1a2234;
      border-radius: 8px;
      padding: 1rem;
      position: relative;
    }
    .prompt-title {
      font-weight: 600;
      font-size: 0.95rem;
      margin-bottom: 0.5rem;
      color: #93c5fd;
    }
    .prompt-text {
      font-size: 0.85rem;
      color: var(--text-muted);
      white-space: pre-wrap;
      font-family: var(--mono);
      max-height: 120px;
      overflow-y: auto;
    }
    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--card-border);
    }
  </style>
</head>
<body>
  <header class="gradient-header">
    <div class="badge-status">
      <div class="pulse-dot"></div>
      Gateway Online &bull; Port ${data.port} &bull; ${data.modelsCount} Models Active
    </div>
    <h1>${data.title}</h1>
    <p class="subtitle">${data.description}</p>
    <div class="endpoints-bar">
      <div class="endpoint-chip">
        <span class="label">OpenAI Base:</span>
        <code>${data.baseUrl}/v1</code>
      </div>
      <div class="endpoint-chip">
        <span class="label">Anthropic Base:</span>
        <code>${data.baseUrl}</code>
      </div>
      <div class="endpoint-chip">
        <span class="label">Gemini Base:</span>
        <code>${data.baseUrl}</code>
      </div>
    </div>
  </header>

  <main class="container">
    <nav class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('tab-quickstart')">Quick Setup (IDEs & SDKs)</button>
      <button class="tab-btn" onclick="switchTab('tab-models')">Model Catalog & Pricing</button>
      <button class="tab-btn" onclick="switchTab('tab-prompts')">AI System Prompts</button>
      <button class="tab-btn" onclick="switchTab('tab-api')">API Endpoints</button>
    </nav>

    <!-- TAB 1: Quickstart -->
    <section id="tab-quickstart" class="tab-content active">
      <div class="card">
        <div class="card-title">Cursor Configuration</div>
        <div class="card-desc">Configure Cursor IDE to route requests through this gateway.</div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
          In Cursor <strong>Settings &gt; Models &gt; OpenAI API Key</strong>, toggle override Base URL to:
        </p>
        <div class="code-block">
          <code>${data.baseUrl}/v1</code>
          <button class="btn-copy" onclick="copyText('${data.baseUrl}/v1', this)">Copy</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
          Recommended <code>.cursorrules</code> snippet:
        </p>
        <div class="code-block">
          <code># Antigravity Gateway Cursor Rule
Preferred Model: gemini-3.1-pro-high
Secondary Model: claude-sonnet-4-6-thinking
Fast Model: gemini-3-flash
Strictly prioritize accuracy, structured diffs, and deep code reasoning.</code>
          <button class="btn-copy" onclick="copySnippet(this)">Copy Rule</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">VS Code (Cline / Roo Code / Continue)</div>
        <div class="card-desc">Add as custom OpenAI-compatible provider in your extension settings.</div>
        <div class="code-block">
          <code>{
  "apiProvider": "openai-compatible",
  "openAiBaseUrl": "${data.baseUrl}/v1",
  "openAiApiKey": "YOUR_API_KEY",
  "openAiModelId": "gemini-3.1-pro-high"
}</code>
          <button class="btn-copy" onclick="copySnippet(this)">Copy JSON</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Python OpenAI SDK</div>
          <div class="card-desc">Call OpenAI compatible endpoint.</div>
          <div class="code-block">
            <code>from openai import OpenAI

client = OpenAI(
    base_url="${data.baseUrl}/v1",
    api_key="YOUR_API_KEY"
)

response = client.chat.completions.create(
    model="gemini-3.1-pro-high",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)</code>
            <button class="btn-copy" onclick="copySnippet(this)">Copy Python</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">cURL Test Request</div>
          <div class="card-desc">Instant terminal verification.</div>
          <div class="code-block">
            <code>curl ${data.baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gemini-3-flash",
    "messages": [{"role": "user", "content": "Hello"}]
  }'</code>
            <button class="btn-copy" onclick="copySnippet(this)">Copy cURL</button>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 2: Model Catalog -->
    <section id="tab-models" class="tab-content">
      <div class="card">
        <div class="card-title">Available Models & Configured Pricing</div>
        <div class="card-desc">Models routed by this gateway. Pricing appears only when an administrator configured it.</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Model ID</th>
                <th>Pricing ($ / 1M Tokens)</th>
              </tr>
            </thead>
            <tbody>
              ${data.models
                .map(
                  (m) => `
                <tr>
                  <td><strong style="font-family: var(--mono); color: #93c5fd;">${m.id}</strong></td>
                  <td>
                    ${
                      m.pricing
                        ? `$${m.pricing.prompt_price_per_m ?? 0} In / $${m.pricing.completion_price_per_m ?? 0} Out`
                        : 'Not configured'
                    }
                  </td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- TAB 3: AI System Prompts -->
    <section id="tab-prompts" class="tab-content">
      <div class="card">
        <div class="card-title">Curated AI System Prompts</div>
        <div class="card-desc">Optimized prompt templates for agentic coding and reasoning workflows.</div>
        <div class="grid-2">
          <div class="prompt-box">
            <div class="prompt-title">Senior Software Architect</div>
            <div class="prompt-text">You are a Senior Principal Software Architect. Prioritize modularity, type safety, deterministic state management, and high performance. Provide concise, production-ready code with complete error handling.</div>
            <button class="btn-copy" onclick="copySnippet(this)">Copy</button>
          </div>
          <div class="prompt-box">
            <div class="prompt-title">Deep Reasoning & Bug Hunter</div>
            <div class="prompt-text">Analyze code systematically. Trace execution flows, investigate race conditions, verify runtime boundaries, and explain root causes clearly before suggesting minimal, non-breaking fixes.</div>
            <button class="btn-copy" onclick="copySnippet(this)">Copy</button>
          </div>
          <div class="prompt-box">
            <div class="prompt-title">Full-Stack TypeScript Specialist</div>
            <div class="prompt-text">Expert in modern TypeScript 5+, React 19, NestJS, and Fastify. Use strict type guards, avoid any/unsafe casts, and design elegant component composition patterns.</div>
            <button class="btn-copy" onclick="copySnippet(this)">Copy</button>
          </div>
          <div class="prompt-box">
            <div class="prompt-title">Code Reviewer & Quality Auditor</div>
            <div class="prompt-text">Review diffs for memory leaks, security vulnerabilities, API contract conformance, and adherence to clean architecture principles. Rate severity: Critical, Warning, Suggestion.</div>
            <button class="btn-copy" onclick="copySnippet(this)">Copy</button>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 4: API Endpoints -->
    <section id="tab-api" class="tab-content">
      <div class="card">
        <div class="card-title">Supported API Endpoints</div>
        <div class="card-desc">Universal endpoints for OpenAI, Anthropic, and Gemini clients.</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="tag">OpenAI</span></td>
                <td><code>POST</code></td>
                <td><code>/v1/chat/completions</code></td>
                <td>Chat completions (Streaming & Non-streaming)</td>
              </tr>
              <tr>
                <td><span class="tag">OpenAI</span></td>
                <td><code>GET</code></td>
                <td><code>/v1/models</code></td>
                <td>List standard model catalog</td>
              </tr>
              <tr>
                <td><span class="tag">OpenAI</span></td>
                <td><code>GET</code></td>
                <td><code>/v1/models/quote</code></td>
                <td>Quote models with pricing, quotas & limits</td>
              </tr>
              <tr>
                <td><span class="tag">Gateway</span></td>
                <td><code>GET</code></td>
                <td><code>/v1/gateway/quota</code></td>
                <td>Aggregated quota status across active accounts</td>
              </tr>
              <tr>
                <td><span class="tag tag-purple">Anthropic</span></td>
                <td><code>POST</code></td>
                <td><code>/v1/messages</code></td>
                <td>Anthropic Claude messages protocol</td>
              </tr>
              <tr>
                <td><span class="tag">Gemini</span></td>
                <td><code>POST</code></td>
                <td><code>/v1beta/models/*:generateContent</code></td>
                <td>Native Google Gemini API passthrough</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <p>Antigravity Manager API Gateway &bull; Self-hosted &bull; Powered by Google DeepMind Technologies</p>
  </footer>

  <script>
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }

    function copyText(text, btn) {
      navigator.clipboard.writeText(text);
      const original = btn.innerText;
      btn.innerText = 'Copied!';
      setTimeout(() => { btn.innerText = original; }, 2000);
    }

    function copySnippet(btn) {
      const parent = btn.parentElement;
      const code = parent.querySelector('code') || parent.querySelector('.prompt-text');
      if (code) {
        copyText(code.innerText.trim(), btn);
      }
    }
  </script>
</body>
</html>`;
}
