import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createHash, randomBytes } from 'crypto';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Initialize Google Gemini AI SDK if API key is present
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: 'MOTI',
    version: '1.0.0',
    hasAiKey: Boolean(geminiApiKey),
    timestamp: new Date().toISOString()
  });
});

// FYERS read-only OAuth integration. Tokens remain server-side and are never sent to the browser.
const fyersAppId = process.env.FYERS_APP_ID || '';
const fyersAppSecret = process.env.FYERS_APP_SECRET || '';
const fyersRedirectUri = process.env.FYERS_REDIRECT_URI || '';
const allowedFrontendOrigin = 'https://aarthak21-beep.github.io';
const pendingFyersStates = new Map<string, number>();
let fyersAccessToken = '';
let fyersTokenCreatedAt = 0;

app.use('/api/fyers', (req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (origin === allowedFrontendOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedFrontendOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/fyers/status', (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(fyersAppId && fyersAppSecret && fyersRedirectUri),
    connected: Boolean(fyersAccessToken),
    tokenCreatedAt: fyersTokenCreatedAt || null,
    note: fyersAccessToken ? 'FYERS session is connected in this server process.' : 'Connect FYERS to start a read-only session.'
  });
});

app.get('/api/fyers/connect', (_req: Request, res: Response) => {
  if (!fyersAppId || !fyersAppSecret || !fyersRedirectUri) {
    res.status(503).send('FYERS is not configured. Set FYERS_APP_ID, FYERS_APP_SECRET and FYERS_REDIRECT_URI in the server environment.');
    return;
  }
  const state = randomBytes(24).toString('hex');
  pendingFyersStates.set(state, Date.now() + 10 * 60 * 1000);
  const authUrl = new URL('https://api-t1.fyers.in/api/v3/generate-authcode');
  authUrl.searchParams.set('client_id', fyersAppId);
  authUrl.searchParams.set('redirect_uri', fyersRedirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  res.redirect(authUrl.toString());
});

app.get('/api/fyers/callback', async (req: Request, res: Response) => {
  const authCode = typeof req.query.auth_code === 'string' ? req.query.auth_code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const expiresAt = pendingFyersStates.get(state);
  pendingFyersStates.delete(state);

  if (!authCode || !state || !expiresAt || expiresAt < Date.now()) {
    res.status(400).send('FYERS login could not be verified. Please return to MOTI and connect again.');
    return;
  }
  if (!fyersAppId || !fyersAppSecret || !fyersRedirectUri) {
    res.status(503).send('FYERS server configuration is incomplete.');
    return;
  }

  try {
    const appIdHash = createHash('sha256').update(fyersAppId + ':' + fyersAppSecret).digest('hex');
    const tokenResponse = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', appIdHash, code: authCode })
    });
    const tokenData: any = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData?.s !== 'ok' || !tokenData?.access_token) {
      console.error('FYERS token exchange failed:', tokenData?.message || tokenResponse.status);
      res.status(502).send('FYERS authorization was not completed. Please return to MOTI and try connecting again.');
      return;
    }

    fyersAccessToken = tokenData.access_token;
    fyersTokenCreatedAt = Date.now();
    res.status(200).send('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOTI FYERS</title></head><body style="font-family:system-ui;padding:32px;text-align:center"><h2>FYERS connected to MOTI</h2><p>Read-only account connection successful. You can close this tab and return to MOTI.</p></body></html>');
  } catch (error) {
    console.error('FYERS callback error:', error);
    res.status(500).send('Could not complete FYERS connection. Please try again.');
  }
});

app.get('/api/fyers/tradebook', async (_req: Request, res: Response) => {
  if (!fyersAppId || !fyersAccessToken) {
    res.status(401).json({ error: 'FYERS is not connected. Connect your account first.' });
    return;
  }
  try {
    const response = await fetch('https://api-t1.fyers.in/api/v3/tradebook', {
      headers: { Authorization: fyersAppId + ':' + fyersAccessToken }
    });
    const data = await response.json();
    if (!response.ok || data?.s !== 'ok') {
      res.status(response.status || 502).json({ error: data?.message || 'FYERS tradebook request failed', code: data?.code });
      return;
    }
    res.json(data);
  } catch (error) {
    console.error('FYERS tradebook error:', error);
    res.status(502).json({ error: 'Could not fetch FYERS tradebook.' });
  }
});

// FYERS historical executed trades: equity derivatives only (segment_type=2).
app.get('/api/fyers/trade-history', async (req: Request, res: Response) => {
  if (!fyersAppId || !fyersAccessToken) {
    res.status(401).json({ error: 'FYERS is not connected. Connect your account first.' });
    return;
  }
  const now = new Date();
  const fyStartYear = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fromDate = typeof req.query.from_date === 'string' ? req.query.from_date : `${fyStartYear}-04-01`;
  const toDate = typeof req.query.to_date === 'string' ? req.query.to_date : now.toISOString().slice(0, 10);
  const pageNo = Math.max(1, Math.min(100, Number(req.query.page_no) || 1));
  const pageSize = Math.max(1, Math.min(100, Number(req.query.page_size) || 100));
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(fromDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(toDate) || fromDate > toDate) {
    res.status(400).json({ error: 'Dates must use YYYY-MM-DD and from_date must not be after to_date.' });
    return;
  }
  try {
    const url = new URL('https://api-t1.fyers.in/api/v3/trade-history');
    url.searchParams.set('from_date', fromDate);
    url.searchParams.set('to_date', toDate);
    url.searchParams.set('segment_type', '2');
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('page_no', String(pageNo));
    const response = await fetch(url.toString(), {
      headers: { Authorization: fyersAppId + ':' + fyersAccessToken }
    });
    const data = await response.json();
    if (!response.ok || data?.s !== 'ok') {
      res.status(response.status || 502).json({ error: data?.message || 'FYERS trade history request failed', code: data?.code });
      return;
    }
    res.json({ ...data, from_date: fromDate, to_date: toDate, segment_type: 2, page_no: pageNo, page_size: pageSize });
  } catch (error) {
    console.error('FYERS trade history error:', error);
    res.status(502).json({ error: 'Could not fetch FYERS trade history.' });
  }
});

