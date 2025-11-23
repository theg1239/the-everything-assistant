'use client'

import { memo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { useSidebar } from '@/contexts/sidebar-context'
import { useMFA } from '@/contexts/mfa-context'

export const SidebarWrapper = memo(function SidebarWrapper() {
  const { isOpen, toggle, setIsOpen, pdfOpen } = useSidebar()
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const { requiresMFA, isMFAVerified } = useMFA()

  const shouldHideSidebar =
    pathname === '/login' ||
    status === 'unauthenticated' ||
    (requiresMFA && !isMFAVerified && session?.user)

  useEffect(() => {
    if (shouldHideSidebar && isOpen) {
      setIsOpen(false)
    }
  }, [shouldHideSidebar, isOpen, setIsOpen])

  if (shouldHideSidebar) {
    return null
  }

  const effectiveOpen = isOpen && !pdfOpen

  return <Sidebar isOpen={effectiveOpen} onToggle={() => (!pdfOpen ? toggle() : setIsOpen(false))} />
})
