'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsLight(true);
      document.documentElement.classList.add('light');
    } else {
      setIsLight(false);
      document.documentElement.classList.remove('light');
    }

    // Load user
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, [pathname]);

  const toggleTheme = () => {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
    router.refresh();
  };

  return (
    <nav className="border-b border-zinc-800 bg-[#1e2127]/90 sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-base text-zinc-100 hover:text-white transition-colors">
          NoteShare
        </Link>

        <div className="flex items-center gap-3.5 text-sm">
          {/* Theme switcher for Grey Mode */}
          <button
            type="button"
            onClick={toggleTheme}
            className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 border border-zinc-800 transition-colors"
            title="Toggle between Dark Grey and Light Grey"
          >
            {isLight ? '🌙 Dark Grey' : '☀️ Light Grey'}
          </button>

          {user ? (
            <>
              <Link
                href="/notes/new"
                className={`transition-colors ${
                  pathname === '/notes/new' ? 'text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                + New Note
              </Link>
              <Link
                href="/notes"
                className={`transition-colors ${
                  pathname === '/notes' ? 'text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                My Notes
              </Link>
              <div className="h-3 w-px bg-zinc-800" />
              <span className="text-xs text-zinc-500 hidden sm:inline">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-zinc-400 hover:text-zinc-200 transition-colors">
                Login
              </Link>
              <Link
                href="/register"
                className="px-3 py-1 rounded bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors text-xs"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
