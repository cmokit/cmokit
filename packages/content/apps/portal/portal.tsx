// The account page (ADR-0041, ADR-0051), in React: the same components render it on the server and
// make it interactive in the browser, from one view the server builds. On a phone it is three tabs,
// Home, Waitlist and Account, each at a path of its own; every change posts a form to the server,
// which answers with the tab the change was made on and a notice. Until a new creator's setup is done,
// Home leads them through it, each step marked done from what the server holds.
import { useEffect, useState, type ReactNode } from 'react';
import type { AccountTab, AccountView } from '../../src/pages.ts';
import type { WaitlistEntry } from '../../src/customer.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { CopyBlock } from '../ui/copy-block.tsx';
import { Input, Label, Textarea } from '../ui/input.tsx';
import { Notice } from '../ui/notice.tsx';
import { cn } from '../ui/cn.ts';

type Customer = NonNullable<AccountView['customer']>;
type Waitlist = NonNullable<Customer['waitlist']>;

/** What a person sees for a brand they never named, such as the first one made when they were activated. */
export const UNNAMED_BRAND = 'Unnamed brand';

const ACCESS: Record<string, string> = { trial: 'Free trial', active: 'Active', lapsed: 'Lapsed: pay to reopen your records' };

const TABS: { tab: AccountTab; path: string; label: string }[] = [
  { tab: 'home', path: '/', label: 'Home' },
  { tab: 'waitlist', path: '/waitlist', label: 'Waitlist' },
  { tab: 'account', path: '/account', label: 'Account' },
];

/** A new creator's setup: two steps here, the rest in Claude Desktop (ADR-0024, ADR-0029), and the page their Reels send people to (ADR-0050). */
export const SETUP = ['Sign in', 'Name your brand', 'Add CMO Kit to Claude Desktop', 'Sign in from Claude', 'Set up your brand', 'Measure your page', 'Plan your first Reel'];

export const CLAUDE_STEPS = [
  'Open Claude Desktop and go to Customize, then Plugins. It needs Claude Pro or higher.',
  'Add CMO Kit\'s marketplace, cmokit/cmokit on GitHub, then add the cmokit-content plugin.',
  'Turn on "Code execution and file creation" in Claude\'s settings.',
  'Ask Claude to set up your brand with CMO Kit. Sign in when it asks, the same way you signed in here.',
];

const brandName = (name: string | null): string => name ?? UNNAMED_BRAND;
const day = (at: string): string => at.slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function Portal({ view, tab }: { view: AccountView; tab: AccountTab }) {
  const [notice, setNotice] = useState(view.notice);
  // The notice came with the address a change sent the person back to; without it, a reload shows none.
  useEffect(() => {
    if (view.notice && location.search) history.replaceState(null, '', location.pathname);
  }, [view.notice]);
  const shownNotice = notice && (
    <Notice tone={notice.tone} onDismiss={() => setNotice(undefined)} className="mb-5">{notice.text}</Notice>
  );
  const c = view.customer;
  if (!c) {
    return <Shell>{shownNotice}{view.join !== undefined ? <NotActivated view={view} /> : <NoCustomer view={view} />}</Shell>;
  }
  const tabs = TABS.filter((t) => t.tab !== 'waitlist' || c.waitlist);
  const shown = tabs.some((t) => t.tab === tab) ? tab : 'home';
  const name = brandName(c.brands.find((b) => b.slug === c.slug)?.name ?? null);
  return (
    <Shell tabs={<TabBar tabs={tabs} shown={shown} />}>
      {shownNotice}
      {shown === 'waitlist' ? <WaitlistTab w={c.waitlist!} /> : shown === 'account' ? <AccountTabView c={c} name={name} view={view} /> : <HomeTab c={c} name={name} email={view.email} />}
    </Shell>
  );
}

