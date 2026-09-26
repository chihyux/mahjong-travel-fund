import { useState } from "react";
import { useStore } from "../hooks/useStore";
import type { Id } from "../types";
import ConfirmDialog from "./ui/ConfirmDialog";

export default function LedgerSelect() {
  const { ledgers, ledgerId, ledgerSwitchBlocked, writing, actions } = useStore();
  const [pending, setPending] = useState<Id | null>(null);

  const onChange = (next: Id) => {
    if (next === ledgerId) return;
    // 每局結算或設定頁填到一半，切換會清掉未送出的輸入，先確認
    if (ledgerSwitchBlocked) {
      setPending(next);
      return;
    }
    actions.selectLedger(next);
  };

  return (
    <>
      {/* 寫入還沒回來時不能切換：請求已帶著原帳本送出，切過去會看到錯的帳本與提示 */}
      <select
        aria-label="切換帳本"
        value={ledgerId ?? ""}
        disabled={writing}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] max-w-[11rem] px-3 rounded-xl border-2 border-divider bg-white text-[16px] font-medium text-ink disabled:opacity-50"
      >
        {ledgers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <ConfirmDialog
        open={pending !== null}
        title="切換帳本？"
        message="切換會清除尚未送出的內容，確定嗎？"
        confirmText="切換"
        onConfirm={() => {
          if (pending) actions.selectLedger(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
