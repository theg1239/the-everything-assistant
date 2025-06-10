"use client"

import React, { useState, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  FileSearch, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Maximize2, 
  X,
  Users,
  Building2,
  GraduationCap,
  TrendingUp,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Globe,
  UtensilsCrossed,
  Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ArtifactDisplayProps {
  title: string
  icon?: React.ReactNode
  data: any
  type: 'papers' | 'faculty' | 'companies' | 'placements' | 'mess-menu' | 'general'
  className?: string
}

const PaperCard = ({ paper }: { paper: any }) => (
  <Card className="hover:shadow-sm transition-all duration-200 border-border bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium line-clamp-2 text-card-foreground">
        {paper.title}
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-0 space-y-3">
      <div className="space-y-2 text-xs text-muted-foreground">
        {paper.authors && (
          <div className="flex items-center gap-2">
            <Users className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{Array.isArray(paper.authors) ? paper.authors.join(", ") : paper.authors}</span>
          </div>
        )}
        {(paper.journal || paper.venue || paper.conference) && (
          <div className="flex items-center gap-2">
            <FileSearch className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{paper.journal || paper.venue || paper.conference}</span>
          </div>
        )}
        {(paper.year || paper.publishedYear) && (
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{paper.year || paper.publishedYear}</span>
          </div>
        )}
      </div>
      
      {(paper.examType || paper.category) && (
        <Badge variant="secondary" className="text-xs">
          {paper.examType || paper.category}
        </Badge>
      )}
      
      <div className="flex gap-2 pt-1">
        {(paper.link || paper.url || paper.pdfUrl || paper.downloadUrl) && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => window.open(paper.link || paper.url || paper.pdfUrl || paper.downloadUrl, '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View Paper
          </Button>
        )}
        {paper.doi && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => window.open(`https://doi.org/${paper.doi}`, '_blank')}
          >
            <Globe className="h-3 w-3 mr-1" />
            DOI
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
)

const FacultyCard = ({ faculty }: { faculty: any }) => (
  <Card className="hover:shadow-sm transition-all duration-200 border-border bg-card">
    <CardHeader className="pb-3">
      <div className="space-y-2">
        <CardTitle className="text-sm font-medium text-card-foreground">
          {faculty.name}
        </CardTitle>
        {faculty.designation && (
          <Badge variant="secondary" className="text-xs w-fit">
            {faculty.designation}
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="space-y-2 text-xs text-muted-foreground">
        {faculty.department && (
          <div className="flex items-center gap-2">
            <Building2 className="h-3 w-3 shrink-0" />
            <span>{faculty.department}</span>
          </div>
        )}
        {faculty.specialization && (
          <div className="flex items-center gap-2">
            <GraduationCap className="h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{faculty.specialization}</span>
          </div>
        )}
        {faculty.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{faculty.email}</span>
          </div>
        )}
        {faculty.phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{faculty.phone}</span>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

const CompanyCard = ({ company }: { company: any }) => (
  <Card className="hover:shadow-sm transition-all duration-200 border-border bg-card">
    <CardHeader className="pb-3">
      <div className="space-y-2">
        <CardTitle className="text-sm font-medium text-card-foreground">
          {company.name}
        </CardTitle>
        {company.sector && (
          <Badge variant="secondary" className="text-xs w-fit">
            {company.sector}
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="pt-0 space-y-3">
      <div className="space-y-2 text-xs text-muted-foreground">
        {company.description && (
          <p className="line-clamp-2">{company.description}</p>
        )}
        {company.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{company.location}</span>
          </div>
        )}
      </div>
      
      {company.website && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => window.open(company.website, '_blank')}
        >
          <Globe className="h-3 w-3 mr-1" />
          Visit Website
        </Button>
      )}
    </CardContent>
  </Card>
)

const PlacementCard = ({ placement }: { placement: any }) => (
  <Card className="hover:shadow-sm transition-all duration-200 border-border bg-card">
    <CardHeader className="pb-3">
      <div className="space-y-2">
        <CardTitle className="text-sm font-medium text-card-foreground">
          {placement.company}
        </CardTitle>
        {placement.package && (
          <Badge variant="outline" className="text-xs w-fit">
            ₹{placement.package} LPA
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="space-y-2 text-xs text-muted-foreground">
        {placement.role && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3 shrink-0" />
            <span>{placement.role}</span>
          </div>
        )}
        {placement.branch && (
          <div className="flex items-center gap-2">
            <GraduationCap className="h-3 w-3 shrink-0" />
            <span>{placement.branch}</span>
          </div>
        )}
        {placement.year && (
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{placement.year}</span>
          </div>
        )}
        {placement.campus && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{placement.campus}</span>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

const MessMenuCard = ({ menuData }: { menuData: any }) => {
  const { hostelType, messType, todayMenu, requestedDate, actualDate, isExactMatch, formattedMenu, message } = menuData
  
  const formatMessType = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'special': 'Special Mess',
      'veg': 'Vegetarian Mess',
      'nonveg': 'Non-Vegetarian Mess'
    }
    return typeMap[type] || type
  }

  const formatHostelType = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'mens': "Men's Hostel",
      'ladies': "Ladies' Hostel"
    }
    return typeMap[type] || type
  }

  const formatMealType = (meal: string) => {
    return meal.charAt(0).toUpperCase() + meal.slice(1).toLowerCase()
  }
  const renderMenuItems = (menuItems: any) => {
    if (!menuItems || Object.keys(menuItems).length === 0) {
      return (
        <div className="text-center py-4 text-muted-foreground">
          <UtensilsCrossed className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No menu available</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {Object.entries(menuItems).map(([mealType, items]: [string, any]) => (
          <div key={mealType} className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm text-card-foreground">
                {formatMealType(mealType)}
              </h4>
            </div>
            <div className="ml-6 space-y-1">
              {Array.isArray(items) ? (
                items.map((item: string, index: number) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    • {item}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  • {items}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card className="hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-orange-500" />
            <CardTitle className="text-sm font-medium text-card-foreground">
              {formatMessType(messType)}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span>{formatHostelType(hostelType)}</span>
          </div>
          {actualDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{actualDate}</span>
              {!isExactMatch && (
                <Badge variant="secondary" className="text-xs">
                  Closest Available
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>      <CardContent className="pt-0">
        {message && (
          <div className="mb-4 p-3 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
        )}
        
        {todayMenu && renderMenuItems(todayMenu)}
        
        {/* {formattedMenu && (
          <div className="mt-4 p-3 bg-muted rounded-md">
            <h4 className="font-medium text-sm mb-2 text-card-foreground">Menu Details</h4>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
              {formattedMenu}
            </pre>
          </div>
        )} */}
      </CardContent>
    </Card>
  )
}

const PureArtifactDisplay = ({ title, icon, data, type, className }: ArtifactDisplayProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const renderContent = () => {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No data found</p>
        </div>
      )
    }    const items = Array.isArray(data) ? data : [data]
    const displayItems = isExpanded ? items : items.slice(0, 3)

    return (
      <div className={cn(
        "grid gap-3",
        type === 'mess-menu' ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"
      )}>
        {displayItems.map((item, index) => {
          switch (type) {
            case 'papers':
              return <PaperCard key={index} paper={item} />
            case 'faculty':
              return <FacultyCard key={index} faculty={item} />
            case 'companies':
              return <CompanyCard key={index} company={item} />
            case 'placements':
              return <PlacementCard key={index} placement={item} />
            case 'mess-menu':
              return <MessMenuCard key={index} menuData={item} />
            default:
              return (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )
          }
        })}
      </div>
    )
  }

  const itemCount = Array.isArray(data) ? data.length : 1
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              {icon}
              <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              <Badge variant="secondary">{itemCount} items</Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("mt-4", className)}
    >
      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon}
              <div>
                <CardTitle className="text-base text-card-foreground">{title}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {itemCount} item{itemCount !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(true)}
                className="h-8 w-8"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              {itemCount > 3 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-8 w-8"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {renderContent()}
          {itemCount > 3 && !isExpanded && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="text-xs"
              >
                Show {itemCount - 3} more items
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export const ArtifactDisplay = memo(PureArtifactDisplay)
