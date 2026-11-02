'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calendar,
  Clock,
  Users,
  Trophy,
  MapPin,
  DollarSign,
  ExternalLink,
  Search,
  Filter,
  Star,
  Building2,
  Target,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asText,
  isRecord,
  isUnknownArray,
  textOf,
  toDate,
  type TextValue,
} from './artifact-data'
import { useHydrationSafeField } from '@/lib/hydration-safe'

interface EventSlot {
  id: string
  venue: string
  startDate: string
  endDate: string
  totalSeats: number
  currentRegistrations: number
  seatsLeft: number
  isRegistrable: boolean
}

type NormalizedSlot = EventSlot & { eventId?: string }

interface Event {
  id: string
  name: string
  type: string
  category: string
  description: string
  club: string
  tagline: string
  startDate: string
  endDate: string
  teamSize: string
  price?: number
  scope: string
  image: string
  shortDescription?: string
  judgementCriteria?: string
  rules?: string
  prizes?: string
  /** Raw slot records attached to the event; read via normalizeSlots. */
  slots?: unknown
}

interface SeatsSummary {
  totalSeatsAvailable?: TextValue
  currentRegistrations?: TextValue
  seatsLeft?: TextValue
  registrationStatus?: TextValue
  /** Raw API slot records or normalized EventSlots; read via normalizeSlots / SeatsInfo. */
  slots?: unknown[]
}

interface GravitasEventsData {
  events?: Event[]
  event?: Event
  seats?: SeatsSummary
  eventSlots?: unknown[]
  totalEvents?: TextValue
  message?: string
  filters?: {
    searchQuery?: string
    eventType?: string
    category?: string
  }
}

interface GravitasEventsArtifactProps {
  data: unknown
}

const parseEvent = (value: unknown): Event => {
  const e = asRecord(value)
  return {
    id: textOf(e.id),
    name: textOf(e.name),
    type: textOf(e.type),
    category: textOf(e.category),
    description: textOf(e.description),
    club: textOf(e.club),
    tagline: textOf(e.tagline),
    startDate: textOf(e.startDate),
    endDate: textOf(e.endDate),
    teamSize: textOf(e.teamSize),
    price: asNumber(e.price),
    scope: textOf(e.scope),
    image: textOf(e.image),
    shortDescription: asString(e.shortDescription),
    judgementCriteria: asString(e.judgementCriteria),
    rules: asString(e.rules),
    prizes: asString(e.prizes),
    slots: e.slots,
  }
}

const parseSeats = (value: unknown): SeatsSummary | undefined => {
  if (!isRecord(value)) return undefined
  return {
    totalSeatsAvailable: asText(value.totalSeatsAvailable),
    currentRegistrations: asText(value.currentRegistrations),
    seatsLeft: asText(value.seatsLeft),
    registrationStatus: asText(value.registrationStatus),
    slots: isUnknownArray(value.slots) ? value.slots : undefined,
  }
}

/** Narrows an untyped gravitasEvents tool result into the shape this artifact renders. */
const parseGravitasEventsData = (value: unknown): GravitasEventsData => {
  const record = asRecord(value)
  const filters = isRecord(record.filters) ? record.filters : undefined
  return {
    events: isUnknownArray(record.events) ? record.events.map(parseEvent) : undefined,
    event: isRecord(record.event) ? parseEvent(record.event) : undefined,
    seats: parseSeats(record.seats),
    eventSlots: isUnknownArray(record.eventSlots) ? record.eventSlots : undefined,
    totalEvents: asText(record.totalEvents),
    message: asString(record.message),
    filters: filters && {
      searchQuery: asString(filters.searchQuery),
      eventType: asString(filters.eventType),
      category: asString(filters.category),
    },
  }
}

