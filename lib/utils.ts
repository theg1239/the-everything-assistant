import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { customAlphabet } from 'nanoid'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
)

export function formatDate(date: Date | string | number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function generateChatPath(): string {
  return `/chat/${nanoid()}`
}

export function extractTitleFromContent(content: string): string {
  const cleaned = content.replace(/[#*`]/g, '').trim()
  const firstLine = cleaned.split('\n')[0]
  const truncated = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine
  return truncated || 'New Chat'
}
