'use client'

import type React from 'react'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Column {
  key: string
  header: string
  className?: string
  render?: (value: any, row: any) => React.ReactNode
}

interface ResponsiveTableProps {
  data: any[]
  columns: Column[]
  className?: string
  rowClassName?: string
  emptyMessage?: string
  maxMobileColumns?: number
}

export function ResponsiveTable({
  data,
  columns,
  className,
  rowClassName,
  emptyMessage = 'No data available',
  maxMobileColumns = 3,
}: ResponsiveTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})

  const toggleRow = (index: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [index]: !prev[index],
    }))
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={cn('w-full overflow-hidden', className)}>

      <div className="hidden md:block overflow-x-auto -webkit-overflow-scrolling-touch">
        <table className="w-full border-collapse border border-border/50 rounded-lg overflow-hidden">
          <thead className="bg-muted/50">
            <tr>
              {columns.map(column => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/70 whitespace-nowrap',
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  'border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors',
                  rowClassName
                )}
              >
                {columns.map(column => (
                  <td
                    key={`${rowIndex}-${column.key}`}
                    className={cn('px-4 py-3 text-sm align-top', column.className)}
                  >
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      <div className="md:hidden space-y-3">
        {data.map((row, rowIndex) => {
          const isExpanded = expandedRows[rowIndex] || false
          const visibleColumns = isExpanded ? columns : columns.slice(0, maxMobileColumns)

          return (
            <div
              key={rowIndex}
              className={cn(
                'border border-border rounded-lg overflow-hidden bg-card',
                rowClassName
              )}
            >
              <div className="space-y-2 p-3">
                {visibleColumns.map(column => (
                  <div key={column.key} className="flex flex-col">
                    <span className="text-xs font-medium text-muted-foreground">
                      {column.header}
                    </span>
                    <div className="text-sm">
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </div>
                  </div>
                ))}
              </div>

              {columns.length > maxMobileColumns && (
                <div className="border-t border-border p-2 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRow(rowIndex)}
                    className="text-xs h-7 px-2"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3 mr-1" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Show More
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