const formatDate = (dateString: unknown) => {
  try {
    const date = toDate(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(dateString)
  }
}

const formatDateRange = (startDate: unknown, endDate: unknown) => {
  try {
    const start = toDate(startDate)
    const end = toDate(endDate)
    const isSameDay = start.toDateString() === end.toDateString()

    if (isSameDay) {
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    } else {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`
    }
  } catch {
    return `${String(startDate)} - ${String(endDate)}`
  }
}

const EventCard: React.FC<{
  event: Event
  detailed?: boolean
  slots?: NormalizedSlot[]
  onExpandChange?: (expanded: boolean) => void
}> = ({ event, detailed = false, slots = [], onExpandChange }) => {
  const [expanded, setExpanded] = useState(false)

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'premium':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'general':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'hackathon':
        return <Target className="h-4 w-4" />
      case 'workshop':
        return <Building2 className="h-4 w-4" />
      case 'competition':
        return <Trophy className="h-4 w-4" />
      default:
        return <Star className="h-4 w-4" />
    }
  }

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border border-border/50">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold leading-6 text-foreground break-words">
                {event.name}
              </CardTitle>
              {event.tagline && (
                <p className="text-sm text-muted-foreground mt-1 italic break-words">
                  "{event.tagline}"
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Badge variant="outline" className={getCategoryColor(event.category)}>
                {event.category}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              {getTypeIcon(event.type)}
              <span>{event.type}</span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="break-words">{event.club}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="break-words leading-relaxed">
                {formatDateRange(event.startDate, event.endDate)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="break-words">Team Size: {event.teamSize}</span>
            </div>

            {Array.isArray(slots) && slots.length > 0 && (
              <div className="flex items-start gap-2 min-w-0 md:col-span-2">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="break-words leading-relaxed">
                  {Array.from(new Set(slots.map(s => s.venue).filter(Boolean))).join(', ')}
                </span>
              </div>
            )}

            {event.price === 0 ? (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span className="text-green-600 font-medium">Free</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary flex-shrink-0" />
                <span>₹{event.price}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Clock className="sr-only h-4 w-4" />
              <span className="capitalize break-words">{event.scope}</span>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
              {event.shortDescription || event.description}
            </p>
          </div>

          {detailed &&
            (event.description || event.judgementCriteria || event.rules || event.prizes) && (
              <div className="border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = !expanded
                    setExpanded(next)
                    onExpandChange?.(next)
                  }}
                  className="flex items-center gap-2 p-0 h-auto text-primary hover:text-primary/80"
                >
                  <Info className="h-4 w-4" />
                  <span>{expanded ? 'Hide Details' : 'Show Details'}</span>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>

                {expanded && (
                  <div className="mt-3 space-y-4">
                    {event.description && event.description !== event.shortDescription && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Full Description</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                          {event.description}
                        </p>
                      </div>
                    )}

                    {event.judgementCriteria && event.judgementCriteria !== 'NA' && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Judgement Criteria</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                          {event.judgementCriteria}
                        </p>
                      </div>
                    )}

                    {event.rules && event.rules !== 'NA' && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Rules & Regulations</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-line">
                          {event.rules}
                        </p>
                      </div>
                    )}

                    {event.prizes && event.prizes !== 'NA' && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">Prizes</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                          {event.prizes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          {Array.isArray(slots) && slots.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  {slots.some(s => s.isRegistrable) ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-700 dark:text-green-400 font-medium">
                        Registration Open
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-red-700 dark:text-red-400 font-medium">
                        Registration Closed
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium">
                    {slots.reduce((sum, s) => sum + (s.seatsLeft ?? 0), 0).toLocaleString()} seats
                    left
                  </span>
                </div>
              </div>

              {slots.length > 1 && (
                <div className="mt-3 space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">Slots</h4>
                  {slots.map(slot => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between text-xs bg-background rounded p-2 border border-border/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="break-words">{slot.venue}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground whitespace-nowrap">
                          {(slot.seatsLeft ?? 0).toLocaleString()} left
                        </span>
                        {slot.isRegistrable ? (
                          <CheckCircle className="h-3 w-3 text-green-600" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {event.image && (
            <div className="mt-3">
              <img
                src={event.image}
                alt={event.name}
                className="w-full h-32 object-cover rounded-md border border-border/50"
                onError={e => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const SeatsInfo: React.FC<{ seats: SeatsSummary | undefined }> = ({ seats }) => {
  if (!seats) return null

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Registration & Seats
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Registration Status</span>
              <Badge
                variant={seats.registrationStatus === 'Open' ? 'default' : 'secondary'}
                className={seats.registrationStatus === 'Open' ? 'bg-green-500' : ''}
              >
                {seats.registrationStatus}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Total Seats</span>
              <span className="font-semibold">{seats.totalSeatsAvailable}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Seats Left</span>
              <span className="font-semibold text-green-600">{seats.seatsLeft}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium">Current Registrations</span>
            <span className="font-semibold">{seats.currentRegistrations}</span>
          </div>

          {seats.slots && seats.slots.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-3">Event Slots</h4>
              <div className="space-y-2">
                {seats.slots.map(asRecord).map(slot => (
                  <div
                    key={textOf(slot.id)}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 border border-border/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm break-words">{asText(slot.venue)}</div>
                      <div className="text-xs text-muted-foreground break-words">
                        {formatDateRange(slot.startDate, slot.endDate)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                      <div className="text-sm font-medium">{asText(slot.seatsLeft)} seats left</div>
                      <div className="text-xs text-muted-foreground">
                        {asText(slot.currentRegistrations)}/{asText(slot.totalSeats)} registered
                      </div>
                      <Badge
                        variant={slot.isRegistrable ? 'default' : 'secondary'}
                        className={cn('text-xs', slot.isRegistrable ? 'bg-green-500' : '')}
                      >
                        {slot.isRegistrable ? 'Open' : 'Closed'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const GravitasEventsArtifact: React.FC<GravitasEventsArtifactProps> = ({ data: rawData }) => {
  const data = useMemo(() => parseGravitasEventsData(rawData), [rawData])
  const {
    id: searchInputId,
    value: searchQuery,
    setValue: setSearchQuery,
  } = useHydrationSafeField(data.filters?.searchQuery || '')
  const [typeFilter, setTypeFilter] = useState(data.filters?.eventType || 'all')
  const [categoryFilter, setCategoryFilter] = useState(data.filters?.category || 'all')
  const [seatsByEvent, setSeatsByEvent] = useState<Record<string, SeatsSummary>>({})
  const [loadingEventSeats, setLoadingEventSeats] = useState<Record<string, boolean>>({})
  const initialEvents = data.events || (data.event ? [data.event] : [])
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [serverLoading, setServerLoading] = useState(false)
  const [serverExhausted, setServerExhausted] = useState(false)

  const normalizeSlots = (slots: unknown, fallbackEventId?: string): NormalizedSlot[] => {
    if (!isUnknownArray(slots)) return []
    return slots
      .map((raw): NormalizedSlot | null => {
        const s = asRecord(raw)
        const eventId = s.eventId || s.event_id || fallbackEventId
        const start = s.startDate || s.start_date
        const end = s.endDate || s.end_date
        const total = s.totalEntries ?? s.total_entries ?? 0
        const maxSeats = s.totalSeats ?? s.overall_entries ?? total
        const registrable = s.isRegistrable ?? s.is_registrable ?? false
        const venue = s.venue || s.location || ''
        const seatsLeft =
          s.seatsLeft ??
          s.seats_left ??
          s.availableEntries ??
          s.available_entries ??
          s.entries_left ??
          s.remaining ??
          s.remaining_entries ??
          total
        const id = s.id ?? `${eventId ?? 'event'}-${venue}-${start || ''}`
        if (!venue && !start && !end && total === 0) return null
        return {
          id: String(id),
          eventId: eventId ? String(eventId) : undefined,
          venue: String(venue),
          startDate: String(start ?? ''),
          endDate: String(end ?? ''),
          totalSeats: Number(maxSeats),
          currentRegistrations: Math.max(0, Number(maxSeats) - Number(seatsLeft)),
          seatsLeft: Number(seatsLeft),
          isRegistrable: Boolean(registrable),
        }
      })
      .filter((slot): slot is NormalizedSlot => slot !== null)
  }

  const slotsByEventId = useMemo(() => {
    const map = new Map<string, NormalizedSlot[]>()

    if (Array.isArray(data.eventSlots)) {
      const normalized = normalizeSlots(data.eventSlots)
      for (const s of normalized) {
        if (!s.eventId) continue
        const arr = map.get(s.eventId) || []
        arr.push(s)
        map.set(s.eventId, arr)
      }
    }

    if (data.event && data.seats && Array.isArray(data.seats.slots)) {
      const normalized = normalizeSlots(data.seats.slots, data.event.id)
      const arr = map.get(data.event.id) || []
      map.set(data.event.id, [...arr, ...normalized])
    }

    for (const [eventId, seats] of Object.entries(seatsByEvent)) {
      if (seats && Array.isArray(seats.slots)) {
        const normalized = normalizeSlots(seats.slots, eventId)
        const arr = map.get(eventId) || []
        map.set(eventId, [...arr, ...normalized])
      }
    }

    for (const ev of events) {
      if (Array.isArray(ev.slots)) {
        const normalized = normalizeSlots(ev.slots, ev.id)
        const arr = map.get(ev.id) || []
        map.set(ev.id, [...arr, ...normalized])
      }
    }

    for (const [eventId, arr] of map.entries()) {
      const byId = new Map(arr.map(s => [s.id, s]))
      map.set(eventId, Array.from(byId.values()))
    }

    return map
  }, [data, events, seatsByEvent])

  const filteredEvents = useMemo(() => {
    let filtered = events

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(event => {
        const desc = (event.description || event.shortDescription || '').toLowerCase()
        return (
          event.name.toLowerCase().includes(query) ||
          desc.includes(query) ||
          event.club.toLowerCase().includes(query) ||
          event.type.toLowerCase().includes(query)
        )
      })
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(event =>
        event.type.toLowerCase().includes(typeFilter.toLowerCase())
      )
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(
        event => event.category.toLowerCase() === categoryFilter.toLowerCase()
      )
    }

    return filtered
  }, [events, searchQuery, typeFilter, categoryFilter])

  const eventTypes = [...new Set(events.map(e => e.type))]
  const categories = [...new Set(events.map(e => e.category))]

  const DEFAULT_COUNT = 6
  const LOAD_STEP = 6
  const [visibleCount, setVisibleCount] = useState(DEFAULT_COUNT)

  useEffect(() => {
    setVisibleCount(DEFAULT_COUNT)
  }, [searchQuery, typeFilter, categoryFilter])

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, Math.max(0, visibleCount)),
    [filteredEvents, visibleCount]
  )

  const fetchMoreFromServer = async () => {
    try {
      if (serverLoading || serverExhausted) return
      setServerLoading(true)
      const currentCount = events.length
      const nextLimit = currentCount + 50

      const params = new URLSearchParams()
      params.set('limit', String(nextLimit))
      const name = (data.filters?.searchQuery || '').trim()
      if (name.length > 0) params.set('name', name)

      const res = await fetch(`https://gravitas.vit.ac.in/api/events?${params.toString()}`)
      if (!res.ok) {
        setServerExhausted(true)
        return
      }
      const json: unknown = await res.json()
      const apiEvents = asArray(asRecord(asRecord(json).data).events)
      if (apiEvents.length === 0) {
        setServerExhausted(true)
        return
      }

      const mapped: Event[] = apiEvents.map(asRecord).map(ev => ({
        id: String(ev.id ?? ''),
        name: String(ev.name || ''),
        type: String(ev.type || ''),
        category: String(ev.category || ''),
        description: String(ev.description || ''),
        club: String(ev.club || ''),
        tagline: String(ev.tagline || ''),
        startDate: String(ev.start_date || ev.startDate || ''),
        endDate: String(ev.end_date || ev.endDate || ''),
        teamSize: String(ev.team_size ?? ''),
        price: Number(ev.price_per_ticket ?? 0),
        scope: String(ev.scope || ''),
        image: String(ev.image || ''),
        shortDescription: ev.short_description ? String(ev.short_description) : undefined,
      }))

      const byId = new Map<string, Event>(events.map(e => [e.id, e]))
      for (const ev of mapped) byId.set(ev.id, { ...byId.get(ev.id), ...ev })
      const merged = Array.from(byId.values())

      if (merged.length === events.length) {
        setServerExhausted(true)
      } else {
        setEvents(merged)
      }
    } catch (_) {
      setServerExhausted(true)
    } finally {
      setServerLoading(false)
    }
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Events Found</h3>
          <p className="text-muted-foreground">
            {data.message || 'No Gravitas events available at the moment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  useEffect(() => {
    if (events.length === 1) {
      const id = events[0]?.id ?? ''
      const existing = slotsByEventId.get(id) || []
      if (existing.length === 0) {
        void fetchEventSeats(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, slotsByEventId])

  const fetchEventSeats = async (eventId: string) => {
    if (!eventId || loadingEventSeats[eventId] || seatsByEvent[eventId]) return
    setLoadingEventSeats(prev => ({ ...prev, [eventId]: true }))
    try {
      const base = typeof window === 'undefined' ? process.env.NEXT_PUBLIC_BASE_URL || '' : ''
      const url = `${base}/api/events/${eventId}`
      const res = await fetch(url)
      if (res.ok) {
        const json = asRecord(await res.json())
        const seats = parseSeats(asRecord(json.data).seats) ?? parseSeats(json.seats)
        if (seats) {
          setSeatsByEvent(prev => ({ ...prev, [eventId]: seats }))
        }
      } else {
        const alt = await fetch(`https://gravitas.vit.ac.in/api/events/${eventId}`)
        if (alt.ok) {
          const altJson: unknown = await alt.json()
          const normalizedSlots = normalizeSlots(
            asRecord(asRecord(altJson).data).eventSlots,
            eventId
          )
          const eventSlots: EventSlot[] = normalizedSlots.map(({ eventId: _ignored, ...slot }) => ({
            id: slot.id,
            venue: slot.venue,
            startDate: slot.startDate,
            endDate: slot.endDate,
            totalSeats: slot.totalSeats,
            currentRegistrations: slot.currentRegistrations,
            seatsLeft: slot.seatsLeft,
            isRegistrable: slot.isRegistrable,
          }))
          const seats = {
            totalSeatsAvailable: eventSlots.reduce((sum, s) => sum + (s.totalSeats ?? 0), 0),
            currentRegistrations: eventSlots.reduce(
              (sum, s) => sum + (s.currentRegistrations ?? 0),
              0
            ),
            seatsLeft: eventSlots.reduce((sum, s) => sum + (s.seatsLeft ?? 0), 0),
            registrationStatus: eventSlots.some(s => s.isRegistrable) ? 'Open' : 'Closed',
            slots: eventSlots,
          }
          setSeatsByEvent(prev => ({ ...prev, [eventId]: seats }))
        }
      }
    } catch (e) {
    } finally {
      setLoadingEventSeats(prev => ({ ...prev, [eventId]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-left">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Gravitas Events {data.totalEvents ? `(${data.totalEvents})` : ''}
        </h2>
        {data.message && <p className="text-muted-foreground">{data.message}</p>}
      </div>

      {events.length === 1 && <SeatsInfo seats={data.seats || seatsByEvent[events[0]?.id ?? '']} />}

      {events.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id={searchInputId}
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Event Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {eventTypes.map(type => (
                      <SelectItem key={type} value={type.toLowerCase()}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category.toLowerCase()}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(searchQuery || typeFilter !== 'all' || categoryFilter !== 'all') && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredEvents.length} of {events.length} events
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setTypeFilter('all')
                    setCategoryFilter('all')
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {events.length === 1 ? (
        <div className="grid grid-cols-1 gap-4 lg:gap-6">
          {visibleEvents.map(event => {
            const slots = slotsByEventId.get(event.id) || []
            return (
              <EventCard
                key={event.id}
                event={event}
                slots={slots}
                detailed
                onExpandChange={open => {
                  if (open && slots.length === 0) {
                    void fetchEventSeats(event.id)
                  }
                }}
              />
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {visibleEvents.map(event => {
            const slots = slotsByEventId.get(event.id) || []
            return (
              <EventCard
                key={event.id}
                event={event}
                slots={slots}
                onExpandChange={open => {
                  if (open && slots.length === 0) {
                    void fetchEventSeats(event.id)
                  }
                }}
              />
            )
          })}
        </div>
      )}

      {(filteredEvents.length > visibleEvents.length || !serverExhausted) && (
        <div className="flex justify-center gap-3 flex-wrap">
          {filteredEvents.length > visibleEvents.length && (
            <Button variant="outline" onClick={() => setVisibleCount(c => c + LOAD_STEP)}>
              View more ({filteredEvents.length - visibleEvents.length} more)
            </Button>
          )}
          {!serverExhausted && (
            <Button variant="secondary" onClick={fetchMoreFromServer} disabled={serverLoading}>
              {serverLoading ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      )}

      {filteredEvents.length === 0 &&
        (searchQuery || typeFilter !== 'all' || categoryFilter !== 'all') && (
          <Card>
            <CardContent className="p-6 text-center">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Events Match Your Filters</h3>
              <p className="text-muted-foreground">
                Try adjusting your search criteria or clearing the filters.
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  )
}

export default GravitasEventsArtifact
