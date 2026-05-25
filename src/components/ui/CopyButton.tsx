'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  children?: React.ReactNode;
  className?: string;
}

export default function CopyButton({ text, children, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const defaultClass = 'inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-all duration-150';

  return (
    <button
      onClick={handleCopy}
      className={className || (copied
        ? `${defaultClass} bg-green-100 text-green-700`
        : `${defaultClass} bg-gray-100 text-gray-600 hover:bg-gray-200`
      )}
    >
      {copied ? (
        <>
          <Check size={12} />
          {children || '已复制'}
        </>
      ) : (
        <>
          <Copy size={12} />
          {children || '复制'}
        </>
      )}
    </button>
  );
}
