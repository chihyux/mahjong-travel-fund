import type { ReactNode } from 'react';
import { useStore } from '../hooks/useStore';
import Toast from './ui/Toast';
import type { ViewKey } from '../types';

interface NavEntry {
  key: ViewKey;
  icon: string;
  label: string;
}

const PUBLIC_NAV: ReadonlyArray<NavEntry> = [
  { key: 'dashboard', icon: '🌿', label: '首頁' },
  { key: 'history', icon: '📖', label: '紀錄' },
  { key: 'weeklySettlements', icon: '📅', label: '週結算' },
  { key: 'login', icon: '🔑', label: '管理員登入' }
];

const ADMIN_NAV: ReadonlyArray<NavEntry> = [
  { key: 'dashboard', icon: '🌿', label: '首頁' },
  { key: 'addTsumo', icon: '🀄', label: '自摸' },
  { key: 'history', icon: '📖', label: '紀錄' },
  { key: 'more', icon: '☰', label: '更多' }
];

interface ShellProps {
  current: ViewKey;
  onNav: (next: ViewKey) => void;
  children: ReactNode;
}

export default function Shell({ current, onNav, children }: ShellProps) {
  const { data, isAdmin, toast } = useStore();
  const groupName = data.settings.group_name || '家庭旅遊基金';
  const nav = isAdmin ? ADMIN_NAV : PUBLIC_NAV;

  return (
    <div className="min-h-screen bg-bg">
      <div className="md:flex">
        <aside className="hidden md:block w-64 min-h-screen border-r border-divider bg-bg/60 backdrop-blur">
          <div className="p-6">
            <div className="text-3xl mb-2">🌿</div>
            <div className="font-serif text-[22px] font-bold leading-tight">{groupName}</div>
            <div className="text-[14px] text-ink-3 mt-1">
              {isAdmin ? '管理員' : '訪客模式'}
            </div>
          </div>
          <nav className="px-3 space-y-1">
            <NavItem icon="🌿" label="首頁" active={current === 'dashboard'} onClick={() => onNav('dashboard')} />
            <NavItem icon="📖" label="紀錄" active={current === 'history'} onClick={() => onNav('history')} />
            <NavItem icon="📅" label="週結算" active={current === 'weeklySettlements'} onClick={() => onNav('weeklySettlements')} />
            {isAdmin ? (
              <>
                <div className="h-px bg-divider my-3 mx-3" />
                <NavItem icon="🀄" label="記錄自摸" active={current === 'addTsumo'} onClick={() => onNav('addTsumo')} />
                <NavItem icon="💰" label="每局結算" active={current === 'addRound'} onClick={() => onNav('addRound')} />
                <NavItem icon="🧳" label="旅遊支出" active={current === 'withdrawals'} onClick={() => onNav('withdrawals')} />
                <NavItem icon="👥" label="玩家" active={current === 'players'} onClick={() => onNav('players')} />
                <NavItem icon="⚙️" label="設定" active={current === 'settings'} onClick={() => onNav('settings')} />
              </>
            ) : (
              <>
                <div className="h-px bg-divider my-3 mx-3" />
                <NavItem icon="🔑" label="管理員登入" active={current === 'login'} onClick={() => onNav('login')} />
              </>
            )}
          </nav>
        </aside>

        <header className="md:hidden sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-divider">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌿</span>
              <span className="font-serif text-[18px] font-bold">{groupName}</span>
            </div>
            <div className="text-[13px] text-ink-3">
              {isAdmin ? '管理員' : '訪客'}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <div className="max-w-2xl mx-auto p-4 md:p-8 pb-tab">{children}</div>
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-divider pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 max-w-2xl mx-auto">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              className={`press flex flex-col items-center justify-center py-2 min-h-[64px] ${
                current === item.key ? 'text-sage-deep' : 'text-ink-3'
              }`}
            >
              <span className="text-2xl leading-none">{item.icon}</span>
              <span className="text-[13px] font-medium mt-1">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <Toast toast={toast} />
    </div>
  );
}

interface NavItemProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
        active ? 'bg-sage/10 text-sage-deep font-medium' : 'text-ink-2 hover:bg-hint'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[16px]">{label}</span>
    </button>
  );
}
