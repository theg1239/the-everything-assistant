'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventSlot {
  id: string
  venue: string
  startDate: string
  endDate: string
  totalEntries: number
  isRegistrable: boolean
}

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
  price: number
  scope: string
  image: string
  shortDescription?: string
  judgementCriteria?: string
  rules?: string
  prizes?: string
}

interface GravitasEventsData {
  events?: Event[]
  event?: Event
  seats?: {
    totalRegistrations: number
    registrationStatus: string
    slots: EventSlot[]
  }
  totalEvents?: number
  message?: string
  filters?: {
    searchQuery?: string
    eventType?: string
    category?: string
  }
}

interface GravitasEventsArtifactProps {
  data: GravitasEventsData
}

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateString
  }
}

const formatDateRange = (startDate: string, endDate: string) => {
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const isSameDay = start.toDateString() === end.toDateString()
    
    if (isSameDay) {
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    } else {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`
    }
  } catch {
    return `${startDate} - ${endDate}`
  }
}

const EventCard: React.FC<{ event: Event; detailed?: boolean }> = ({ event, detailed = false }) => {
  const [expanded, setExpanded] = useState(false)
  
  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'premium': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'general': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'hackathon': return <Target className="h-4 w-4" />
      case 'workshop': return <Building2 className="h-4 w-4" />
      case 'competition': return <Trophy className="h-4 w-4" />
      default: return <Star className="h-4 w-4" />
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
          {/* Event Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="break-words leading-relaxed">{formatDateRange(event.startDate, event.endDate)}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="break-words">Team Size: {event.teamSize}</span>
            </div>

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
              <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="capitalize break-words">{event.scope}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
              {event.shortDescription || event.description}
            </p>
          </div>

          {/* Expandable detailed content */}
          {detailed && (event.description || event.judgementCriteria || event.rules || event.prizes) && (
            <div className="border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 p-0 h-auto text-primary hover:text-primary/80"
              >
                <Info className="h-4 w-4" />
                <span>{expanded ? 'Hide Details' : 'Show Details'}</span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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

          {/* Event Image */}
          {event.image && (
            <div className="mt-3">
              <img
                src={event.image}
                alt={event.name}
                className="w-full h-32 object-cover rounded-md border border-border/50"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const SeatsInfo: React.FC<{ seats: GravitasEventsData['seats'] }> = ({ seats }) => {
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <span className="text-sm font-medium">Total Registrations</span>
              <span className="font-semibold">{seats.totalRegistrations}</span>
            </div>
          </div>

          {seats.slots && seats.slots.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-3">Event Slots</h4>
              <div className="space-y-2">
                {seats.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 border border-border/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm break-words">{slot.venue}</div>
                      <div className="text-xs text-muted-foreground break-words">
                        {formatDateRange(slot.startDate, slot.endDate)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                      <div className="text-sm font-medium">{slot.totalEntries} registrations</div>
                      <Badge 
                        variant={slot.isRegistrable ? 'default' : 'secondary'}
                        className={cn(
                          "text-xs",
                          slot.isRegistrable ? 'bg-green-500' : ''
                        )}
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

const GravitasEventsArtifact: React.FC<GravitasEventsArtifactProps> = ({ data }) => {
  const [searchQuery, setSearchQuery] = useState(data.filters?.searchQuery || '')
  const [typeFilter, setTypeFilter] = useState(data.filters?.eventType || 'all')
  const [categoryFilter, setCategoryFilter] = useState(data.filters?.category || 'all')

  const events = data.events || (data.event ? [data.event] : [])
  
  const filteredEvents = useMemo(() => {
    let filtered = events

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(event =>
        event.name.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.club.toLowerCase().includes(query) ||
        event.type.toLowerCase().includes(query)
      )
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(event =>
        event.type.toLowerCase().includes(typeFilter.toLowerCase())
      )
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(event =>
        event.category.toLowerCase() === categoryFilter.toLowerCase()
      )
    }

    return filtered
  }, [events, searchQuery, typeFilter, categoryFilter])

  const eventTypes = [...new Set(events.map(e => e.type))]
  const categories = [...new Set(events.map(e => e.category))]

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Gravitas Events {data.totalEvents ? `(${data.totalEvents})` : ''}
        </h2>
        {data.message && (
          <p className="text-muted-foreground">{data.message}</p>
        )}
      </div>

      {/* Single event with seats info */}
      {data.event && data.seats && (
        <SeatsInfo seats={data.seats} />
      )}

      {/* Filters for multiple events */}
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
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* Events Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {filteredEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            detailed={events.length === 1}
          />
        ))}
      </div>

      {filteredEvents.length === 0 && (searchQuery || typeFilter !== 'all' || categoryFilter !== 'all') && (
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