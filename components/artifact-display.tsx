"use client"

import React, { useState, memo, useMemo } from "react"
import DOMPurify from "dompurify"
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
  Clock,
  User,
  Hash,
  BookOpen,
  BarChart3,
  CheckCircle,
  AlertTriangle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ArtifactDisplayProps {  title: string
  icon?: React.ReactNode
  data: any
  type: 'papers' | 'faculty' | 'companies' | 'placements' | 'mess-menu' | 'vtop-data' | 'general'
  className?: string
}

const VTOPDataCard = ({ vtopData }: { vtopData: any }) => {
  const { command, content, rawOutput, success, data, parsedData, formatted_content, structured_data, summary, error, message } = vtopData

  const renderVTOPContent = () => {
    // Handle error states first
    if (success === false || error) {
      const errorMessage = error || message || 'An error occurred while retrieving VTOP data'
      const isCredentialError = errorMessage.includes('Invalid LoginId/Password') || 
                               errorMessage.includes('credentials') ||
                               errorMessage.includes('Login failed')
      
      return (
        <div className="space-y-3">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h4 className="text-sm font-medium text-destructive">
                {isCredentialError ? 'Authentication Failed' : 'Error Retrieving Data'}
              </h4>
            </div>
            <p className="text-xs text-destructive/80">
              {isCredentialError 
                ? 'Invalid VTOP credentials. Please check your username and password and try again.'
                : errorMessage
              }
            </p>
          </div>
          {isCredentialError && (
            <div className="p-3 bg-muted/50 rounded-md">
              <h4 className="text-xs font-medium text-muted-foreground mb-1">Troubleshooting:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Verify your VTOP username and password</li>
                <li>• Check if your VTOP account is active</li>
                <li>• Try logging into VTOP directly to confirm credentials</li>
              </ul>
            </div>
          )}
        </div>
      )
    }    // Prioritize server-side parsed data
    const finalParsedData = parsedData
    const finalFormattedContent = formatted_content || finalParsedData?.formatted_content
    const finalStructuredData = structured_data || finalParsedData?.structured_data
    const finalSummary = summary || finalParsedData?.summary

    const sanitizedContent = useMemo(() =>
      typeof finalFormattedContent === 'string'
        ? DOMPurify.sanitize(finalFormattedContent)
        : ''
    , [finalFormattedContent])

    // Use parsed data if available from server - check for any AI-processed content
    if (finalFormattedContent || finalSummary || (finalStructuredData && typeof finalStructuredData === 'object' && Object.keys(finalStructuredData).length > 0)) {
      return (
        <div className="space-y-4">
          {finalSummary && typeof finalSummary === 'string' && (
            <div className="p-3 bg-primary/10 rounded-md">
              <p className="text-sm text-card-foreground font-medium">{finalSummary}</p>
            </div>
          )}
          
          {finalFormattedContent && typeof finalFormattedContent === 'string' && (
            <div className="p-3 bg-muted/50 rounded-md">
              <h4 className="text-sm font-medium text-card-foreground mb-2"></h4>
              <div
                className="text-sm text-muted-foreground prose prose-sm max-w-none
                           [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:rounded-md [&_table]:overflow-hidden
                           [&_th]:border [&_th]:border-border [&_th]:p-3 [&_th]:bg-muted/80 [&_th]:font-semibold [&_th]:text-card-foreground [&_th]:text-left
                           [&_td]:border [&_td]:border-border [&_td]:p-3 [&_td]:text-card-foreground
                           [&_tr:nth-child(even)]:bg-muted/20
                           [&_strong]:text-card-foreground [&_strong]:font-semibold
                           [&_em]:italic [&_em]:text-muted-foreground
                           [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-card-foreground
                           [&_br]:mb-2
                           [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-card-foreground [&_h1]:mb-4 [&_h1]:mt-4
                           [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-card-foreground [&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1
                           [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-card-foreground [&_h3]:mb-2 [&_h3]:mt-3
                           [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-card-foreground [&_h4]:mb-2 [&_h4]:mt-3
                           [&_h5]:text-sm [&_h5]:font-medium [&_h5]:text-card-foreground [&_h5]:mb-2 [&_h5]:mt-3
                           [&_h6]:text-sm [&_h6]:font-medium [&_h6]:text-card-foreground [&_h6]:mb-2 [&_h6]:mt-3"
                dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              />
            </div>
          )}

          {finalStructuredData && typeof finalStructuredData === 'object' && Object.keys(finalStructuredData).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-card-foreground">Structured Details:</h4>
              {Object.entries(finalStructuredData).map(([key, value]) => (
                <div key={key} className="flex items-start gap-3">
                  <User className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-card-foreground block">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </span>
                    <span className="text-xs text-muted-foreground break-words">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Fallback to original parsing logic if Gemini parsing failed
    switch (command) {
      case 'profile':
        // Handle different data structures for profile
        let profileData: any = {}
        
        if (typeof content === 'object' && content !== null) {
          if (Array.isArray(content)) {
            // If content is an array, merge all objects
            content.forEach((item: any) => {
              if (typeof item === 'object' && item !== null) {
                Object.assign(profileData, item)
              }
            })
          } else {
            // If content is a single object
            profileData = content
          }
        } else if (typeof rawOutput === 'string') {
          // Try to parse rawOutput if content is not available
          try {
            const parsed = JSON.parse(rawOutput)
            if (parsed && typeof parsed === 'object') {
              profileData = parsed
            }
          } catch (e) {
            // If parsing fails, treat as raw text
            return (
              <div className="space-y-2">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                  {rawOutput}
                </pre>
              </div>
            )
          }
        }

        // If we have profile data, render it nicely
        if (profileData && Object.keys(profileData).length > 0) {
          return (
            <div className="space-y-3">
              {Object.entries(profileData).map(([key, value]) => {
                if (value === null || value === undefined || value === '') return null
                
                // Format key names for better display
                const formattedKey = key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, str => str.toUpperCase())
                  .replace(/Id$/, 'ID')
                  .replace(/Cgpa/, 'CGPA')
                  .replace(/Gpa/, 'GPA')
                
                return (
                  <div key={key} className="flex items-start gap-3">
                    <User className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-card-foreground block">
                        {formattedKey}
                      </span>
                      <span className="text-xs text-muted-foreground break-words">
                        {String(value)}
                      </span>
                    </div>
                  </div>
                )
              }).filter(Boolean)}
            </div>
          )
        }
        break
      case 'marks':
      case 'grades':
        if (Array.isArray(content) && content.length > 0) {
          const headers = Object.keys(content[0])
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
                {content.slice(0, 5).map((row, index) => (
                  <div key={index} className="p-2 border border-border/50 rounded-md bg-muted/30">
                    {headers.map(header => (
                      <div key={header} className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-card-foreground">{header}:</span>
                        <span className="text-muted-foreground">{row[header]}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {content.length > 5 && (
                  <div className="text-xs text-muted-foreground text-center">
                    ... and {content.length - 5} more entries
                  </div>
                )}
              </div>
            </div>
          )        }
        break
      case 'attendance':
        if (Array.isArray(content) && content.length > 0) {
          return (
            <div className="space-y-2">
              {content.slice(0, 5).map((subject, index) => {
                const subjectName = subject.SUBJECT || subject.subject || subject.name || `Subject ${index + 1}`
                const percentage = subject.PERCENTAGE || subject.percentage || subject.attendance || 'N/A'
                const attended = subject['CLASSES ATTENDED'] || subject.attended || subject.classesAttended || 'N/A'
                const alert = subject['75% ALERT'] || subject.alert || subject.status || ''
                
                return (
                  <div key={index} className="p-3 border border-border/50 rounded-md bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-3 w-3 text-green-400" />
                        <span className="text-sm font-medium text-card-foreground">
                          {subjectName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-3 w-3 text-blue-400" />
                        <span className="text-sm font-medium text-card-foreground">
                          {percentage}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {attended !== 'N/A' && (
                        <div>Classes Attended: {attended}</div>
                      )}
                      {alert && (
                        <div className={`font-medium ${alert.includes('Can miss') ? 'text-green-600' : 'text-red-600'}`}>
                          {alert}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {content.length > 10 && (
                <div className="text-xs text-muted-foreground text-center">
                  ... and {content.length - 5} more subjects
                </div>
              )}
            </div>
          )
        }
        break
      default:
        if (typeof content === 'object') {
          return (
            <div className="space-y-2">
              {Object.entries(content).slice(0, 5).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="font-medium text-card-foreground">{key}:</span>
                  <span className="text-muted-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          )
        }
    }    return (
      <div className="space-y-2">
        {/* Try to parse and display any available data */}
        {data && (
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-xs font-medium text-card-foreground mb-2">VTOP Data:</div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
              {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
        {rawOutput && rawOutput !== data && (
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-xs font-medium text-card-foreground mb-2">Raw Output:</div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
              {typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput, null, 2)}
            </pre>
          </div>
        )}
        {content && content !== rawOutput && content !== data && (
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="text-xs font-medium text-card-foreground mb-2">Processed Content:</div>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
              {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-card-foreground flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-blue-500" />
            VTOP {command.charAt(0).toUpperCase() + command.slice(1)}
          </CardTitle>
          {success !== false ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {renderVTOPContent()}
      </CardContent>
    </Card>
  )
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

    return (      <div className={cn(
        "grid gap-3",
        type === 'mess-menu' || type === 'vtop-data' ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"
      )}>{displayItems.map((item, index) => {
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
            case 'vtop-data':
              return <VTOPDataCard key={index} vtopData={item} />
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
