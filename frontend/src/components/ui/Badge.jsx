import { cn } from '@/lib/utils'

export default function Badge({ children, className, variant = 'default', size = 'md' }) {
  const variants = {
    default: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    sky: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  }
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border font-medium', variants[variant], sizes[size], className)}>
      {children}
    </span>
  )
}
