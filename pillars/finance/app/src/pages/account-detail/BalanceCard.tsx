import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { centsToDollars, formatBalance, type CurrencyFormat } from '@pops/finance';
import { Badge, balanceTone, Card, CardContent, cn, Sparkline } from '@pops/ui';

import { balanceCaption, provenanceLine, trendLine, trendSpan } from './balance-card-copy';
import { useBalanceHistory } from './useBalanceHistory';

import type { Account } from '../accounts/types';

/**
 * The one place an inconsistency is announced next to the number itself.
 * Destructive regardless of the account's own tone — a liability already reads
 * red when it owes money, so this differs in SHAPE (an icon and a claim), not
 * colour, or it would vanish against the balance it is warning about.
 */
function InconsistencyBadge() {
  return (
    <Badge variant="destructive" className="gap-1 font-normal">
      <TriangleAlert className="h-3 w-3" aria-hidden />
      Disagrees with a checkpoint
    </Badge>
  );
}

function BalanceTrend({
  accountId,
  currency,
  tone,
}: {
  accountId: string;
  currency: CurrencyFormat;
  tone: string;
}) {
  const history = useBalanceHistory(accountId);
  const points = history.data?.data ?? [];
  // One reading is not a trend. Nothing is drawn rather than a flat line or a
  // placeholder, which would be a claim the data does not support.
  if (points.length < 2) return null;

  return (
    <div className="space-y-1">
      <Sparkline
        points={points.map((point) => ({ label: point.month, value: point.balanceCents }))}
        className={tone}
        label={`Balance over ${trendSpan(points.length - 1)}`}
      />
      <p className="text-xs text-muted-foreground">
        {trendLine(points, (cents) => formatBalance(centsToDollars(cents), currency))}
      </p>
    </div>
  );
}

/**
 * The account's balance, signed in its own terms: a card that owes reads
 * `-$2,137.55` in red, because nothing negates a balance before showing it
 * (finance ADR-002).
 *
 * This is the only thing on the account page that knows checkpoints exist, and
 * it shows their RESULT — an as-of date, a disagreement flag — then links out.
 * It never lists or edits them; that is the checkpoints page's job.
 */
export function BalanceCard({ account, currency }: { account: Account; currency: CurrencyFormat }) {
  const { balance } = account;
  const tone = balanceTone(balance.balanceCents, currency.kind);

  return (
    <Card>
      <CardContent className="grid gap-6 pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {balanceCaption(account)}
            </p>
            {balance.inconsistent && <InconsistencyBadge />}
          </div>
          <p className={cn('text-4xl font-semibold tabular-nums', tone)}>
            {formatBalance(centsToDollars(balance.balanceCents), currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {provenanceLine(account, balance)}
            {' · '}
            <Link
              to={`/finance/accounts/${account.id}/checkpoints`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Checkpoints
            </Link>
            {' · '}
            <Link
              to={`/finance/accounts/${account.id}/imports`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Imports
            </Link>
          </p>
        </div>
        <BalanceTrend accountId={account.id} currency={currency} tone={tone} />
      </CardContent>
    </Card>
  );
}
