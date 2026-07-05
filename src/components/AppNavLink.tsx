'use client'

import type { ComponentProps } from 'react'

type Props = ComponentProps<'a'> & { href: string }

/** Full page navigation - reliable for static HTML + heavy client pages in dev. */
export default function AppNavLink({ href, children, className, onClick, ...rest }: Props) {
  return (
    <a href={href} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  )
}
