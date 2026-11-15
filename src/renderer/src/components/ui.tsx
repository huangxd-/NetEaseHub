import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { LoaderCircle, X } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values))
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      className={cn(
        'no-drag inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium outline-none transition-all duration-150 disabled:pointer-events-none disabled:opacity-45',
        {
          'bg-[var(--accent)] text-white shadow-[0_8px_20px_rgba(244,63,94,.2)] hover:bg-[var(--accent-strong)]':
            variant === 'primary',
          'border border-[var(--border)] bg-white/[.055] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-white/[.085]':
            variant === 'secondary',
          'text-[var(--text-muted)] hover:bg-white/[.06] hover:text-[var(--text)]':
            variant === 'ghost',
          'border border-rose-400/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/16':
            variant === 'danger',
          'border border-[var(--border-strong)] bg-transparent text-[var(--text)] hover:bg-white/[.05]':
            variant === 'outline',
          'h-8 px-3 text-xs': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-5 text-[15px]': size === 'lg',
          'h-9 w-9 p-0': size === 'icon'
        },
        className
      )}
      {...props}
    >
      {loading ? <LoaderCircle size={15} className="spinner" /> : children}
    </button>
  )
}

export function IconButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn('shrink-0 rounded-lg text-[var(--text-muted)]', className)}
      {...props}
    />
  )
}

export function Card({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('glass-card', className)}>{children}</div>
}

export function Badge({
  children,
  tone = 'default',
  className
}: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        {
          'border-[var(--border)] bg-white/[.045] text-[var(--text-muted)]': tone === 'default',
          'border-rose-400/20 bg-rose-500/10 text-rose-300': tone === 'accent',
          'border-emerald-400/20 bg-emerald-500/10 text-emerald-300': tone === 'success',
          'border-amber-400/20 bg-amber-500/10 text-amber-300': tone === 'warning',
          'border-red-400/20 bg-red-500/10 text-red-300': tone === 'danger',
          'border-sky-400/20 bg-sky-500/10 text-sky-300': tone === 'info'
        },
        className
      )}
    >
      {children}
    </span>
  )
}

export function Progress({
  value,
  className
}: {
  value: number
  className?: string
}) {
  const safe = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[.08]', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-[width] duration-300"
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <LoaderCircle size={size} className="spinner text-[var(--text-muted)]" />
}

export function SectionTitle({
  title,
  description,
  action
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 760,
  footer
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  width?: number
  footer?: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className="dialog-content"
          style={{ width: `min(${width}px, calc(100vw - 64px))` }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold tracking-[-0.02em]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton aria-label="关闭">
                <X size={17} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="max-h-[calc(86vh-142px)] overflow-auto px-6 py-5">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] bg-black/10 px-6 py-4">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Field({
  label,
  hint,
  children,
  className
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
        {label}
        {hint ? <span className="text-[10px] text-[var(--text-dim)]">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-[var(--border)] bg-black/20 px-3 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-dim)] focus:border-rose-400/40 focus:bg-black/30 focus:ring-2 focus:ring-rose-500/10',
        className
      )}
      {...props}
    />
  )
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-xl border border-[var(--border)] bg-black/20 px-3 py-2.5 text-sm leading-6 text-[var(--text)] outline-none transition placeholder:text-[var(--text-dim)] focus:border-rose-400/40 focus:bg-black/30 focus:ring-2 focus:ring-rose-500/10',
        className
      )}
      {...props}
    />
  )
}

export function NativeSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full appearance-none rounded-xl border border-[var(--border)] bg-[#151519] px-3 text-sm text-[var(--text)] outline-none transition focus:border-rose-400/40 focus:ring-2 focus:ring-rose-500/10',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Toggle({
  checked,
  onCheckedChange,
  disabled
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-5 w-9 shrink-0 rounded-full border border-white/10 bg-white/10 outline-none transition data-[state=checked]:border-rose-400/40 data-[state=checked]:bg-rose-500 disabled:opacity-40"
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[3px] rounded-full bg-white/65 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm">{label}</div>
        {description ? <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{description}</div> : null}
      </div>
      <Toggle checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
      {icon ? (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[var(--border)] bg-white/[.035] text-[var(--text-muted)]">
          {icon}
        </div>
      ) : null}
      <div className="text-sm font-medium">{title}</div>
      {description ? (
        <div className="mt-2 max-w-md text-xs leading-5 text-[var(--text-muted)]">{description}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-white/10 bg-white/[.045] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
      {children}
    </kbd>
  )
}