app.get('/api/fyers/positions', async (_req: Request, res: Response) => {
  if (!fyersAppId || !fyersAccessToken) {
    res.status(401).json({ error: 'FYERS is not connected. Connect your account first.' });
    return;
  }
  try {
    const response = await fetch('https://api-t1.fyers.in/api/v3/positions', {
      headers: { Authorization: fyersAppId + ':' + fyersAccessToken }
    });
    const data = await response.json();
    if (!response.ok || data?.s !== 'ok') {
      res.status(response.status || 502).json({ error: data?.message || 'FYERS positions request failed', code: data?.code });
      return;
    }
    res.json(data);
  } catch (error) {
    console.error('FYERS positions error:', error);
    res.status(502).json({ error: 'Could not fetch FYERS positions.' });
  }
});

// AI Financial Assistant endpoint
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, context, chatHistory } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    if (!ai) {
      // Graceful response if API key is not configured in environment
      res.json({
        reply: `Hello! I am MOTI AI, your Money & Operations Tracking Intelligence assistant.\n\nBased on your records:\n- Net Worth: ₹${context?.netWorth?.toLocaleString('en-IN') || '0'}\n- Available Balance: ₹${context?.totalBalance?.toLocaleString('en-IN') || '0'}\n- Stock Realized P&L: ₹${context?.stockPnl?.toLocaleString('en-IN') || '0'}\n\nTo enable full real-time AI intelligence, ensure GEMINI_API_KEY is configured. Meanwhile, I can answer common financial calculation and budgeting questions!`
      });
      return;
    }

    const systemInstruction = `You are MOTI AI, the elite financial and operations intelligence advisor within the MOTI application (Tagline: SMART MONEY. SMART BUSINESS. SMART FUTURE).
Your purpose is to advise the user on their personal finance, stock trading performance, business revenue, freelance invoicing, and daily/weekly earnings.

CRITICAL RULES:
1. Always respect the user's authorized data provided in the financial context.
2. Never claim guaranteed investment returns, predict exact future stock prices, or provide fabricated numbers.
3. Use Indian Rupees (₹) as the primary currency unless the user specifies otherwise.
4. Format dates clearly in DD-MM-YYYY format.
5. Provide actionable, concise, structured financial insights (use bullet points and bold key numbers).
6. Differentiate clearly between Realized P&L (closed trades) and Unrealized P&L (open trades).
7. Remind users that internal account transfers are neither income nor expense.
8. If spending in a category is high relative to income, offer practical tips to cut down.
9. Keep tone professional, encouraging, analytical, and direct.

USER'S CURRENT FINANCIAL SNAPSHOT:
${JSON.stringify(context, null, 2)}
`;

    const contents: any[] = [];
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      // Add last few turns
      for (const turn of chatHistory.slice(-6)) {
        contents.push({
          role: turn.role === 'user' ? 'user' : 'model',
          parts: [{ text: turn.text }]
        });
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    let replyText = '';
    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.4,
          }
        });
        if (response.text) {
          replyText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`Model ${modelName} unavailable, attempting fallback:`, err?.message || err);
      }
    }

    if (!replyText) {
      // Structured rule-based financial advisor fallback based on authorized context
      const bal = context?.totalBalance ? `₹${Number(context.totalBalance).toLocaleString('en-IN')}` : '₹0';
      const nw = context?.netWorth ? `₹${Number(context.netWorth).toLocaleString('en-IN')}` : '₹0';
      const pnl = context?.stockRealizedPnl ? `₹${Number(context.stockRealizedPnl).toLocaleString('en-IN')}` : '₹0';
      const openCap = context?.totalStockInvestment ? `₹${Number(context.totalStockInvestment).toLocaleString('en-IN')}` : '₹0';

      replyText = `**MOTI Financial Intelligence Snapshot**:\n\n` +
        `• **Net Worth**: ${nw}\n` +
        `• **Liquid Balance**: ${bal}\n` +
        `• **Stock Realized P&L**: ${pnl}\n` +
        `• **Active Open Capital**: ${openCap}\n\n` +
        `**Key Observation**:\nYour liquid capital provides healthy coverage for ongoing liabilities. Ensure your emergency reserve remains untouched in your primary bank vault while allocating trading capital only to disciplined, calculated setups with strict stop-losses.`;
    }

    res.json({ reply: replyText });
  } catch (error: any) {
    console.error('MOTI AI Error:', error);
    res.status(500).json({
      error: 'Failed to process AI query',
      details: error?.message || 'Unknown error'
    });
  }
});

async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MOTI Financial Server running at http://localhost:${PORT}`);
  });
}

startServer();
