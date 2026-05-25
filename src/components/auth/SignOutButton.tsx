'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
    >
      <LogOut size={14} />
      退出
    </button>
  );
}
