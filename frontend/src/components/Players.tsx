import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  asBool,
  calcContributions,
  fmtMoney,
  isNameTaken,
  pullCandidates
} from '../lib/utils';
import type { Id, Player } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';

interface EditingPlayer {
  id: Id;
  name: string;
}

export default function Players() {
  const { data, allPlayers, actions } = useStore();
  const { players, tsumos, rounds, settings } = data;
  const symbol = settings.currency_symbol || '$';

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<EditingPlayer | null>(null);
  const [pullOpen, setPullOpen] = useState(false);
  const [picked, setPicked] = useState<Set<Id>>(() => new Set());

  const contrib = calcContributions(players, tsumos, rounds);
  const candidates = pullCandidates(allPlayers, players);

  const newNameTaken = !!newName.trim() && isNameTaken(allPlayers, newName);
  // 同名的人已在這本帳時拉入清單裡不會有他，不能叫使用者去拉入
  const newNameInLedger = newNameTaken && isNameTaken(players, newName);
  const editNameTaken =
    !!editing && !!editing.name.trim() && isNameTaken(allPlayers, editing.name, editing.id);

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
    if (!name || isNameTaken(allPlayers, name)) return;
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
    try {
      await actions.setMemberActive(player.id, !asBool(player.active));
    } catch {
      // toast handled
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name || isNameTaken(allPlayers, name, editing.id)) return;
    setBusy(true);
    try {
      await actions.updatePlayer({ id: editing.id, name });
      setEditing(null);
    } catch {
      // toast handled
    }
    setBusy(false);
  };

  const openPull = () => {
    setPicked(new Set());
    setPullOpen(true);
  };

  const togglePick = (id: Id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitPull = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      await actions.addMembers([...picked]);
      setPullOpen(false);
    } catch {
      // toast handled
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-baseline justify-between mb-5">
          <h1 className="font-serif text-[24px] font-bold">玩家管理</h1>
          <span className="text-[16px] text-ink-3">{players.length} 人</span>
        </div>

        <div className="space-y-3">
          <Button icon="＋" onClick={() => setAddOpen(true)}>
            新增玩家
          </Button>
          <Button
            icon="👥"
            variant="secondary"
            onClick={openPull}
            disabled={candidates.length === 0}
          >
            從現有玩家拉入
          </Button>
        </div>
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
                </div>
              );
            })}
          </div>
        )}
        <div className="text-[14px] text-ink-3 mt-4 leading-relaxed">
          說明：停用的玩家不會出現在新增自摸/結算的選單，但歷史記錄仍保留。
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
            {newNameTaken && (
              <p className="text-[15px] text-red-700 mt-2">
                {newNameInLedger
                  ? '這本帳已有這位玩家'
                  : '已有這位玩家，請改用「從現有玩家拉入」'}
              </p>
            )}
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
            <Button
              size="md"
              onClick={addNew}
              disabled={busy || !newName.trim() || newNameTaken}
            >
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
              {editNameTaken && (
                <p className="text-[15px] text-red-700 mt-2">已有同名的玩家</p>
              )}
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
              <Button
                size="md"
                onClick={saveEdit}
                disabled={busy || !editing.name.trim() || editNameTaken}
              >
                {busy ? '儲存中…' : '儲存'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={pullOpen} title="從現有玩家拉入" onClose={() => setPullOpen(false)} size="sm">
        <div className="space-y-4">
          <div className="divide-y divide-divider max-h-[50vh] overflow-y-auto">
            {candidates.map((p) => (
              <label key={p.id} className="flex items-center gap-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => togglePick(p.id)}
                  className="w-6 h-6 accent-sage"
                />
                <span className="text-[18px]">{p.name}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setPullOpen(false)}
              disabled={busy}
            >
              取消
            </Button>
            <Button size="md" onClick={submitPull} disabled={busy || picked.size === 0}>
              {busy ? '儲存中…' : `拉入 ${picked.size} 人`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
