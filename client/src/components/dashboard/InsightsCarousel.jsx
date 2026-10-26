import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryLabel, formatDate, formatINR } from '../../lib/format.js';
import { monthLabel } from '../charts.jsx';
import { CategoryIcon, Icon } from '../icons.jsx';

const days = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

/** Turn the overview + balances into a handful of cards worth reading. Only cards backed by real data. */
export function buildInsights(o, groups) {
  const cards = [];
  if (!groups.length) {
    return [
      {
        id: 'start',
        tone: 'mint',
        kicker: 'Step 1',
        title: 'Make a group',
        body: 'One per flat, trip or dinner club.',
        icon: 'users',
      },
      {
        id: 'invite',
        tone: 'lemon',
        kicker: 'Step 2',
        title: 'Invite your people',
        body: 'Share the invite link on WhatsApp.',
        icon: 'link',
      },
      {
        id: 'add',
        tone: 'pink',
        kicker: 'Step 3',
        title: 'Add what you paid',
        body: 'Split it equally, by amounts, percentages or shares.',
        icon: 'receipt',
      },
      {
        id: 'settle',
        tone: 'sky',
        kicker: 'Step 4',
        title: 'Settle in fewest payments',
        body: 'Pay by UPI or online, balances update themselves.',
        icon: 'wallet',
      },
    ];
  }

  const now = o.thisMonth.myShare;
  const prev = o.lastMonth.myShare;
  let compare = `Your share of everything in ${monthLabel(o.thisMonth.month, true)}.`;
  if (prev > 0 && now > 0) {
    const pct = Math.round(((now - prev) / prev) * 100);
    compare =
      pct === 0
        ? `Same as ${monthLabel(o.lastMonth.month, true)}.`
        : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${monthLabel(o.lastMonth.month, true)}.`;
  }
  cards.push({
    id: 'month',
    tone: 'mint',
    kicker: 'This month',
    title: formatINR(now),
    body: now
      ? `${compare} ${o.thisMonth.count} expense${o.thisMonth.count === 1 ? '' : 's'}.`
      : 'Nothing spent yet this month.',
    icon: 'receipt',
  });

  const top = o.thisMonth.byCategory[0];
  if (top) {
    cards.push({
      id: 'category',
      tone: 'lemon',
      kicker: 'Top category',
      title: categoryLabel(top.category),
      body: `${formatINR(top.amount)} across ${top.count} expense${top.count === 1 ? '' : 's'}.`,
      category: top.category,
    });
  }

  const big = o.thisMonth.biggest;
  if (big) {
    cards.push({
      id: 'biggest',
      tone: 'pink',
      kicker: 'Biggest expense',
      title: big.description,
      body: `${formatINR(big.amount)} in ${big.group.name}. Your share ${formatINR(big.myShare)}.`,
      icon: 'sparkle',
      to: `/groups/${big.group.id}`,
    });
  }

  const next = o.upcoming[0];
  if (next) {
    const trip = next.kind === 'trip';
    cards.push({
      id: 'next',
      tone: 'sky',
      kicker: trip ? (next.ongoing ? 'On a trip' : 'Next trip') : 'Next bill',
      title: trip ? next.title : `${next.title} ${days(next.inDays)}`,
      body: trip
        ? next.ongoing
          ? `Until ${formatDate(next.endDate, true)}. Keep adding what you spend.`
          : `Starts ${days(next.inDays)}, ${formatDate(next.date, true)}. Plan it in ${next.group.name}.`
        : `${formatINR(next.amount)} every ${next.frequency === 'weekly' ? 'week' : 'month'} in ${next.group.name}.`,
      icon: trip ? 'map' : 'repeat',
      to: `/groups/${next.group.id}?tab=${trip ? 'trip' : 'recurring'}`,
    });
  }

  const owe = groups.filter((g) => g.myBalance < 0);
  const owed = groups.filter((g) => g.myBalance > 0);
  const sum = (list) => list.reduce((a, g) => a + Math.abs(g.myBalance), 0);
  if (owe.length) {
    const worst = [...owe].sort((a, b) => a.myBalance - b.myBalance)[0];
    cards.push({
      id: 'settle',
      tone: 'lilac',
      kicker: 'Settle up',
      title: `You owe ${formatINR(sum(owe))}`,
      body: `Across ${owe.length} group${owe.length === 1 ? '' : 's'}. Most in ${worst.name}.`,
      icon: 'wallet',
      to: `/groups/${worst.id}?tab=balances`,
    });
  } else if (owed.length) {
    const best = [...owed].sort((a, b) => b.myBalance - a.myBalance)[0];
    cards.push({
      id: 'settle',
      tone: 'lilac',
      kicker: 'Coming back to you',
      title: formatINR(sum(owed)),
      body: `Across ${owed.length} group${owed.length === 1 ? '' : 's'}. Most from ${best.name}.`,
      icon: 'wallet',
      to: `/groups/${best.id}?tab=balances`,
    });
  } else {
    cards.push({
      id: 'settle',
      tone: 'lilac',
      kicker: 'Balances',
      title: 'All square',
      body: 'Nobody owes anybody. Enjoy it while it lasts.',
      icon: 'check',
    });
  }

  cards.push({
    id: 'circle',
    tone: 'orange',
    kicker: 'Your circle',
    title: `${o.circle.people} ${o.circle.people === 1 ? 'person' : 'people'}`,
    body: `Sharing money with you across ${o.circle.groups} group${o.circle.groups === 1 ? '' : 's'}.`,
    icon: 'users',
  });
  return cards;
}

function Card({ card }) {
  const inner = (
    <>
      <span className="insight-top">
        <span className="insight-kicker">{card.kicker}</span>
        {card.category ? (
          <CategoryIcon category={card.category} />
        ) : (
          <span className="insight-icon" aria-hidden="true">
            <Icon name={card.icon} size={18} />
          </span>
        )}
      </span>
      <span className="insight-title">{card.title}</span>
      <span className="insight-body">{card.body}</span>
      {card.to && (
        <span className="insight-go" aria-hidden="true">
          Open <Icon name="arrowRight" size={14} />
        </span>
      )}
    </>
  );
  return card.to ? (
    <Link to={card.to} className={`insight insight-${card.tone}`}>
      {inner}
    </Link>
  ) : (
    <div className={`insight insight-${card.tone}`}>{inner}</div>
  );
}

/** Horizontally scrolling insight cards with prev/next buttons and position dots. */
export default function InsightsCarousel({ cards }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      const card = el.firstElementChild;
      const step = card ? card.getBoundingClientRect().width + 16 : 1;
      setIndex(Math.round(el.scrollLeft / step));
      setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [cards.length]);

  const go = (dir) => {
    const el = track.current;
    const card = el?.firstElementChild;
    if (!card) return;
    el.scrollBy({ left: dir * (card.getBoundingClientRect().width + 16), behavior: 'smooth' });
  };
  const goTo = (i) => {
    const el = track.current;
    const card = el?.children[i];
    if (card) el.scrollTo({ left: card.offsetLeft - el.firstElementChild.offsetLeft, behavior: 'smooth' });
  };

  return (
    <section className="insights" aria-roledescription="carousel" aria-label="Insights">
      <div className="section-head">
        <h2>Insights</h2>
        <div className="carousel-nav">
          <button
            type="button"
            className="nb-round"
            onClick={() => go(-1)}
            disabled={edges.start}
            aria-label="Previous"
          >
            <Icon name="back" size={18} />
          </button>
          <button type="button" className="nb-round" onClick={() => go(1)} disabled={edges.end} aria-label="Next">
            <Icon name="arrowRight" size={18} />
          </button>
        </div>
      </div>
      <div className="insight-track" ref={track} tabIndex={0} aria-label="Insight cards, scroll sideways">
        {cards.map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </div>
      <div className="carousel-dots" aria-hidden="true">
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            tabIndex={-1}
            className={i === index ? 'on' : ''}
            onClick={() => goTo(i)}
            aria-label={`Card ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
