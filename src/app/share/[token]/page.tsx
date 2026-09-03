'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface NoteData {
  title: string;
  content: string;
  shareType: 'ONE_TIME' | 'TIME_BASED';
  accessType: 'PUBLIC' | 'PASSWORD_PROTECTED';
  viewCount: number;
  expiresAt: string;
}

export default function ShareRecipientPage() {
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Password unlock states
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Unlocked note data
  const [note, setNote] = useState<NoteData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/share/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'This note is no longer available.');
          return;
        }
        if (data.requiresPassword) {
          setRequiresPassword(true);
          setNoteTitle(data.title);
        } else {
          setNote(data);
        }
      })
      .catch(() => {
        setErrorMsg('Network error while loading note.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);

    try {
      const res = await fetch(`/api/share/${token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'ONE_TIME_USED' || data.code === 'LINK_EXPIRED' || data.code === 'LINK_REVOKED') {
          setErrorMsg(data.error);
          setRequiresPassword(false);
          return;
        }
        throw new Error(data.error || 'Incorrect password');
      }

      setRequiresPassword(false);
      setNote(data);
    } catch (err: any) {
      setUnlockError(err.message);
    } finally {
      setUnlocking(false);
    }
  };

  const copyContent = async () => {
    if (!note) return;
    await navigator.clipboard.writeText(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="text-center py-16 text-zinc-500 text-sm">Loading note...</div>;
  }

  // Error state (expired, revoked, already used)
  if (errorMsg) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white">Note Unavailable</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">{errorMsg}</p>
          </div>
          <div className="pt-2">
            <Link
              href="/notes/new"
              className="inline-block text-xs px-3 py-1.5 rounded bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
            >
              Create your own note
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Password prompt
  if (requiresPassword) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-white">Password Required</h1>
            <p className="text-xs text-zinc-400">
              Enter the password provided by the sender to read &quot;{noteTitle}&quot;.
            </p>
          </div>

          {unlockError && (
            <div className="bg-red-950/40 border border-red-800 text-red-300 px-3 py-2 rounded text-xs">
              {unlockError}
            </div>
          )}

          <form onSubmit={handleUnlock} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">Password</label>
              <input
                type="password"
                required
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
              />
            </div>

            <button
              type="submit"
              disabled={unlocking}
              className="w-full py-2 px-3 rounded bg-white hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {unlocking ? 'Verifying...' : 'Unlock Note'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Note content revealed
  if (note) {
    const isOneTime = note.shareType === 'ONE_TIME';

    return (
      <div className="max-w-xl mx-auto space-y-4 pt-4">
        {isOneTime && (
          <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs px-3.5 py-2.5 rounded">
            <strong>One-time note:</strong> This note has been destroyed. If you close or refresh this page, you won&apos;t be able to see it again.
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-white">{note.title}</h1>
            <button
              type="button"
              onClick={copyContent}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {note.content}
          </div>

          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
            <span>{note.viewCount} views</span>
            <Link href="/notes/new" className="text-zinc-400 hover:text-zinc-200 underline">
              Create a note
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
