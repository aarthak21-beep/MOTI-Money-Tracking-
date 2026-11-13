import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
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
