import React, { useState } from 'react';
import {
  Settings,
  User,
  Shield,
  Lock,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  CheckCircle,
  Briefcase,
  Globe,
  Database
} from 'lucide-react';
import { UserProfile, Profession } from '../types';
import { StorageService } from '../services/storageService';
import { CloudSyncService } from '../services/cloudSyncService';

interface SettingsViewProps {
  profile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onRefreshData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  onUpdateProfile,
  onRefreshData,
}) => {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [profession, setProfession] = useState<Profession>(profile.profession);
  const [currencySymbol, setCurrencySymbol] = useState(profile.currencySymbol || '₹');
  const [pinEnabled, setPinEnabled] = useState(profile.pinEnabled);
  const [pinCode, setPinCode] = useState(profile.pinCode || '1234');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [cloudUrl, setCloudUrl] = useState(CloudSyncService.getUrl());
  const [cloudStatus, setCloudStatus] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);

  const professions: Profession[] = [
    'Stock Trader',
    'Delivery Partner',
    'Employee',
    'Freelancer',
    'Business Owner',
    'Shop Owner',
    'Self Employed',
    'Investor',
    'Other',
  ];

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinEnabled && !/^\d{4}$/.test(pinCode)) {
      alert('Enter exactly 4 digits for the security PIN.');
      return;
    }
    const updated: UserProfile = {
      ...profile,
      name,
      email,
      avatar,
      profession,
      currencySymbol,
      pinEnabled,
      pinCode,
    };
    onUpdateProfile(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const jsonStr = StorageService.exportCompleteBackup(profile.id);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MOTI_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = StorageService.importCompleteBackup(content, profile.id);
        if (success) {
          alert('Backup restored successfully!');
          onRefreshData();
        } else {
          alert('Failed to import backup: invalid file format.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSaveCloudUrl = () => {
    CloudSyncService.setUrl(cloudUrl);
    setCloudStatus(cloudUrl.trim() ? 'Apps Script URL saved on this device.' : 'Cloud sync disconnected.');
  };

  const handleCloudUpload = async () => {
    if (!CloudSyncService.getUrl()) {
      setCloudStatus('Paste and save your Apps Script Web App URL first.');
      return;
    }
    setCloudBusy(true);
    try {
      const data = JSON.parse(StorageService.exportCompleteBackup(profile.id));
      await CloudSyncService.save({ exportedAt: new Date().toISOString(), data });
      setCloudStatus('Sync request sent. Your Google account must be signed in and authorized.');
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'Cloud sync failed.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!CloudSyncService.getUrl()) {
      setCloudStatus('Paste and save your Apps Script Web App URL first.');
      return;
    }
    setCloudBusy(true);
    try {
      const snapshot = await CloudSyncService.load();
      if (!snapshot?.data) {
        setCloudStatus('No cloud backup found for this Google account yet.');
      } else if (window.confirm('Restore the cloud backup to this device? Current local data will be replaced.')) {
        const restored = StorageService.importCompleteBackup(JSON.stringify(snapshot.data), profile.id);
        if (restored) {
          onRefreshData();
          setCloudStatus('Cloud backup restored to this device.');
        } else {
          setCloudStatus('The cloud backup format is invalid.');
        }
      } else {
        setCloudStatus('Restore cancelled. Local data was not changed.');
      }
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : 'Could not restore cloud backup.');
    } finally {
      setCloudBusy(false);
    }
  };

  // Seed sample data
  const handleSeedData = () => {
    if (window.confirm('Populate with professional sample records (trades, weekly ledgers, invoices, expenses)?')) {
      StorageService.seedDemoData(profile.id);
      onRefreshData();
      alert('Sample data seeded successfully!');
    }
  };

  // Wipe data for fresh production use
  const handleClearData = () => {
    if (window.confirm('WARNING: Are you sure you want to clear all data and start with empty production records?')) {
      StorageService.clearAllData(profile.id);
      onRefreshData();
      alert('All ledgers cleared. Fresh production workspace active.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-[#1e2e4f] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white sm:text-3xl">SETTINGS & CONFIGURATION</h1>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300 border border-slate-700">
              PREFERENCES
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tailor your profession modules, currency symbols, security PIN lock, and cloud backups.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded-xl">
            <CheckCircle className="h-4 w-4" />
            <span>Profile Saved Successfully</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile & Profession Form */}
        <div className="lg:col-span-2 rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-xl">
          <div className="flex items-center space-x-2 border-b border-[#1e2e4f] pb-3">
            <User className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Profile & Identity</h2>
          </div>

          <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3.5 py-2.5 text-xs text-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Profession Classification
              </label>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-1.5">
                Adapts navigation cues and intelligence algorithms specifically to your trade.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {professions.map((prof) => (
                  <button
                    type="button"
                    key={prof}
                    onClick={() => setProfession(prof)}
                    className={`rounded-xl p-2.5 text-xs font-bold border text-left transition-all cursor-pointer ${
                      profession === prof
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-[#1e2e4f] bg-[#070d18] text-slate-400 hover:text-white'
                    }`}
                  >
                    {prof}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Currency Symbol</label>
                <select
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="₹">₹ - Indian Rupee (INR)</option>
                  <option value="$">$ - US Dollar (USD)</option>
                  <option value="€">€ - Euro (EUR)</option>
                  <option value="£">£ - British Pound (GBP)</option>
                  <option value="AED">AED - UAE Dirham</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300">Date Format</label>
                <input
                  type="text"
                  disabled
                  value="DD-MM-YYYY (Strict Standard)"
                  className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18]/50 px-3 py-2 text-xs text-slate-400 cursor-not-allowed"
                />
              </div>
            </div>

            {/* PIN Protection */}
            <div className="rounded-2xl border border-[#1e2e4f] bg-[#070d18] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Lock className="h-4 w-4 text-amber-400" />
                  <div>
                    <h3 className="text-xs font-bold text-white">Security PIN Vault Protection</h3>
                    <p className="text-[11px] text-slate-400">Lock financial records with a 4-digit master PIN.</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={pinEnabled}
                  onChange={(e) => setPinEnabled(e.target.checked)}
                  className="h-5 w-5 accent-amber-500 rounded cursor-pointer"
                />
              </div>

              {pinEnabled && (
                <div className="mt-3 pt-3 border-t border-[#1e2e4f] flex items-center space-x-3">
                  <span className="text-xs font-semibold text-slate-300">4-Digit PIN:</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-24 rounded-lg border border-amber-500/50 bg-[#0d1527] px-3 py-1 text-center font-mono text-sm tracking-widest text-amber-300 outline-none"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-bold text-slate-950 shadow-lg hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer"
            >
              Save Profile & Configuration
            </button>
          </form>
        </div>

        {/* Database & Cloud Backup Actions */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-xl">
            <div className="flex items-center space-x-2 border-b border-[#1e2e4f] pb-3">
              <Database className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-bold text-white">Cloud & Local Backup</h2>
            </div>

            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              Export a complete JSON snapshot of your financial records. The file is not encrypted; store it somewhere private.
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                onClick={handleExportBackup}
                className="w-full flex items-center justify-center space-x-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Export JSON Backup</span>
              </button>

              <label className="w-full flex items-center justify-center space-x-2 rounded-xl border border-[#1e2e4f] bg-[#070d18] py-2.5 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-500 transition-all cursor-pointer">
                <Upload className="h-4 w-4" />
                <span>Restore from JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-500/30 bg-[#0d1527] p-6 shadow-xl">
            <div className="flex items-center space-x-2 border-b border-[#1e2e4f] pb-3">
              <Globe className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">Google Sheets Cloud Sync</h2>
            </div>
            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              Connect your own Google Apps Script Web App. Changes are backed up to your Google Sheet and can be restored on another device.
            </p>
            <label className="mt-4 block text-xs font-semibold text-slate-300">Apps Script Web App URL</label>
            <input
              type="url"
              value={cloudUrl}
              onChange={(e) => setCloudUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="mt-1 w-full rounded-xl border border-[#1e2e4f] bg-[#070d18] px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-400"
            />
            <button onClick={handleSaveCloudUrl} className="mt-2 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20">
              Save Apps Script URL
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button disabled={cloudBusy} onClick={handleCloudUpload} className="rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50">
                Sync to Sheet
              </button>
              <button disabled={cloudBusy} onClick={handleCloudRestore} className="rounded-xl border border-[#1e2e4f] bg-[#070d18] py-2.5 text-xs font-bold text-slate-200 disabled:opacity-50">
                Restore from Sheet
              </button>
            </div>
            {cloudStatus && <p className="mt-3 text-[11px] text-emerald-300">{cloudStatus}</p>}
            <p className="mt-3 text-[10px] leading-relaxed text-amber-300/80">
              Use the Google account that owns the Sheet. Keep the Sheet private; do not share the Apps Script URL publicly.
            </p>
          </div>

          {/* Test & Production Data Management (Section 19) */}
          <div className="rounded-3xl border border-[#1e2e4f] bg-[#0d1527] p-6 shadow-xl">
            <div className="flex items-center space-x-2 border-b border-[#1e2e4f] pb-3">
              <RefreshCw className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">Workspace Data State</h2>
            </div>

            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              Toggle between realistic demo records (to test calculations across modules) or start with a clean slate for production accounts.
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                onClick={handleSeedData}
                className="w-full flex items-center justify-center space-x-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Load Sample Data</span>
              </button>

              <button
                onClick={handleClearData}
                className="w-full flex items-center justify-center space-x-2 rounded-xl border border-rose-500/40 bg-rose-500/10 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear All Data (Clean Production)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
