'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface NoteItem {
  id: string;
  title: string;
  createdAt: string;
  shareLink: {
    token: string;
    shareType: 'ONE_TIME' | 'TIME_BASED';
    accessType: 'PUBLIC' | 'PASSWORD_PROTECTED';
    expiresAt: string;
    isRevoked: boolean;
    usedAt: string | null;
    viewCount: number;
  } | null;
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notes')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.notes) setNotes(data.notes);
      })
      .finally(() => setLoading(false));
  }, []);

  const getStatus = (link: NoteItem['shareLink']) => {
    if (!link) return 'No link';
    if (link.isRevoked) return 'Revoked';
    if (link.shareType === 'ONE_TIME' && link.usedAt) return 'Used';
    if (new Date(link.expiresAt).getTime() <= Date.now()) return 'Expired';
    return 'Active';
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">My Notes</h1>
        <Link
          href="/notes/new"
          className="text-xs px-3 py-1.5 rounded bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
        >
          + New Note
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-500 text-sm">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-2">
          <p className="text-sm text-zinc-400">No notes created yet.</p>
          <Link href="/notes/new" className="text-xs text-zinc-200 underline">
            Create your first note
          </Link>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {notes.map((note) => {
            const status = getStatus(note.shareLink);
            return (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors block"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-white">{note.title}</div>
                  <div className="text-xs text-zinc-500">
                    {note.shareLink?.shareType === 'ONE_TIME' ? 'One-time' : 'Time-based'} &bull;{' '}
                    {note.shareLink?.viewCount || 0} views &bull;{' '}
                    {new Date(note.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-xs ${
                      status === 'Active'
                        ? 'text-emerald-400'
                        : status === 'Revoked'
                        ? 'text-red-400'
                        : 'text-zinc-500'
                    }`}
                  >
                    {status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
