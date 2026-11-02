'use client'

import type React from 'react'

import { isValidElement, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TableRow = Record<string, unknown>

interface Column<Row extends TableRow> {
  key: string
  header: string
  className?: string
  render?: (value: unknown, row: Row) => React.ReactNode
}

interface ResponsiveTableProps<Row extends TableRow> {
  data: Row[]
  columns: Column<Row>[]
  className?: string
  rowClassName?: string
  emptyMessage?: string
  maxMobileColumns?: number
}

/** Renders a raw cell value; values React can't render (plain objects) are shown as JSON. */
function renderCellValue(value: unknown): React.ReactNode {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean' ||
    isValidElement(value)
  ) {
    return value
  }
  if (Array.isArray(value)) return value.map(renderCellValue)
  return JSON.stringify(value)
}

export function ResponsiveTable<Row extends TableRow>({
  data,
  columns,
  className,
  rowClassName,
  emptyMessage = 'No data available',
  maxMobileColumns = 3,
}: ResponsiveTableProps<Row>) {
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
                    {column.render
                      ? column.render(row[column.key], row)
                      : renderCellValue(row[column.key])}
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
                      {column.render
                        ? column.render(row[column.key], row)
                        : renderCellValue(row[column.key])}
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
