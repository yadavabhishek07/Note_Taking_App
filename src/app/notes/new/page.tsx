'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function generateKey(length = 10): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export default function NewNotePage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shareType, setShareType] = useState<'ONE_TIME' | 'TIME_BASED'>('ONE_TIME');
  const [accessType, setAccessType] = useState<'PUBLIC' | 'PASSWORD_PROTECTED'>('PUBLIC');
  const [expiryPreset, setExpiryPreset] = useState<'10m' | '1h' | '24h' | '7d'>('24h');
  const [dynamicKey, setDynamicKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<{
    noteId: string;
    shareUrl: string;
    dynamicPassword: string | null;
  } | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    setDynamicKey(generateKey(10));
  }, []);

  const calculateExpiresAt = (): string => {
    const now = new Date();
    if (expiryPreset === '10m') return new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    if (expiryPreset === '1h') return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    if (expiryPreset === '7d') return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const expiresAt = calculateExpiresAt();
      const customPassword = accessType === 'PASSWORD_PROTECTED' ? dynamicKey : undefined;

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          shareType,
          accessType,
          expiresAt,
          customPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(data.error || 'Failed to create note');
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setResult({
        noteId: data.note.id,
        shareUrl: `${origin}/share/${data.shareLink.token}`,
        dynamicPassword: data.shareLink.dynamicPassword || customPassword || null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, isKey = false) => {
    await navigator.clipboard.writeText(text);
    if (isKey) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleReset = () => {
    setTitle('');
    setContent('');
    setShareType('ONE_TIME');
    setAccessType('PUBLIC');
    setExpiryPreset('24h');
    setDynamicKey(generateKey(10));
    setResult(null);
  };

  if (result) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">Note Created</h2>
            <p className="text-xs text-zinc-400">Share this link with the recipient.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-300 font-medium">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={result.shareUrl}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 select-all"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(result.shareUrl, false)}
                className="px-3 py-2 rounded bg-white text-zinc-900 text-xs font-medium hover:bg-zinc-200 transition-colors flex-shrink-0"
              >
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {result.dynamicPassword && (
            <div className="space-y-1.5 pt-2 border-t border-zinc-800">
              <label className="text-xs text-zinc-300 font-medium">Password / Access Key</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={result.dynamicPassword}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(result.dynamicPassword || '', true)}
                  className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-colors flex-shrink-0"
                >
                  {copiedKey ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Share this password with the recipient separately.</p>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800">
            <button onClick={handleReset} className="hover:text-white transition-colors">
              + Create Another Note
            </button>
            <Link href={`/notes/${result.noteId}`} className="text-zinc-200 hover:underline">
              Manage Note &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Create a Note</h1>
        <p className="text-xs text-zinc-400">Share a note with an expiring link.</p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 text-red-300 px-3 py-2 rounded text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">Content</label>
          <textarea
            required
            rows={7}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note here..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
          />
        </div>

        {/* Options Row */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Expiry */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Expires In</label>
              <select
                value={expiryPreset}
                onChange={(e) => setExpiryPreset(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="10m">10 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days</option>
              </select>
            </div>

            {/* Share Type */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Share Type</label>
              <select
                value={shareType}
                onChange={(e) => setShareType(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="ONE_TIME">One-time (burn after read)</option>
                <option value="TIME_BASED">Time-based (multiple views)</option>
              </select>
            </div>

            {/* Access Type */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Access Type</label>
              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="PUBLIC">Public (no password)</option>
                <option value="PASSWORD_PROTECTED">Password-protected</option>
              </select>
            </div>
          </div>

          {/* Dynamic Password Display if Protected */}
          {accessType === 'PASSWORD_PROTECTED' && (
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-3 text-xs">
              <div className="text-zinc-400">
                Access Key: <span className="font-mono text-white font-medium ml-1">{dynamicKey}</span>
              </div>
              <button
                type="button"
                onClick={() => setDynamicKey(generateKey(10))}
                className="text-zinc-400 hover:text-white underline text-[11px]"
              >
                Regenerate key
              </button>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded bg-white hover:bg-zinc-200 text-zinc-900 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Note'}
        </button>
      </form>
    </div>
  );
}
