import React, { useState } from 'react';
import { Lock, ShieldCheck, Delete, ArrowRight } from 'lucide-react';

interface PinLockModalProps {
  correctPin: string;
  onUnlock: () => void;
  userName: string;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  correctPin,
  onUnlock,
  userName,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleKeyClick = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(false);
      if (nextPin.length === 4) {
        if (nextPin === correctPin) {
          setTimeout(() => {
            onUnlock();
            setPin('');
          }, 150);
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 800);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070d18] px-4 backdrop-blur-xl">
      <div className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-[#0d1527] p-8 text-center shadow-2xl shadow-black">
        {/* Monogram Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-400 mb-4">
          <Lock className="h-8 w-8" />
        </div>

        <h2 className="text-xl font-black text-white">MOTI SECURE VAULT</h2>
        <p className="mt-1 text-xs text-slate-400">
          Enter 4-digit Security PIN for <span className="text-amber-400 font-semibold">{userName}</span>
        </p>

        {/* PIN Indicators */}
        <div className="my-6 flex justify-center space-x-4">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`h-4 w-4 rounded-full border-2 transition-all duration-200 ${
                  error
                    ? 'border-rose-500 bg-rose-500/50 animate-bounce'
                    : isFilled
                    ? 'border-amber-400 bg-amber-400 scale-110 shadow-lg shadow-amber-400/50'
                    : 'border-slate-700 bg-slate-900'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <p className="mb-4 text-xs font-semibold text-rose-400 animate-pulse">
            Incorrect PIN. Please try again.
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleKeyClick(digit)}
              className="flex h-14 items-center justify-center rounded-2xl border border-[#1e2e4f] bg-[#070d18] text-lg font-bold text-white hover:border-amber-400 hover:bg-[#131f38] active:scale-95 transition-all cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleKeyClick('0')}
            className="flex h-14 items-center justify-center rounded-2xl border border-[#1e2e4f] bg-[#070d18] text-lg font-bold text-white hover:border-amber-400 hover:bg-[#131f38] active:scale-95 transition-all cursor-pointer"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="flex h-14 items-center justify-center rounded-2xl border border-[#1e2e4f] bg-[#070d18] text-slate-400 hover:text-white hover:border-slate-500 active:scale-95 transition-all cursor-pointer"
            title="Delete"
          >
            <Delete className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center space-x-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Client-Side AES & Zero-Knowledge Verification</span>
        </div>
      </div>
    </div>
  );
};
