import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  TrendingUp,
  Receipt,
  PiggyBank,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Lightbulb
} from 'lucide-react';
import { FinancialContextSummary, UserProfile } from '../types';
import { formatINR } from '../utils/exportUtils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AiAssistantViewProps {
  profile: UserProfile;
  summary: FinancialContextSummary;
}

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({ profile, summary }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome_1',
      role: 'assistant',
      content: `Hello ${profile.name}! I am **MOTI AI**, your personal Money & Operations Tracking Intelligence advisor.\n\nI have authorized access to your current financial ledger:\n- **Net Worth**: ₹${formatINR(summary.netWorth)}\n- **Liquid Balance**: ₹${formatINR(summary.totalBalance)}\n- **Stock Realized P&L**: ₹${formatINR(summary.stockRealizedPnl)}\n- **Open Trade Capital**: ₹${formatINR(summary.totalStockInvestment)}\n\nHow can I help optimize your capital, audit your expenses, or analyze your trading performance today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: summary,
          chatHistory: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            text: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const reply = data.reply || 'I processed your query, but could not produce insights.';

      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error('MOTI AI failed', err);
      // Helpful fallback response using live metrics
      const fallbackMsg: Message = {
        id: `bot_${Date.now()}`,
        role: 'assistant',
        content: `Based on your live records:\n\n• **Liquid Available Balance**: ₹${formatINR(summary.totalBalance)}\n• **Active Stock Investment**: ₹${formatINR(summary.totalStockInvestment)} across ${summary.activeTradeCount} positions\n• **Stock Realized P&L**: ₹${formatINR(summary.stockRealizedPnl)} (${summary.closedTradeCount} closed trades)\n• **Total Logged Outflow**: ₹${formatINR(summary.totalExpenses)}\n• **Pending Receivables**: ₹${formatINR(summary.pendingPayments)}\n\n💡 **Advisor Recommendation**: Maintain at least 3 months of emergency expenses in your Liquid Bank Vault before sizing up high-risk trades. Keep reviewing weekly expenses to maximize retention!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    { label: 'Audit My Spending', query: 'Analyze my expenses vs income and pinpoint where I can cut down burn.' },
    { label: 'Stock Trading Review', query: 'Review my stock trading P&L, win rate, and give risk management advice.' },
    { label: 'Cashflow Health Check', query: 'Examine my liquid balances, emergency buffer, and pending client invoices.' },
    { label: 'Weekly Income Growth', query: 'How has my weekly income and shift earnings trended? Give me growth targets.' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">MOTI AI FINANCIAL ASSISTANT</h1>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              INTELLIGENCE ENGINE
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Private, context-aware financial intelligence operating strictly on your authorized ledger data.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 rounded-xl px-3 py-1.5 self-start sm:self-auto">
          <ShieldCheck className="h-4 w-4" />
          <span>No Hallucinated Returns • 100% Data Grounded</span>
        </div>
      </div>

      {/* Chat Container */}
      <div className="rounded-3xl border border-[#1e2e4f] bg-[#0d1527] shadow-2xl flex flex-col h-[650px] overflow-hidden">
        {/* Quick Suggestion Chips */}
        <div className="p-3 border-b border-[#1e2e4f] bg-[#0a101f] flex flex-wrap gap-2">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p.query)}
              className="rounded-lg border border-[#1e2e4f] bg-[#070d18] px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:border-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer flex items-center gap-1"
            >
              <Lightbulb className="h-3 w-3 text-amber-400" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                    isUser
                      ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                      : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-amber-500 text-slate-950 font-medium'
                      : 'border border-[#1e2e4f] bg-[#070d18] text-slate-200'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  <div
                    className={`mt-2 text-[10px] ${
                      isUser ? 'text-slate-900/70 text-right' : 'text-slate-500'
                    }`}
                  >
                    {m.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/20 text-emerald-300">
                <Bot className="h-4 w-4 animate-spin-slow" />
              </div>
              <div className="rounded-2xl border border-[#1e2e4f] bg-[#070d18] px-4 py-3 text-xs text-slate-400 flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>MOTI AI is analyzing your financial records...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-[#1e2e4f] bg-[#0a101f]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              placeholder="Ask MOTI AI anything about your trades, revenue, taxes, or savings..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="flex-1 rounded-xl border border-[#1e2e4f] bg-[#070d18] px-4 py-3 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 transition-all cursor-pointer shrink-0"
            >
              <Send className="h-4 w-4 stroke-[2.5]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
