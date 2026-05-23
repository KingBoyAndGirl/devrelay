'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
    >
      退出
    </button>
  );
}
