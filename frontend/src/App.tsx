import { useEffect, useState } from "react";
import { StoreProvider, useStore } from "./hooks/useStore";
import { API_URL } from "./config";
import type { ViewKey } from "./types";

import Shell from "./components/Shell";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import Login from "./components/Login";
import AddTsumo from "./components/AddTsumo";
import AddRound from "./components/AddRound";
import WeeklySettlements from "./components/WeeklySettlements";
import Players from "./components/Players";
import Withdrawals from "./components/Withdrawals";
import Settings from "./components/Settings";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";

interface MoreMenuItem {
  key: ViewKey;
  icon: string;
  label: string;
}

interface MoreMenuProps {
  onNav: (next: ViewKey) => void;
  onLogout: () => void;
}

function MoreMenu({ onNav, onLogout }: MoreMenuProps) {
  const items: ReadonlyArray<MoreMenuItem> = [
    { key: "addRound", icon: "💰", label: "每局結算" },
    { key: "weeklySettlements", icon: "📅", label: "週結算" },
    { key: "withdrawals", icon: "🧳", label: "旅遊支出" },
    { key: "players", icon: "👥", label: "玩家管理" },
    { key: "settings", icon: "⚙️", label: "設定" },
  ];

  return (
    <div className="space-y-3">
      <Card padding="p-0">
        <div className="divide-y divide-divider">
          {items.map((i) => (
            <button
              key={i.key}
              onClick={() => onNav(i.key)}
              className="w-full flex items-center gap-4 px-5 py-5 text-left hover:bg-hint"
            >
              <span className="text-2xl">{i.icon}</span>
              <span className="flex-1 text-[18px] font-medium">{i.label}</span>
              <span className="text-ink-3 text-xl">›</span>
            </button>
          ))}
        </div>
      </Card>
      <Button size="md" variant="secondary" onClick={onLogout}>
        登出管理員
      </Button>
    </div>
  );
}

function ConfigWarning() {
  return (
    <div className="min-h-screen bg-bg p-6 flex items-center justify-center">
      <Card className="max-w-lg">
        <div className="text-4xl mb-3">⚙️</div>
        <h1 className="font-serif text-[24px] font-bold mb-3">
          尚未設定後端 API
        </h1>
        <p className="text-[16px] leading-relaxed text-ink-2 mb-4">
          請先完成以下步驟：
        </p>
        <ol className="text-[16px] leading-relaxed text-ink-2 space-y-2 list-decimal list-inside mb-4">
          <li>
            建立 Google Sheet 並貼上{" "}
            <code className="px-1 bg-hint rounded">backend/Code.gs</code>
          </li>
          <li>
            執行 <code className="px-1 bg-hint rounded">initSheets()</code>{" "}
            建立分頁
          </li>
          <li>「部署 → 網頁應用程式 → 所有人」取得 URL</li>
          <li>
            將 URL 填入{" "}
            <code className="px-1 bg-hint rounded">frontend/src/config.ts</code>{" "}
            或用環境變數{" "}
            <code className="px-1 bg-hint rounded">VITE_API_URL</code>
          </li>
        </ol>
      </Card>
    </div>
  );
}

const ADMIN_ONLY_VIEWS: ReadonlyArray<ViewKey> = [
  "addTsumo",
  "addRound",
  "players",
  "withdrawals",
  "settings",
  "more",
];

function AppInner() {
  const { loading, error, isAdmin, actions } = useStore();
  const [view, setView] = useState<ViewKey>("dashboard");

  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_VIEWS.includes(view)) {
      setView("dashboard");
    }
  }, [isAdmin, view]);

  const onNav = (next: ViewKey) => setView(next);

  if (view === "login") {
    return (
      <div className="min-h-screen bg-bg p-6 flex items-center justify-center">
        <div className="w-full">
          <Login onDone={() => setView("dashboard")} />
        </div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <Shell current={view} onNav={onNav}>
        <Card>
          <div className="text-center py-6">
            <div className="text-4xl mb-2">⚠️</div>
            <div className="font-serif text-[20px] font-bold mb-2">
              讀取資料失敗
            </div>
            <div className="text-[16px] text-ink-3 mb-4">{error}</div>
            <Button size="md" onClick={() => void actions.refresh()}>
              重試
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return <Dashboard onNav={onNav} />;
      case "history":
        return <History />;
      case "addTsumo":
        return <AddTsumo onDone={() => setView("dashboard")} />;
      case "addRound":
        return <AddRound onDone={() => setView("dashboard")} />;
      case "weeklySettlements":
        return <WeeklySettlements />;
      case "players":
        return <Players />;
      case "withdrawals":
        return <Withdrawals />;
      case "settings":
        return <Settings />;
      case "more":
        return (
          <MoreMenu
            onNav={onNav}
            onLogout={() => {
              actions.logout();
              setView("dashboard");
            }}
          />
        );
      default: {
        const _exhaustive: never = view;
        void _exhaustive;
        return <Dashboard onNav={onNav} />;
      }
    }
  };

  return (
    <Shell current={view} onNav={onNav}>
      {renderView()}
    </Shell>
  );
}

export default function App() {
  const configured =
    API_URL && !API_URL.includes("PASTE_YOUR_APPS_SCRIPT_URL_HERE");
  if (!configured) return <ConfigWarning />;

  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  );
}
