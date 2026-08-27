"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { useFormStatus } from "react-dom"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  onClick,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"
  const { pending } = useFormStatus()
  const isSubmit = !asChild && (props.type ?? "submit") === "submit"
  const [running, setRunning] = React.useState(false)
  const clickLock = React.useRef(false)
  const fallbackTimer = React.useRef<number | null>(null)

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (clickLock.current) {
        event.preventDefault()
        return
      }

      if (isSubmit) {
        if (event.currentTarget.form && !event.currentTarget.form.checkValidity()) {
          onClick?.(event)
          return
        }
        // Close the small gap before React publishes useFormStatus().pending.
        clickLock.current = true
        fallbackTimer.current = window.setTimeout(() => {
          clickLock.current = false
        }, 30_000)
      }

      const result = (onClick as
        | ((event: React.MouseEvent<HTMLButtonElement>) => unknown)
        | undefined)?.(event)
      if (!isSubmit && result && typeof (result as Promise<unknown>).finally === "function") {
        clickLock.current = true
        setRunning(true)
        void (result as Promise<unknown>).finally(() => {
          clickLock.current = false
          setRunning(false)
        })
      } else if (!isSubmit && onClick && !event.defaultPrevented) {
        // useTransition callbacks return void. A short lock closes the render gap
        // before their external `pending` prop becomes true.
        clickLock.current = true
        setRunning(true)
        window.setTimeout(() => {
          clickLock.current = false
          setRunning(false)
        }, 500)
      }
    },
    [isSubmit, onClick],
  )

  React.useEffect(() => {
    if (!pending && isSubmit) {
      if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current)
      fallbackTimer.current = null
      clickLock.current = false
    }
  }, [isSubmit, pending])

  return (
    <Comp
      {...props}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      aria-busy={running || (isSubmit && pending) ? true : undefined}
      disabled={!asChild ? (disabled || running || (isSubmit && pending)) : undefined}
      onClick={!asChild ? handleClick : onClick}
    />
  )
}

export { Button, buttonVariants }
