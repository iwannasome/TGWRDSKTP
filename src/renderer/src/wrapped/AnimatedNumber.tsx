import { animate } from 'framer-motion'
import React, { useEffect, useState } from 'react'
import { formatInt } from './format'

type AnimatedNumberProps = {
  value: number
  className?: string
  duration?: number
  delay?: number
  exporting?: boolean
  format?: (value: number) => React.ReactNode
}

export default function AnimatedNumber({
  value,
  className,
  duration = 0.9,
  delay = 0,
  exporting = false,
  format = formatInt
}: AnimatedNumberProps): JSX.Element {
  const finalValue = Number.isFinite(value) ? value : 0
  const [displayValue, setDisplayValue] = useState(exporting ? finalValue : 0)

  useEffect(() => {
    if (exporting) {
      setDisplayValue(finalValue)
      return
    }

    setDisplayValue(0)
    const controls = animate(0, finalValue, {
      delay,
      duration,
      ease: [0.18, 0.86, 0.32, 1],
      onUpdate: (latest) => setDisplayValue(latest)
    })

    return () => controls.stop()
  }, [delay, duration, exporting, finalValue])

  return <span className={className}>{format(displayValue)}</span>
}
