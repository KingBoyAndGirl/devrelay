'use client';

import { useState, useEffect, useRef } from 'react';
import { PERMISSIONS, getDefaultPermissions, ROLE_BADGES, ROLE_LABELS, type Role } from '@/lib/permissions';

interface Props {
  role: Role;
  onChange?: (selected: string[]) => void;
}

export default function PermissionSelector({ role, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(new Set(getDefaultPermissions(role)));
  }, [role]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetToDefaults() {
    setSelected(new Set(getDefaultPermissions(role)));
  }

  useEffect(() => {
    onChange?.(Array.from(selected));
  }, [selected]);

  const allItemIds = PERMISSIONS.flatMap(a => a.items.map(i => i.id));
  const defaults = new Set(getDefaultPermissions(role));
  const customCount = Array.from(selected).filter(id => !defaults.has(id)).length;
  const removedCount = getDefaultPermissions(role).filter(id => !selected.has(id)).length;

  function selectAll() {
    setSelected(new Set(allItemIds));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_BADGES[role]}`}>
            {ROLE_LABELS[role]}
          </span>
          <span className="text-gray-500 text-xs">
            {selected.size} 项权限
            {customCount > 0 && <span className="text-blue-600 ml-1">+{customCount} 自定义</span>}
            {removedCount > 0 && <span className="text-red-500 ml-1">-{removedCount} 已移除</span>}
          </span>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              角色默认权限已勾选，可按需调整
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={resetToDefaults} className="text-xs text-blue-600 hover:underline">重置</button>
              <button type="button" onClick={selectAll} className="text-xs text-gray-500 hover:underline">全选</button>
              <button type="button" onClick={clearAll} className="text-xs text-gray-500 hover:underline">清空</button>
            </div>
          </div>

          {PERMISSIONS.map(area => (
            <div key={area.area} className="border-b border-gray-50 last:border-0">
              <div className="px-3 py-1.5 bg-gray-50 text-xs font-medium text-gray-500">
                {area.area}
              </div>
              {area.items.map(item => {
                const isChecked = selected.has(item.id);
                const isDefault = defaults.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(item.id)}
                      className="rounded border-gray-300"
                    />
                    <span className={`text-xs ${isChecked ? 'text-gray-800' : 'text-gray-400'}`}>
                      {item.label}
                    </span>
                    {isDefault && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 ml-auto">
                        默认
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
