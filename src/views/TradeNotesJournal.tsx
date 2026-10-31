import React, { useMemo, useState } from 'react';
import { ImagePlus, Trash2, Save, BookOpen, X } from 'lucide-react';
import { StockTrade } from '../types';

interface TradeNotesJournalProps {
  trades: StockTrade[];
  onSaveTrades: (trades: StockTrade[]) => void;
}

const compressImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read image'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not process image'));
    image.onload = () => {
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Image compression unavailable'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.72;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 420_000 && quality > 0.38) {
        quality -= 0.08;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      if (result.length > 520_000) return reject(new Error('Image is too large after compression. Please choose a smaller screenshot.'));
      resolve(result);
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
});

export const TradeNotesJournal: React.FC<TradeNotesJournalProps> = ({ trades, onSaveTrades }) => {
  const [selectedId, setSelectedId] = useState(trades[0]?.id || '');
  const [entryReason, setEntryReason] = useState('');
  const [exitNotes, setExitNotes] = useState('');
  const [screenshots, setScreenshots] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [message, setMessage] = useState('');

  const selectedTrade = useMemo(() => trades.find((trade) => trade.id === selectedId), [trades, selectedId]);

  React.useEffect(() => {
    setEntryReason(selectedTrade?.entryReason || '');
    setExitNotes(selectedTrade?.exitNotes || '');
    setScreenshots(selectedTrade?.screenshots || []);
    setMessage('');
  }, [selectedId, selectedTrade?.entryReason, selectedTrade?.exitNotes, selectedTrade?.screenshots]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 2 - screenshots.length;
    if (remaining <= 0) {
      setMessage('Maximum 2 screenshots per trade.');
      return;
    }
    try {
      const additions = await Promise.all(Array.from(files).slice(0, remaining).map(async (file) => ({
        name: file.name,
        dataUrl: await compressImage(file),
      })));
      setScreenshots((current) => [...current, ...additions].slice(0, 2));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add screenshot.');
    }
  };

  const saveJournal = () => {
    if (!selectedTrade) return;
    const updated = trades.map((trade) => trade.id === selectedTrade.id
      ? { ...trade, entryReason, exitNotes, screenshots }
      : trade
    );
    onSaveTrades(updated);
    setMessage('Trade journal saved.');
  };

  return (
    <section className="rounded-2xl border border-[#1e2e4f] bg-[#0d1527] p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-amber-400" />
        <div>
          <h2 className="text-sm font-black text-white">TRADE NOTES & SCREENSHOT JOURNAL</h2>
          <p className="text-[11px] text-slate-400">Record your setup, decision and chart evidence for each saved trade.</p>
        </div>
      </div>

      {trades.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#30415f] p-5 text-center text-xs text-slate-400">Add an equity trade first. It will appear here automatically.</p>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Select Trade</label>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2.5 text-xs text-white outline-none focus:border-amber-400">
              {trades.map((trade) => <option key={trade.id} value={trade.id}>{trade.stockName} · {trade.entryDate} · {trade.status}</option>)}
            </select>
          </div>

          {selectedTrade && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#070d18] p-3 text-xs">
                <div><span className="text-slate-500">Entry</span><p className="font-bold text-white">₹{selectedTrade.entryPrice.toLocaleString('en-IN')} × {selectedTrade.quantity}</p></div>
                <div><span className="text-slate-500">Status</span><p className={selectedTrade.status === 'CLOSED' ? 'font-bold text-emerald-400' : 'font-bold text-amber-300'}>{selectedTrade.status}</p></div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Why did you enter this trade?</label>
                <textarea rows={3} value={entryReason} onChange={(event) => setEntryReason(event.target.value)} placeholder="Example: Breakout above resistance, volume confirmation, support retest..." className="w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-amber-400" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">Exit Review / What did you learn?</label>
                <textarea rows={3} value={exitNotes} onChange={(event) => setExitNotes(event.target.value)} placeholder="Record why you exited, whether you followed the plan, and lessons learned..." className="w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none focus:border-amber-400" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-300">Chart / Trade Screenshots</label>
                  <span className="text-[10px] text-slate-500">{screenshots.length}/2 · JPG/PNG/WebP</span>
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#40516d] bg-[#070d18] px-3 py-4 text-xs font-semibold text-slate-300 hover:border-amber-400 hover:text-amber-300">
                  <ImagePlus className="h-4 w-4" /> Add screenshot
                  <input type="file" accept="image/*" multiple className="hidden" disabled={screenshots.length >= 2} onChange={(event) => { void handleFiles(event.target.files); event.currentTarget.value = ''; }} />
                </label>
                {screenshots.length > 0 && <div className="grid grid-cols-2 gap-3">
                  {screenshots.map((shot, index) => (
                    <div key={index} className="relative overflow-hidden rounded-xl border border-[#30415f]">
                      <img src={shot.dataUrl} alt={shot.name} className="h-32 w-full object-cover" />
                      <div className="flex items-center justify-between gap-1 p-2">
                        <span className="truncate text-[10px] text-slate-400">{shot.name}</span>
                        <button type="button" onClick={() => setScreenshots((current) => current.filter((_, i) => i !== index))} title="Remove screenshot" className="shrink-0 rounded p-1 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>}
                <p className="text-[10px] text-slate-500">Screenshots are compressed and saved with this trade in MOTI's browser/cloud backup. Maximum 2 per trade; each is compressed before saving.</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={message.includes('saved') ? 'text-xs text-emerald-400' : 'text-xs text-rose-300'}>{message}</span>
                <button type="button" onClick={saveJournal} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-400">
                  <Save className="h-4 w-4" /> Save Journal
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};
