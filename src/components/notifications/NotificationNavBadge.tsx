'use client';

import { useState, useEffect } from 'react';

export default function NotificationNavBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(data => setCount(data.unreadCount || 0))
      .catch(() => {});
  }, []);

  return count > 0 ? (
    <span className="ml-auto bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
      {count > 9 ? '9+' : count}
    </span>
  ) : null;
}
