import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { asBool, calcContributions, fmtMoney } from '../lib/utils';
import type { Id, Player } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';

interface EditingPlayer {
  id: Id;
  name: string;
}

export default function Players() {
  const { data, actions } = useStore();
  const { players, tsumos, settlements, settings } = data;
  const symbol = settings.currency_symbol || '$';

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EditingPlayer | null>(null);
  const [confirmDel, setConfirmDel] = useState<Player | null>(null);

  const contrib = calcContributions(players, tsumos, settlements);

  const sorted = [...players].sort((a, b) => {
    const aActive = asBool(a.active);
    const bActive = asBool(b.active);
    if (aActive !== bActive) return aActive ? -1 : 1;
    const ac = contrib[a.id]?.total ?? 0;
    const bc = contrib[b.id]?.total ?? 0;
    return bc - ac;
  });

  const addNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await actions.addPlayer(name);
      setNewName('');
      setAddOpen(false);
    } catch {
      // toast handled
    }
    setBusy(false);
  };

  const toggleActive = async (player: Player) => {
    const nextActive = !asBool(player.active);
    try {
      await actions.updatePlayer({ id: player.id, active: nextActive });
    } catch {
      // toast handled
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      await actions.updatePlayer({ id: editing.id, name });
      setEditing(null);
    } catch {
      // toast handled
    }
    setBusy(false);
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await actions.deletePlayer(confirmDel.id);
    } catch {
      // toast handled
    }
    setConfirmDel(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-baseline justify-between mb-5">
          <h1 className="font-serif text-[24px] font-bold">玩家管理</h1>
          <span className="text-[16px] text-ink-3">{players.length} 人</span>
        </div>

        <Button icon="＋" onClick={() => setAddOpen(true)}>
          新增玩家
        </Button>
      </Card>

      <Card>
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <div className="text-5xl mb-3">👥</div>
            <div className="text-[18px]">還沒有玩家，點上方按鈕新增</div>
          </div>
        ) : (
          <div className="divide-y divide-divider">
            {sorted.map((p) => {
              const c = contrib[p.id] ?? { tsumo: 0, settle: 0, total: 0, tsumoCount: 0 };
              const active = asBool(p.active);
              return (
                <div
                  key={p.id}
                  className={`py-4 flex items-center gap-3 ${!active ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[20px] font-medium truncate">{p.name}</span>
                      {!active && (
                        <span className="text-[13px] px-2 py-0.5 rounded-full bg-hint text-ink-3">
                          停用
                        </span>
                      )}
                    </div>
                    <div className="text-[15px] text-ink-3 mt-1">
                      累計貢獻 <span className="num text-ink-2">{fmtMoney(c.total, symbol)}</span>
                      {c.tsumoCount > 0 && ` · 自摸 ${c.tsumoCount} 次`}
                    </div>
                  </div>

                  <button
                    onClick={() => setEditing({ id: p.id, name: p.name })}
                    className="w-11 h-11 rounded-full hover:bg-hint flex items-center justify-center text-ink-3"
                    aria-label="編輯"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => void toggleActive(p)}
                    className="px-3 min-h-[40px] rounded-xl border-2 border-divider text-[14px] font-medium hover:bg-hint"
                  >
                    {active ? '停用' : '啟用'}
                  </button>
                  {c.total === 0 && (
                    <button
                      onClick={() => setConfirmDel(p)}
                      className="w-11 h-11 rounded-full hover:bg-red-50 flex items-center justify-center text-ink-3 text-xl"
                      aria-label="刪除"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="text-[14px] text-ink-3 mt-4 leading-relaxed">
          說明：停用的玩家不會出現在新增自摸/結算的選單，但歷史記錄仍保留。
          有貢獻記錄的玩家無法直接刪除，避免破壞歷史資料。
        </div>
      </Card>

      <Modal open={addOpen} title="新增玩家" onClose={() => setAddOpen(false)} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-[18px] font-medium mb-2">名字</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addNew();
              }}
              autoFocus
              placeholder="請輸入玩家名字"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setAddOpen(false)}
              disabled={busy}
            >
              取消
            </Button>
            <Button size="md" onClick={addNew} disabled={busy || !newName.trim()}>
              {busy ? '儲存中…' : '新增'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} title="編輯玩家" onClose={() => setEditing(null)} size="sm">
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="block text-[18px] font-medium mb-2">名字</label>
              <input
                type="text"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveEdit();
                }}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                取消
              </Button>
              <Button size="md" onClick={saveEdit} disabled={busy || !editing.name.trim()}>
                {busy ? '儲存中…' : '儲存'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        title="確認刪除"
        message={`確定要刪除玩家「${confirmDel?.name ?? ''}」嗎？此動作無法復原。`}
        confirmText="刪除"
        onConfirm={doDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
