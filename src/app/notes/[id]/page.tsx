'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface NoteDetail {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface ShareLinkDetail {
  id: string;
  token: string;
  shareType: 'ONE_TIME' | 'TIME_BASED';
  accessType: 'PUBLIC' | 'PASSWORD_PROTECTED';
  plainKeyHint: string | null;
  expiresAt: string;
  isRevoked: boolean;
  usedAt: string | null;
  viewCount: number;
}

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const noteId = params?.id as string;

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [activeLink, setActiveLink] = useState<ShareLinkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchNote = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/notes/${noteId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Note not found');
      const data = await res.json();
      setNote(data.note);
      setActiveLink(data.activeLink);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (noteId) fetchNote();
  }, [noteId]);

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this link?')) return;
    setRevoking(true);
    try {
      await fetch(`/api/notes/${noteId}/revoke`, { method: 'POST' });
      await fetchNote();
    } catch {
      //
    } finally {
      setRevoking(false);
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

  if (loading) {
    return <div className="text-center py-12 text-zinc-500 text-sm">Loading note...</div>;
  }

  if (!note) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-zinc-400 text-sm">Note not found.</p>
        <Link href="/notes" className="text-xs text-zinc-200 underline">
          &larr; Back to My Notes
        </Link>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = activeLink ? `${origin}/share/${activeLink.token}` : null;

  const isExpired = activeLink && new Date(activeLink.expiresAt).getTime() <= Date.now();
  const isUsed = activeLink?.shareType === 'ONE_TIME' && activeLink.usedAt;
  const isRevoked = activeLink?.isRevoked;
  const isActive = activeLink && !isRevoked && !isExpired && !isUsed;

  const getStatusLabel = () => {
    if (!activeLink) return 'No Link';
    if (isRevoked) return 'Revoked';
    if (isUsed) return 'Used / Burned';
    if (isExpired) return 'Expired';
    return 'Active';
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <Link href="/notes" className="hover:text-white transition-colors">
          &larr; My Notes
        </Link>
        <span className="capitalize">{getStatusLabel()}</span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-white">{note.title}</h1>
          <p className="text-xs text-zinc-400">
            {activeLink?.shareType === 'ONE_TIME' ? 'One-time' : 'Time-based'} &bull;{' '}
            {activeLink?.accessType === 'PASSWORD_PROTECTED' ? 'Password protected' : 'Public'} &bull;{' '}
            {activeLink ? `${activeLink.viewCount} views` : ''}
          </p>
        </div>

        {shareUrl && (
          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            <label className="text-xs text-zinc-300 font-medium">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className={`w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono select-all ${
                  isActive ? 'text-zinc-200' : 'text-zinc-500 line-through'
                }`}
              />
              <button
                type="button"
                onClick={() => copyToClipboard(shareUrl, false)}
                className="px-3 py-2 rounded bg-white text-zinc-900 text-xs font-medium hover:bg-zinc-200 transition-colors flex-shrink-0"
              >
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {activeLink?.plainKeyHint && (
          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            <label className="text-xs text-zinc-300 font-medium">Password / Access Key</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={activeLink.plainKeyHint}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 select-all"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(activeLink.plainKeyHint || '', true)}
                className="px-3 py-2 rounded bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-colors flex-shrink-0"
              >
                {copiedKey ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5 pt-2 border-t border-zinc-800">
          <label className="text-xs text-zinc-300 font-medium">Content</label>
          <div className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {note.content}
          </div>
        </div>

        {isActive && (
          <div className="pt-2 border-t border-zinc-800 flex justify-end">
            <button
              type="button"
              onClick={handleRevoke}
              disabled={revoking}
              className="text-xs text-red-400 hover:text-red-300 underline"
            >
              {revoking ? 'Revoking...' : 'Revoke link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
