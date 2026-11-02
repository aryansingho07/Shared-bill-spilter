import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { EntryDialog } from '../components/EntryDialog'
import { Icon } from '../components/Icon'
import {
  type Balance,
  type Bill,
  type Home,
  type Member,
  message,
  money,
  paymentKey,
  request,
  type Share,
} from '../lib/api'
import '../styles.css'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { home?: string } => ({
    home: typeof search.home === 'string' ? search.home : undefined,
  }),
  component: Dashboard,
})

type HomeData = { home: Home; members: Member[]; bills: Bill[]; balances: Balance[] }
type Modal = 'home' | 'member' | 'bill' | null
type Filter = 'all' | 'unpaid' | 'paid'

function Dashboard() {
  const { home: homeId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [homes, setHomes] = useState<Home[]>([])
  const [homesLoading, setHomesLoading] = useState(true)
  const [homesError, setHomesError] = useState('')
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [homesRevision, setHomesRevision] = useState(0)
  const [modal, setModal] = useState<Modal>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const locks = useRef(new Set<string>())
  const keys = useRef(new Map<string, string>())

  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision explicitly triggers a retry of this request.
  useEffect(() => {
    const controller = new AbortController()
    setHomesLoading(true)
    setHomesError('')
    request<{ homes: Home[] }>('/homes', { signal: controller.signal })
      .then((result) => setHomes(result.homes))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setHomesError(message(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setHomesLoading(false)
      })
    return () => controller.abort()
  }, [homesRevision])

  useEffect(() => {
    if (!homeId && homes[0]) void navigate({ search: { home: homes[0].id }, replace: true })
  }, [homeId, homes, navigate])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision explicitly refreshes this home's data after a mutation or retry.
  useEffect(() => {
    if (!homeId) {
      setData(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setData(null)
    setPaymentErrors({})
    Promise.all([
      request<Home & { members: Member[] }>(`/homes/${homeId}`, { signal: controller.signal }),
      request<{ bills: Bill[] }>(`/homes/${homeId}/bills`, { signal: controller.signal }),
      request<{ balances: Balance[] }>(`/homes/${homeId}/balances`, { signal: controller.signal }),
    ])
      .then(([home, bills, balances]) => {
        if (!controller.signal.aborted)
          setData({ home, members: home.members, bills: bills.bills, balances: balances.balances })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(message(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [homeId, revision])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  async function pay(bill: Bill, share: Share) {
    if (locks.current.has(share.id)) return
    locks.current.add(share.id)
    setPending((previous) => ({ ...previous, [share.id]: true }))
    setPaymentErrors((previous) => ({ ...previous, [share.id]: '' }))
    const key = keys.current.get(share.id) ?? paymentKey(share.id)
    keys.current.set(share.id, key)
    try {
      const paid = await request<Share>(`/bills/${bill.id}/shares/${share.id}/pay`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
      })
      setData((previous) => {
        if (!previous || previous.home.id !== bill.homeId) return previous
        const wasUnpaid =
          previous.bills
            .find((item) => item.id === bill.id)
            ?.shares.find((item) => item.id === share.id)?.paidAt === null
        return {
          ...previous,
          bills: previous.bills.map((item) =>
            item.id === bill.id
              ? {
                  ...item,
                  shares: item.shares.map((itemShare) =>
                    itemShare.id === paid.id ? paid : itemShare,
                  ),
                }
              : item,
          ),
          balances: previous.balances.map((balance) =>
            wasUnpaid && balance.memberId === paid.memberId
              ? { ...balance, outstandingCents: balance.outstandingCents - paid.amountCents }
              : balance,
          ),
        }
      })
      setNotice('Share marked as paid. All squared up!')
    } catch (cause) {
      setPaymentErrors((previous) => ({ ...previous, [share.id]: message(cause) }))
    } finally {
      locks.current.delete(share.id)
      setPending((previous) => ({ ...previous, [share.id]: false }))
    }
  }

  const bills = data?.bills ?? []
  const total = bills.reduce((sum, bill) => sum + bill.totalCents, 0)
  const outstanding =
    data?.balances.reduce((sum, balance) => sum + balance.outstandingCents, 0) ?? 0
  const unpaidCount = bills.filter((bill) =>
    bill.shares.some((share) => share.paidAt === null),
  ).length
  const visibleBills = bills.filter(
    (bill) =>
      filter === 'all' ||
      (filter === 'unpaid'
        ? bill.shares.some((share) => share.paidAt === null)
        : bill.shares.every((share) => share.paidAt !== null)),
  )
  const selectedHome = homes.find((home) => home.id === homeId)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            s<span>↗</span>
          </span>
          split<span className="brand-dot">.</span>
        </a>
        <div className="sidebar-body">
          <p className="eyebrow">YOUR SPACE</p>
          <div className="home-switch">
            <span className="home-icon">
              <Icon name="home" />
            </span>
            <div>
              <strong>{selectedHome?.name ?? 'Your shared home'}</strong>
              <span>A little less complicated.</span>
            </div>
          </div>
          <div className="nav-active">
            <Icon name="grid" />
            <span>Overview</span>
            <span className="nav-indicator" />
          </div>
          <div className="sidebar-homes">
            <p className="eyebrow">YOUR HOMES</p>
            {homes.map((home) => (
              <button
                type="button"
                key={home.id}
                className={`home-link ${home.id === homeId ? 'selected' : ''}`}
                onClick={() => {
                  setFilter('all')
                  void navigate({ search: { home: home.id } })
                }}
              >
                <Icon name="home" size={16} />
                <span>{home.name}</span>
                {home.id === homeId && <span className="small-dot" />}
              </button>
            ))}
            <button type="button" className="home-link add-home" onClick={() => setModal('home')}>
              <Icon name="plus" size={16} />
              Create a home
            </button>
          </div>
        </div>
        <div className="sidebar-note">
          <Icon name="leaf" size={25} />
          <strong>
            Good homes.
            <br />
            Better together.
          </strong>
          <p>
            Keep the bills simple.
            <br />
            Make room for the good stuff.
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="small-dot" /> A fair share for everyone
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Your home</span>
            <Icon name="chevron" size={13} />
            <strong>Overview</strong>
          </div>
          <span className="topbar-label">
            <span className="small-dot" /> Shared living, simplified
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE CLARITY FOR YOUR HOME</p>
              <h1>{data ? `${data.home.name}, at a glance.` : 'Shared bills. Clear heads.'}</h1>
              <p>Split fairly, settle easily, and get back to living.</p>
            </div>
            {data && (
              <button
                type="button"
                className="button primary"
                disabled={loading || data.members.length === 0}
                onClick={() => setModal('bill')}
              >
                <Icon name="plus" size={18} />
                Add a bill
              </button>
            )}
          </div>
          {homesError && (
            <div className="alert" role="alert">
              <span>{homesError}</span>
              <button type="button" onClick={() => setHomesRevision((value) => value + 1)}>
                Try again
              </button>
            </div>
          )}
          {error && (
            <div className="state-card error-state" role="alert">
              <Icon name="refresh" size={32} />
              <h2>Let’s try that again.</h2>
              <p>{error}</p>
              <button
                type="button"
                className="button primary"
                onClick={() => setRevision((value) => value + 1)}
              >
                Reload home
              </button>
            </div>
          )}
          {(homesLoading || loading) && (
            <div className="loading-state" role="status">
              <span className="spinner" />
              <span>Getting your home in order…</span>
              <div className="skeleton-grid">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {!homesLoading && !homesError && !homeId && homes.length === 0 && (
            <div className="welcome-grid">
              <section className="welcome-card">
                <div className="welcome-icon">
                  <Icon name="home" size={38} />
                </div>
                <span className="pill">A fresh start</span>
                <h2>
                  A shared home.
                  <br />
                  One less thing to worry about.
                </h2>
                <p>
                  From the weekly groceries to the electricity bill, keep everyone’s share in one
                  happy place.
                </p>
                <button type="button" className="button primary" onClick={() => setModal('home')}>
                  Create your home
                  <Icon name="arrow" size={18} />
                </button>
                <span className="welcome-footnote">No spreadsheets. No awkward reminders.</span>
              </section>
              <section className="steps-card">
                <p className="eyebrow">SIMPLE FROM THE START</p>
                <h3>
                  Three little steps.
                  <br />
                  Everyone’s on the same page.
                </h3>
                {[
                  {
                    title: 'Make yourself at home',
                    text: 'Give your home a name and add your housemates.',
                  },
                  {
                    title: 'Let every cent find its place',
                    text: 'Add a bill. We split it equally, down to the last cent.',
                  },
                  {
                    title: 'Pay your share. Carry on.',
                    text: 'Mark each share as paid and see what’s left.',
                  },
                ].map((step, index) => (
                  <div className="step" key={step.title}>
                    <span>0{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.text}</p>
                    </div>
                  </div>
                ))}
                <div className="little-note">
                  <Icon name="leaf" />
                  <span>A little fairness goes a long way.</span>
                </div>
              </section>
            </div>
          )}
          {data && !loading && !error && (
            <>
              <section className="stats-grid" aria-label="Home totals">
                <div className="stat">
                  <div>
                    <span>Total shared</span>
                    <Icon name="receipt" size={19} />
                  </div>
                  <strong>{money(total)}</strong>
                  <p>
                    Across {bills.length} {bills.length === 1 ? 'bill' : 'bills'} in your home
                  </p>
                </div>
                <div className="stat">
                  <div>
                    <span>All settled</span>
                    <span className="stat-check">
                      <Icon name="check" size={17} />
                    </span>
                  </div>
                  <strong>{money(total - outstanding)}</strong>
                  <p>A little more peace of mind</p>
                </div>
                <div className="stat outstanding-stat">
                  <div>
                    <span>Still to settle</span>
                    <Icon name="arrow" size={19} />
                  </div>
                  <strong>{money(outstanding)}</strong>
                  <p>
                    {unpaidCount
                      ? `${unpaidCount} ${unpaidCount === 1 ? 'bill needs' : 'bills need'} a little attention`
                      : 'You’re all caught up. Nice.'}
                  </p>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="bills-section">
                  <div className="section-title">
                    <div>
                      <h2>
                        The household bills <span className="count">{bills.length}</span>
                      </h2>
                      <p>A shared expense, a fair split.</p>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Refresh bills and balances"
                      disabled={Object.values(pending).some(Boolean)}
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      <Icon name="refresh" size={18} />
                    </button>
                  </div>
                  <fieldset className="filter-bar" aria-label="Filter bills">
                    {(['all', 'unpaid', 'paid'] as const).map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={filter === item ? 'filter active' : 'filter'}
                        aria-pressed={filter === item}
                        onClick={() => setFilter(item)}
                      >
                        {item === 'all' ? 'All bills' : item === 'unpaid' ? 'To settle' : 'Settled'}
                        <span>
                          {item === 'all'
                            ? bills.length
                            : item === 'unpaid'
                              ? unpaidCount
                              : bills.length - unpaidCount}
                        </span>
                      </button>
                    ))}
                  </fieldset>
                  {visibleBills.length === 0 ? (
                    <div className="empty-bills">
                      <span className="empty-icon">
                        <Icon name="receipt" size={30} />
                      </span>
                      <h3>
                        {bills.length === 0
                          ? 'A clean slate. A happy home.'
                          : 'Nothing here. That’s a good thing.'}
                      </h3>
                      <p>
                        {data.members.length === 0
                          ? 'Add your housemates first, then start splitting bills.'
                          : bills.length === 0
                            ? 'Add your first shared bill. We’ll take care of the split.'
                            : 'Try another filter to see your household bills.'}
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          data.members.length === 0
                            ? setModal('member')
                            : bills.length === 0
                              ? setModal('bill')
                              : setFilter('all')
                        }
                      >
                        <Icon name="plus" size={16} />
                        {data.members.length === 0
                          ? 'Add a housemate'
                          : bills.length === 0
                            ? 'Add your first bill'
                            : 'See all bills'}
                      </button>
                    </div>
                  ) : (
                    <div className="bill-list">
                      {visibleBills.map((bill) => {
                        const paidCount = bill.shares.filter(
                          (share) => share.paidAt !== null,
                        ).length
                        const settled = paidCount === bill.shares.length
                        return (
                          <article className="bill-card" key={bill.id}>
                            <div className="bill-header">
                              <span className={`bill-icon ${settled ? 'settled-icon' : ''}`}>
                                <Icon name={settled ? 'check' : 'receipt'} size={23} />
                              </span>
                              <div className="bill-name">
                                <h3>{bill.title}</h3>
                                <p>
                                  {new Date(bill.createdAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                  <span>·</span>
                                  {bill.shares.length} shares
                                </p>
                              </div>
                              <div className="bill-total">
                                <strong>{money(bill.totalCents)}</strong>
                                <span className={`status ${settled ? 'status-paid' : ''}`}>
                                  {settled
                                    ? 'All settled'
                                    : `${paidCount} of ${bill.shares.length} paid`}
                                </span>
                              </div>
                            </div>
                            <div className="share-list">
                              {bill.shares.map((share) => {
                                const memberIndex = data.members.findIndex(
                                  (member) => member.id === share.memberId,
                                )
                                const name = data.members[memberIndex]?.name ?? 'Housemate'
                                return (
                                  <div className="share-wrapper" key={share.id}>
                                    <div className="share-row">
                                      <Avatar name={name} index={memberIndex} />
                                      <span className="share-name">{name}</span>
                                      <span className="share-amount">
                                        {money(share.amountCents)}
                                      </span>
                                      {share.paidAt ? (
                                        <span
                                          className="paid-label"
                                          title={`Paid ${new Date(share.paidAt).toLocaleString()}`}
                                        >
                                          <Icon name="check" size={15} />
                                          Paid
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="pay-button"
                                          disabled={pending[share.id]}
                                          onClick={() => void pay(bill, share)}
                                          aria-label={`Mark ${name}'s share of ${bill.title} as paid`}
                                        >
                                          {pending[share.id] ? (
                                            <>
                                              <span className="spinner small" />
                                              Paying…
                                            </>
                                          ) : (
                                            <>
                                              Mark paid
                                              <Icon name="arrow" size={14} />
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                    {paymentErrors[share.id] && (
                                      <p className="payment-error" role="alert">
                                        {paymentErrors[share.id]} Retry or refresh to check its
                                        status.
                                      </p>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <div className="bill-footer">
                              <span className="tiny-dot" />
                              Split equally
                              {bill.totalCents % bill.shares.length !== 0 && (
                                <span> · Extra cents go in joining order</span>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
                <aside className="right-column">
                  <section className="members-card">
                    <div className="section-title">
                      <div>
                        <h2>
                          Under one roof <span className="count">{data.members.length}</span>
                        </h2>
                        <p>Good company. Clear balances.</p>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Add a housemate"
                        onClick={() => setModal('member')}
                      >
                        <Icon name="plus" size={18} />
                      </button>
                    </div>
                    <div className="member-column-label">
                      <span>HOUSEMATE</span>
                      <span>TO SETTLE</span>
                    </div>
                    {data.balances.length === 0 ? (
                      <div className="no-members">
                        <Icon name="users" size={29} />
                        <p>
                          There’s room for everyone.
                          <br />
                          Add your first housemate.
                        </p>
                      </div>
                    ) : (
                      data.balances.map((balance, index) => (
                        <div className="balance-row" key={balance.memberId}>
                          <Avatar name={balance.name} index={index} />
                          <div>
                            <strong>{balance.name}</strong>
                            <span>
                              {balance.outstandingCents === 0
                                ? 'All squared up'
                                : 'A little left to settle'}
                            </span>
                          </div>
                          <strong className={balance.outstandingCents === 0 ? 'zero-balance' : ''}>
                            {money(balance.outstandingCents)}
                          </strong>
                        </div>
                      ))
                    )}
                    <button type="button" className="add-member" onClick={() => setModal('member')}>
                      <Icon name="plus" size={16} />
                      Add a housemate
                    </button>
                  </section>
                  <div className="fairness-card">
                    <span className="fairness-icon">
                      <Icon name="leaf" size={26} />
                    </span>
                    <h3>Every cent. Fairly shared.</h3>
                    <p>
                      Bills split equally between everyone. Any extra cents go to housemates in the
                      order they joined.
                    </p>
                    <span>
                      Little details. Less friction.
                      <Icon name="arrow" size={16} />
                    </span>
                  </div>
                </aside>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>Made for the place you call home.</span>
            <span>
              Split fairly. Live happily.
              <Icon name="leaf" size={14} />
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {notice}
        </div>
      )}
      {modal && (
        <EntryDialog
          kind={modal}
          homeId={homeId}
          memberCount={data?.members.length ?? 0}
          onClose={() => setModal(null)}
          onSaved={(home) => {
            setModal(null)
            if (home) {
              setHomes((previous) => [...previous, home])
              void navigate({ search: { home: home.id } })
              setNotice('Welcome home. Time to invite your housemates.')
            } else {
              setRevision((value) => value + 1)
              setNotice(
                modal === 'member'
                  ? 'A new housemate. A little more company.'
                  : 'Bill added. Every cent is accounted for.',
              )
            }
          }}
        />
      )}
    </div>
  )
}
