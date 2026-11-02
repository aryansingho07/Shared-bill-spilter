import { type FormEvent, useEffect, useRef, useState } from 'react'
import { type Home, message, money, parseAmount, request } from '../lib/api'
import { Icon } from './Icon'

export function EntryDialog({
  kind,
  homeId,
  memberCount,
  onClose,
  onSaved,
}: {
  kind: 'home' | 'member' | 'bill'
  homeId?: string
  memberCount: number
  onClose: () => void
  onSaved: (home?: Home) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitLock = useRef(false)
  const cents = parseAmount(amount)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current) return
    setError('')
    if (!name.trim()) {
      setError('Please enter a name.')
      return
    }
    if (kind === 'bill' && cents === null) {
      setError('Enter a positive amount with up to two decimal places.')
      return
    }
    submitLock.current = true
    setBusy(true)
    try {
      if (kind === 'home')
        onSaved(
          await request<Home>('/homes', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() }),
          }),
        )
      else {
        await request(`/homes/${homeId}/${kind === 'member' ? 'members' : 'bills'}`, {
          method: 'POST',
          body: JSON.stringify(
            kind === 'bill' ? { title: name.trim(), totalCents: cents } : { name: name.trim() },
          ),
        })
        onSaved()
      }
    } catch (cause) {
      setError(message(cause))
    } finally {
      setBusy(false)
      submitLock.current = false
    }
  }
  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onClose()
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="dialog-top">
          <span className="home-icon">
            <Icon
              name={kind === 'home' ? 'home' : kind === 'member' ? 'users' : 'receipt'}
              size={24}
            />
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="dialog-title">
          {kind === 'home'
            ? 'Make yourself at home.'
            : kind === 'member'
              ? 'Good company starts here.'
              : 'One bill. Everyone’s share.'}
        </h2>
        <p className="dialog-description">
          {kind === 'home'
            ? 'Give your shared space a name. You can add housemates next.'
            : kind === 'member'
              ? 'New housemates join future bills. Existing splits stay as they are.'
              : `We’ll split this equally between ${memberCount} ${memberCount === 1 ? 'housemate' : 'housemates'}.`}
        </p>
        <label htmlFor="entry-name">
          {kind === 'home'
            ? 'Home name'
            : kind === 'member'
              ? 'Housemate’s name'
              : 'What’s the bill for?'}
        </label>
        <input
          id="entry-name"
          name="name"
          placeholder={
            kind === 'home'
              ? 'e.g. Maple House'
              : kind === 'member'
                ? 'e.g. Asha'
                : 'e.g. Weekly groceries'
          }
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          disabled={busy}
          autoComplete="off"
        />
        {kind === 'bill' && (
          <>
            <label htmlFor="entry-amount">
              Total amount <span>USD</span>
            </label>
            <div className="amount-input">
              <span>$</span>
              <input
                id="entry-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                disabled={busy}
                maxLength={20}
              />
            </div>
            <div className="split-preview">
              <Icon name="users" size={18} />
              <span>
                {cents !== null && memberCount > 0
                  ? `About ${money(Math.floor(cents / memberCount))} each. Every cent accounted for.`
                  : 'Enter an amount to see everyone’s share.'}
              </span>
            </div>
          </>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="button primary dialog-submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner small" />
              Saving…
            </>
          ) : (
            <>
              {kind === 'home'
                ? 'Create home'
                : kind === 'member'
                  ? 'Add housemate'
                  : 'Add & split bill'}
              <Icon name="arrow" size={17} />
            </>
          )}
        </button>
      </form>
    </dialog>
  )
}
