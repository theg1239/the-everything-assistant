import Lanyard from '@/components/Lanyard'
import React from 'react'

export default function TestPage() {
  return (
    <main>
      <Lanyard position={[0, 0, 20]} gravity={[0, -40, 0]} />
    </main>
  )
}