'use client'

import { memo } from 'react'
import { Sidebar } from '@/components/sidebar'
import { useSidebar } from '@/contexts/sidebar-context'

export const SidebarWrapper = memo(function SidebarWrapper() {
  const { isOpen, toggle } = useSidebar()
  
  return <Sidebar isOpen={isOpen} onToggle={toggle} />
})
