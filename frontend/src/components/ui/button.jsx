import { cn } from "@/lib/utils"

function Button({ className, size, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50",
        size === "sm" && "px-3 py-1 text-xs",
        className
      )}
      {...props}
    />
  )
}

export { Button }
