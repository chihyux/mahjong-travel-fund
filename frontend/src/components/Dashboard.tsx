import { useStore } from '../hooks/useStore';
import {
  buildLeaderboard,
  calcBalance,
  fmtMoney,
  fmtRelativeDate,
  playerName
} from '../lib/utils';
import type { ViewKey } from '../types';
import Card from './ui/Card';
import RankBadge from './ui/RankBadge';
import Progress from './ui/Progress';
import Button from './ui/Button';
import Skeleton from './ui/Skeleton';
import ContributionPie from './charts/ContributionPie';

interface DashboardProps {
  onNav: (next: ViewKey) => void;
}

export default function Dashboard({ onNav }: DashboardProps) {
  const { data, loading, isAdmin } = useStore();
  const { players, tsumos, settlements, withdrawals, settings } = data;

  const symbol = settings.currency_symbol || '$';
  const goal = Number(settings.goal) || 0;
  const goalName = settings.goal_name || '旅遊目標';

  const { balance, income, out } = calcBalance(tsumos, settlements, withdrawals);
  const { list: leaderboard } = buildLeaderboard(players, tsumos, settlements);
  const topN = leaderboard.slice(0, 10);
  const progress = goal > 0 ? Math.min(100, (balance / goal) * 100) : 0;
  const remaining = Math.max(0, goal - balance);

  const recentTsumos = [...(tsumos ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);
  const recentSettles = [...(settlements ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <Skeleton h={80} className="mb-4" />
          <Skeleton h={40} />
        </Card>
        <Card>
          <Skeleton h={200} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="text-[18px] font-medium text-ink-2 mb-1">🌿 目前基金</div>
        <div className="num text-hero md:text-hero-sm text-ink">{fmtMoney(balance, symbol)}</div>

        {goal > 0 && (
          <div className="mt-5 p-4 rounded-2xl bg-hint border border-divider">
            <div className="flex items-baseline justify-between mb-2 gap-2">
              <span className="text-[18px] font-bold text-sage-deep">🌸 {goalName}</span>
              <span className="num text-[26px] text-honey flex-shrink-0">{Math.floor(progress)}%</span>
            </div>
            <Progress value={balance} max={goal} />
            <div className="text-[18px] text-ink-2 mt-2">
              {remaining > 0 ? (
                <>
                  還差 <span className="num text-ink">{fmtMoney(remaining, symbol)}</span> 就達標
                </>
              ) : (
                <span className="text-sage-deep font-bold">🎉 已達標，可以出發囉！</span>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 rounded-2xl bg-hint grid grid-cols-2 gap-4">
          <div>
            <div className="text-[16px] text-ink-3 mb-1">累計收入</div>
            <div className="num text-[22px]">{fmtMoney(income, symbol)}</div>
          </div>
          <div>
            <div className="text-[16px] text-ink-3 mb-1">已旅遊支出</div>
            <div className="num text-[22px] text-ink-2">{fmtMoney(out, symbol)}</div>
          </div>
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <div className="grid gap-3">
            <Button icon="🀄" onClick={() => onNav('addTsumo')}>
              記錄自摸
            </Button>
            <Button icon="💰" variant="honey" onClick={() => onNav('addSettlement')}>
              週結算
            </Button>
            <Button icon="🧳" variant="secondary" onClick={() => onNav('withdrawals')}>
              記錄旅遊支出
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-divider" />
          <span className="font-serif text-[22px] font-bold">贊助榜</span>
          <div className="flex-1 h-px bg-divider" />
        </div>

        {topN.length === 0 ? (
          <div className="text-center py-8 text-ink-3">
            <div className="text-5xl mb-2">🀄</div>
            <div className="text-[18px]">還沒有記錄，來打第一局吧</div>
          </div>
        ) : (
          <div className="space-y-4">
            {topN.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4">
                <RankBadge rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <div className="text-[22px] font-medium truncate">{p.name}</div>
                  <div className="text-[16px] text-ink-3">
                    自摸 {p.tsumoCount} 次 {fmtMoney(p.tsumo, symbol)} · 結算 {fmtMoney(p.settle, symbol)}
                  </div>
                </div>
                <div className="num text-[24px] text-sage-deep flex-shrink-0">{fmtMoney(p.total, symbol)}</div>
              </div>
            ))}
          </div>
        )}

        {topN.length >= 2 && (
          <div className="mt-6 pt-6 border-t border-divider">
            <div className="text-[18px] font-medium text-ink-2 mb-3">貢獻占比</div>
            <ContributionPie data={topN} />
          </div>
        )}
      </Card>

      {(recentTsumos.length > 0 || recentSettles.length > 0) && (
        <Card>
          <div className="font-serif text-[20px] font-bold mb-3">最近活動</div>
          <div className="space-y-3">
            {recentTsumos.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 border-b border-divider last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🀄</span>
                  <div>
                    <div className="text-[18px] font-medium">
                      {playerName(players, t.player_id)} 自摸 × {String(t.count)}
                    </div>
                    <div className="text-[15px] text-ink-3">{fmtRelativeDate(t.created_at || t.date)}</div>
                  </div>
                </div>
                <div className="num text-[20px] text-sage-deep">+{fmtMoney(t.amount, symbol)}</div>
              </div>
            ))}
            {recentSettles.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2 border-b border-divider last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💰</span>
                  <div>
                    <div className="text-[18px] font-medium">{playerName(players, s.player_id)} 結算</div>
                    <div className="text-[15px] text-ink-3">
                      {fmtRelativeDate(s.created_at || s.date)}
                      {s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                </div>
                <div className="num text-[20px] text-honey">+{fmtMoney(s.cut_amount, symbol)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!isAdmin && (
        <div className="text-center py-4">
          <button
            onClick={() => onNav('login')}
            className="text-[16px] text-ink-3 underline underline-offset-4"
          >
            管理員登入
          </button>
        </div>
      )}
    </div>
  );
}