function Shell({ children, tabs }: { children: ReactNode; tabs?: ReactNode }) {
  return (
    <div className={cn('min-h-dvh', tabs && 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]')}>
      <header className="flex min-h-16 items-center border-b border-line px-4 pt-[env(safe-area-inset-top)]">
        <span className="inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <svg className="h-[1.375rem] w-[1.375rem] text-accent" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="52 14" strokeLinecap="round" transform="rotate(-50 16 16)" />
          </svg>
          CMO Kit
        </span>
      </header>
      <main className="mx-auto max-w-lg px-4 pt-6 pb-12">{children}</main>
      {tabs}
    </div>
  );
}

function TabBar({ tabs, shown }: { tabs: typeof TABS; shown: AccountTab }) {
  return (
    <nav aria-label="Account" className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-lg auto-cols-fr grid-flow-col px-4">
        {tabs.map((t) => (
          <a key={t.tab} href={t.path} aria-current={t.tab === shown ? 'page' : undefined}
            className={cn('-mt-px flex min-h-14 items-center justify-center border-t-2 text-sm font-semibold no-underline',
              t.tab === shown ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function H1({ children }: { children: ReactNode }) {
  return <h1 className="mb-4 font-display text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">{children}</h1>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="mb-3 font-display text-lg leading-tight font-semibold tracking-tight">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Link({ href, children, external }: { href: string; children: ReactNode; external?: boolean }) {
  return (
    <a href={href} className="text-accent underline decoration-1 underline-offset-[.18em] hover:text-accent-strong"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function Rows({ label, children }: { label?: string; children: ReactNode }) {
  return <ul aria-label={label} className="m-0 list-none border-t border-line p-0">{children}</ul>;
}

function Row({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3">
      <div className="flex min-w-0 flex-[1_1_14rem] flex-col [overflow-wrap:anywhere]">{children}</div>
      {end}
    </li>
  );
}

/** A form that posts to the server, which answers with the tab it was made on. */
function Post({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  return <form method="post" action={action} className={cn('space-y-3', className)}>{children}</form>;
}

function Wide({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return <Button type="submit" variant={primary ? 'primary' : 'outline'} size="md" className="w-full">{children}</Button>;
}

function SignedIn({ view }: { view: AccountView }) {
  const as = view.email ?? (view.handle ? `@${view.handle}` : null);
  return <p>Signed in{as ? <> as <strong className="font-semibold">{as}</strong></> : null}.</p>;
}

function SignOut() {
  return <Post action="/signout"><Wide>Sign out</Wide></Post>;
}

function NotActivated({ view }: { view: AccountView }) {
  return (
    <div className="space-y-4">
      <H1>You're not activated yet</H1>
      <p>CMO Kit is in a closed beta, and you can use it once you're activated from its waitlist.</p>
      {view.join && <p><Link href={view.join}>Join the waitlist</Link></p>}
      <SignedIn view={view} />
      {view.handle && <p>To use CMO Kit with Instagram, comment your waitlist code on one of CMO Kit's Reels from @{view.handle}. Once you're activated, signing in with Instagram lets you in.</p>}
      <p>If you joined with another account, sign out and sign in with that one.</p>
      <SignOut />
    </div>
  );
}

function NoCustomer({ view }: { view: AccountView }) {
  return (
    <div className="space-y-4">
      <H1>Your CMOkit account</H1>
      <SignedIn view={view} />
      <p>This account has no CMOkit subscription yet. Ask Claude to set CMOkit up, and come back here afterwards.</p>
      <SignOut />
    </div>
  );
}

/** Where the brand's setup stands, from what the server holds, and the one step to take next; nothing once it is done. */
function Setup({ c, named, email }: { c: Customer; named: boolean; email: string | null }) {
  const setup = c.setup ?? { claude: true, measured: true, planned: true, home: '' };
  const done = [true, named, setup.claude, setup.claude, c.brand.version > 0, setup.measured, setup.planned];
  const next = done.indexOf(false);
  if (next === -1) return null;
  return (
    <div className="space-y-4">
      <Note>Setup: step {next + 1} of {SETUP.length}</Note>
      <NextStep next={next} home={setup.home} email={email} />
      <Rows label="Setup">
        {SETUP.map((label, i) => (
          <Row key={label} end={done[i] ? <Badge>Done</Badge> : i === next || (i === 3 && next === 2) ? <Badge variant="accent">Next</Badge> : <Badge>Later</Badge>}>
            <span>{i + 1}. {label}</span>
          </Row>
        ))}
      </Rows>
    </div>
  );
}

function StepTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-lg leading-tight font-semibold tracking-tight">{children}</h2>;
}

function NextStep({ next, home, email }: { next: number; home: string; email: string | null }) {
  if (next === 1) {
    return (
      <>
        <StepTitle>Name your brand</StepTitle>
        <p>It's the name you'll see here and in Claude.</p>
        <Post action="/brands/name">
          <input type="hidden" name="from" value="home" />
          <Label htmlFor="brand-first">Brand name</Label>
          <Input id="brand-first" name="name" maxLength={60} required autoComplete="organization" />
          <Wide primary>Save name</Wide>
        </Post>
      </>
    );
  }
  if (next <= 3) {
    const body = `${CLAUDE_STEPS.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nYour CMO Kit account: ${home}`;
    const mail = `mailto:${email ? encodeURIComponent(email) : ''}?subject=${encodeURIComponent('Set up CMO Kit in Claude Desktop')}&body=${encodeURIComponent(body)}`;
    return (
      <>
        <StepTitle>Finish setup on a computer</StepTitle>
        <p>The rest of setup happens in Claude Desktop.</p>
        <ol className="list-decimal space-y-2 pl-5">{CLAUDE_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <p><Link href={mail}>Email these steps to myself</Link></p>
        <Note>This step is marked done once your Claude connects.</Note>
      </>
    );
  }
  if (next === 4) {
    return (
      <>
        <StepTitle>Set up your brand in Claude</StepTitle>
        <p>In Claude Desktop, ask Claude to set up your brand with CMO Kit. It asks about your brand, and saves its context here once you approve it.</p>
      </>
    );
  }
  if (next === 5) {
    return (
      <>
        <StepTitle>Measure your page</StepTitle>
        <p>Put your waitlist form on the page your Reels send people to. CMO Kit then counts that page's visits beside its joins, and each week Claude tells you how it converts and the one change to try next.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>On the Waitlist tab, add your site's address.</li>
          <li>Copy the form shown there, and paste it into that page.</li>
          <li>Open the page once in your browser.</li>
        </ol>
        <p><Link href="/waitlist">Go to the Waitlist tab</Link></p>
        <Note>This step is marked done once a visit to your page is counted.</Note>
      </>
    );
  }
  return (
    <>
      <StepTitle>Plan your first Reel</StepTitle>
      <p>In Claude Desktop, ask Claude to plan this week's content with CMO Kit. It writes your first Reel's brief.</p>
    </>
  );
}

function HomeTab({ c, name, email }: { c: Customer; name: string; email: string | null }) {
  const named = !c.rename || c.brands.find((b) => b.slug === c.slug)?.name != null;
  const { version, at, sections, offers } = c.brand;
  return (
    <div className="space-y-4">
      <H1>{name}</H1>
      <Setup c={c} named={named} email={email} />
      <p>Access: {ACCESS[c.access] ?? c.access}.{c.manage && <> <Link href={c.manage}>Manage your subscription</Link>.</>}</p>
      {c.terms && (
        <Section title="Beta terms">
          <p>{c.terms.accepted
            ? <>You accepted <Link href={c.terms.url} external>the beta terms</Link>, version {c.terms.version}.</>
            : <>You have not accepted <Link href={c.terms.url} external>the beta terms</Link> (version {c.terms.version}) yet. <Link href={c.terms.link ?? ''}>Read and accept them</Link>.</>}</p>
        </Section>
      )}
      <Section title="Connections">
        {c.connections.length
          ? <ul className="list-disc space-y-2 pl-5">{c.connections.map((x) => <li key={`${x.vendor}:${x.name}`}>{x.vendor}: {x.name}</li>)}</ul>
          : <p>Nothing connected yet.</p>}
        {c.missing.length > 0 && (
          <>
            <p>Not connected yet:</p>
            <ul className="list-disc space-y-2 pl-5">{c.missing.map((m) => <li key={m.label}>{m.label}{m.optional ? ' (optional)' : ''}: <Link href={m.link}>connect</Link></li>)}</ul>
          </>
        )}
      </Section>
      <Section title="Brand context">
        {version === 0 ? <p>No brand context yet. Ask Claude to build it with you.</p> : (
          <>
            <p>Version {version}{at ? `, approved ${day(at)}` : ''}.</p>
            {sections.map((s) => (
              <div key={s.title}>
                <h3 className="mb-1 font-semibold">{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
            {offers.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold">Offers</h3>
                <ul className="list-disc space-y-2 pl-5">{offers.map((o) => <li key={o}>{o}</li>)}</ul>
              </div>
            )}
          </>
        )}
        <p>To change your brand context or settings, ask Claude.</p>
      </Section>
    </div>
  );
}

/** Where a person on the waitlist came from, as the tracking tags of the page they joined on. */
function cameFrom(source: Record<string, string>): string {
  const tags = Object.entries(source);
  return tags.length ? `, came from ${tags.map(([name, value]) => `${name}=${value}`).join(' ')}` : '';
}

function Person({ p }: { p: WaitlistEntry }) {
  const status = p.activated
    ? <Badge>Activated {day(p.activated)}</Badge>
    : p.declined ? <Badge>Declined {day(p.declined)}</Badge>
    : (
      <form method="post" action="/waitlist/activate">
        <input type="hidden" name="email" value={p.email} />
        <Button type="submit" variant="primary">Activate</Button>
      </form>
    );
  return (
    <Row end={status}>
      <strong className="font-semibold">{p.email}</strong>
      <span className="text-sm text-muted">
        {p.instagram ? `Instagram @${p.instagram}, commented on ${plural(p.engaged, 'Reel')}, ` : ''}joined {day(p.joined)}, {plural(p.referrals, 'referral')}{cameFrom(p.source)}
      </span>
    </Row>
  );
}

function WaitlistTab({ w }: { w: Waitlist }) {
  return (
    <div className="space-y-4">
      <H1>Waitlist</H1>
      <p>People join from a form on your site. Joining gives no access until you activate them.{w.grantsCmokit ? ' Activating someone here lets them sign in and use CMOkit.' : ''} CMOkit sends no email yet, so tell them yourself.</p>
      {w.people.length ? (
        <>
          <p>{w.people.length} on the waitlist, ranked by referrals plus Reels commented on, then who joined first.</p>
          <Rows label="Waitlist">{w.people.map((p) => <Person key={p.email} p={p} />)}</Rows>
        </>
      ) : <p>Nobody is on the waitlist yet.</p>}
      {w.instagram !== undefined && <Section title="Instagram"><Instagram account={w.instagram} /></Section>}
      <Section title="Your site">
        <Post action="/waitlist/sites">
          <Label htmlFor="waitlist-sites">Your site addresses, one per line</Label>
          <Textarea id="waitlist-sites" name="sites" rows={3} defaultValue={w.sites.join('\n')} />
          <Wide>Save site addresses</Wide>
        </Post>
        {w.sites.length ? (
          <>
            <p>Paste this into the page your Reels send people to, on {w.sites.length === 1 ? 'that site' : 'those sites'}. It counts the page's visits too, so you can see how it converts.</p>
            <CopyBlock text={w.snippet} label="Copy the form" />
          </>
        ) : <p>Add your site's address first, and the form to paste into it shows here.</p>}
      </Section>
    </div>
  );
}

/** The brand's Instagram account: connect it, count comments on its Reels, or disconnect it. */
function Instagram({ account }: { account: Waitlist['instagram'] }) {
  if (!account) {
    return (
      <>
        <p>Connect your brand's Instagram business or creator account. People on your waitlist then comment their code on your Reels, and each Reel they comment on moves them up.</p>
        <Post action="/instagram/connect"><Wide primary>Connect Instagram</Wide></Post>
      </>
    );
  }
  const counted = account.counted
    ? `Last counted ${account.counted.at.slice(0, 16).replace('T', ' ')} UTC: ${plural(account.counted.people, 'person', 'people')} on your waitlist commented on your last ${plural(account.counted.reels, 'Reel')}.`
    : 'Not counted yet.';
  return (
    <>
      <p>{`Connected: @${account.username}. ${counted}`}</p>
      <Post action="/instagram/count"><Wide primary>Count comments on your Reels</Wide></Post>
      <Post action="/instagram/disconnect"><Wide>Disconnect Instagram</Wide></Post>
    </>
  );
}

function AccountTabView({ c, name, view }: { c: Customer; name: string; view: AccountView }) {
  const others = c.brands.filter((b) => b.slug !== c.slug);
  const current = c.brands.find((b) => b.slug === c.slug)?.name ?? '';
  return (
    <div className="space-y-4">
      <H1>Account</H1>
      <SignedIn view={view} />
      <p>Brand: {name}.</p>
      {(c.addBrand || c.rename || others.length > 0) && (
        <Section title="Brands">
          <p>Each brand has its own brand context, connections and content, and after the beta its own subscription.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{name} (shown on this page)</li>
            {others.map((b) => <li key={b.slug}>{brandName(b.name)}</li>)}
          </ul>
          {others.length > 0 && <p><Link href="/signin">Switch brand</Link>: sign in again and choose the brand to show.</p>}
          {c.rename && (
            <Post action="/brands/name">
              <Label htmlFor="brand-rename">Name of the brand shown on this page</Label>
              <Input id="brand-rename" name="name" maxLength={60} required defaultValue={current} />
              <Wide>Rename</Wide>
            </Post>
          )}
          {c.addBrand && (
            <Post action="/brands">
              <Label htmlFor="brand-name">New brand's name</Label>
              <Input id="brand-name" name="name" maxLength={60} required />
              <Wide>Add a brand</Wide>
            </Post>
          )}
        </Section>
      )}
      <Section title="Your data">
        <p><Link href="/export">Download everything CMOkit holds for this brand</Link></p>
        <SignOut />
      </Section>
    </div>
  );
}
