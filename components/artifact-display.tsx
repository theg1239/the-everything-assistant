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
  Clock,
  User,
  Hash,
  BookOpen,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  FileText,
  Sparkles,
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ArtifactDisplayProps {  title: string
  icon?: React.ReactNode
  data: any
  type: 'papers' | 'faculty' | 'companies' | 'placements' | 'mess-menu' | 'vtop-data' | 'general' | 'interactive-course-page'
  className?: string
  onLoginClick?: () => void
}

const VTOPDataCard = ({ vtopData, onLoginClick }: { vtopData: any; onLoginClick?: () => void }) => {
  const { command, content, rawOutput, success, data, parsedData, formatted_content, structured_data, summary, error, message } = vtopData
  const CUSTOM_RENDER_COMMANDS = ['attendance', 'marks', 'grades', 'profile']

  if (vtopData.requiresCredentials === true) {
    return null
  }
  if (success === false || error) {
    let errorMessage = error || message || ''
    
    if (!errorMessage || errorMessage === '500') {
      if (rawOutput && typeof rawOutput === 'string') {
        if (rawOutput.includes('Login failed') || rawOutput.includes('session could not be established')) {
          errorMessage = 'Login failed - incorrect username/password'
        } else if (rawOutput.includes('Invalid LoginId/Password')) {
          errorMessage = 'Invalid LoginId/Password'
        } else if (rawOutput.includes('credentials required') || rawOutput.includes('VTOP credentials required')) {
          errorMessage = 'VTOP credentials required'
        }
      }
    }
    
    const isCredentialError = errorMessage.includes('VTOP credentials required') || 
                             errorMessage.includes('credentials')
    const isAuthError = errorMessage.includes('Invalid LoginId/Password') ||
                       errorMessage.includes('Login failed') ||
                       errorMessage.includes('session could not be established') ||
                       errorMessage.includes('incorrect username/password')
    
    if (isCredentialError || isAuthError) {
      return null
    }
  }

  const formatCommandName = (cmd: string) => {
    const commandMap: { [key: string]: string } = {
      'class-message': 'Class Message',
      'exam-schedule': 'Exam Schedule', 
      'library-dues': 'Library Dues',
      'leave-status': 'Leave Status',
      'nightslip': 'Night Slip',
      'course-page': 'Course Page'
    }
    return commandMap[cmd] || cmd.charAt(0).toUpperCase() + cmd.slice(1).replace(/-/g, ' ')
  }

  const renderCustomVTOPCommand = (command: string, content: any) => {
    switch (command) {      case 'attendance':
        if (Array.isArray(content) && content.length > 0) {
          const validSubjects = content.filter((subject: any) => {
            const subjectName = subject.SUBJECT || subject.subject || subject.name || ''
            const percentage = parseFloat(subject.PERCENTAGE || subject.percentage || subject.attendance || '0')
            const attended = subject['CLASSES ATTENDED'] || subject.attended || subject.classesAttended || '0'
            const total = subject['TOTAL CLASSES'] || subject.total || subject.totalClasses || '0'
            
            // Filter out subjects with:
            // 1. Empty or generic names like "Subject X"
            // 2. 0% attendance with no actual classes
            // 3. Both attended and total are 0 or N/A
            return subjectName && 
                   !subjectName.match(/^Subject \d+$/i) && 
                   subjectName.trim() !== '' &&
                   !(percentage === 0 && (attended === '0' || attended === 'N/A') && (total === '0' || total === 'N/A'))
          })
          
          if (validSubjects.length === 0) {
            return <div className="text-muted-foreground text-sm">No attendance data available.</div>
          }
          
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-card-foreground">Attendance Summary</h3>
              </div>
              
              <div className="grid gap-3">
                {validSubjects.map((subject: any, index: number) => {
                  const subjectName = subject.SUBJECT || subject.subject || subject.name || `Subject ${index + 1}`
                  const percentage = parseFloat(subject.PERCENTAGE || subject.percentage || subject.attendance || '0')
                  const attended = subject['CLASSES ATTENDED'] || subject.attended || subject.classesAttended || 'N/A'
                  const total = subject['TOTAL CLASSES'] || subject.total || subject.totalClasses || 'N/A'
                  let alert = subject['75% ALERT'] || subject.alert || subject.status || ''
                  
                  if (alert) {
                    alert = alert
                      .replace(/[^\x20-\x7E]/g, '')
                      .replace(/\s+/g, ' ')
                      .trim()
                  }
                  
                  const getStatusColor = (percent: number) => {
                    if (percent >= 85) return 'text-green-600 bg-green-50 border-green-200'
                    if (percent >= 75) return 'text-amber-600 bg-amber-50 border-amber-200'
                    return 'text-red-600 bg-red-50 border-red-200'
                  }
                  
                  const getProgressColor = (percent: number) => {
                    if (percent >= 85) return 'bg-green-500'
                    if (percent >= 75) return 'bg-amber-500'
                    return 'bg-red-500'
                  }
                  
                  return (
                    <div key={index} className={`p-4 rounded-lg border ${getStatusColor(percentage)}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          <span className="font-medium text-sm">
                            {subjectName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(percentage)}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-xs mb-2">
                        {attended !== 'N/A' && total !== 'N/A' && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            <span>Classes: {attended}/{total}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Required: 75%</span>
                        </div>
                      </div>
                      
                      {alert && (
                        <div className={`text-xs font-medium p-2 rounded ${
                          alert.includes('Can miss') || alert.includes('safe') 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : 'bg-red-100 text-red-700 border border-red-200'
                        }`}>
                          <div className="flex items-center gap-1">
                            {alert.includes('Can miss') || alert.includes('safe') ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <AlertTriangle className="h-3 w-3" />
                            )}
                            {alert}
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-2 text-xs text-muted-foreground">
                        {percentage >= 85 && (
                          <span className="text-green-600">✓ Excellent attendance</span>
                        )}
                        {percentage >= 75 && percentage < 85 && (
                          <span className="text-amber-600">⚠ Good attendance, stay consistent</span>
                        )}
                        {percentage < 75 && (
                          <span className="text-red-600">⚠ Below minimum requirement</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                <div className="text-xs font-medium text-card-foreground mb-2">Summary:</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="text-center">
                    <div className="text-green-600 font-medium">
                      {validSubjects.filter((s: any) => parseFloat(s.PERCENTAGE || s.percentage || '0') >= 85).length}
                    </div>
                    <div className="text-muted-foreground">Excellent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-amber-600 font-medium">
                      {validSubjects.filter((s: any) => {
                        const p = parseFloat(s.PERCENTAGE || s.percentage || '0')
                        return p >= 75 && p < 85
                      }).length}
                    </div>
                    <div className="text-muted-foreground">Good</div>
                  </div>
                  <div className="text-center">
                    <div className="text-red-600 font-medium">
                      {validSubjects.filter((s: any) => parseFloat(s.PERCENTAGE || s.percentage || '0') < 75).length}
                    </div>
                    <div className="text-muted-foreground">Below 75%</div>
                  </div>
                </div>
              </div>
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
                {content.slice(0, 5).map((row: any, index: number) => (
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
          )
        }
        break

      case 'profile':
        let profileData: any = {}
        
        if (typeof content === 'object' && content !== null) {
          if (Array.isArray(content)) {
            content.forEach((item: any) => {
              if (typeof item === 'object' && item !== null) {
                Object.assign(profileData, item)
              }
            })
          } else {
            profileData = content
          }
        }

        if (profileData && Object.keys(profileData).length > 0) {
          return (
            <div className="space-y-3">
              {Object.entries(profileData).map(([key, value]) => {
                if (value === null || value === undefined || value === '') return null
                
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

      default:
        return null
    }
    return null
  }  
  const renderVTOPContent = () => {
    if (success === false || error) {
      let errorMessage = error || message || 'An error occurred while retrieving VTOP data'
      
      if ((!errorMessage || errorMessage === '500') && rawOutput && typeof rawOutput === 'string') {
        if (rawOutput.includes('Login failed') || rawOutput.includes('session could not be established')) {
          errorMessage = 'Login failed - incorrect username/password'
        } else if (rawOutput.includes('Invalid LoginId/Password')) {
          errorMessage = 'Invalid LoginId/Password'
        } else if (rawOutput.includes('credentials required') || rawOutput.includes('VTOP credentials required')) {
          errorMessage = 'VTOP credentials required'
        } else if (rawOutput.includes('error')) {
          const lines = rawOutput.split('\n')
          const errorLine = lines.find(line => line.toLowerCase().includes('error') || line.toLowerCase().includes('invalid'))
          if (errorLine) {
            const cleanError = errorLine
              .replace(/^[^"]*"/, '')
              .replace(/"[^"]*$/, '')
              .replace(/\\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            if (cleanError) {
              errorMessage = cleanError
            }
          }
        }
      }
      
      const isCredentialError = errorMessage.includes('VTOP credentials required') || 
                               errorMessage.includes('credentials')
      const isAuthError = errorMessage.includes('Invalid LoginId/Password') ||
                         errorMessage.includes('Login failed') ||
                         errorMessage.includes('session could not be established') ||
                         errorMessage.includes('incorrect username/password')
        
      if (isCredentialError || isAuthError || vtopData.requiresCredentials === true) {
        return null
      }
        
      return (
        <div className="space-y-3">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h4 className="text-sm font-medium text-destructive">Error Retrieving Data</h4>
            </div>
            <p className="text-sm text-destructive font-medium">{errorMessage}</p>
            {rawOutput && typeof rawOutput === 'string' && rawOutput !== errorMessage && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Show detailed error information
                </summary>
                <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded overflow-x-auto">
                  {rawOutput}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    if (CUSTOM_RENDER_COMMANDS.includes(command) && content) {
      const customRender = renderCustomVTOPCommand(command, content)
      if (customRender) {
        return customRender
      }
    }
    const finalParsedData = parsedData
    const finalFormattedContent = formatted_content || finalParsedData?.formatted_content
    const finalStructuredData = structured_data || finalParsedData?.structured_data
    const finalSummary = summary || finalParsedData?.summary
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
              <h4 className="text-sm font-medium text-card-foreground mb-2"></h4>              <div 
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
                           [&_h6]:text-sm [&_h6]:font-medium [&_h6]:text-card-foreground [&_h6]:mb-2 [&_h6]:mt-3                           [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1.5 [&_a]:px-4 [&_a]:py-2 [&_a]:bg-blue-500 [&_a]:text-white [&_a]:rounded-lg [&_a]:text-sm [&_a]:font-medium [&_a]:no-underline [&_a]:hover:bg-blue-600 [&_a]:transition-colors [&_a]:shadow-sm [&_a]:ml-2
                           [&_ul]:space-y-4 [&_ul]:mb-6 [&_ul]:pl-0
                           [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:p-3 [&_li]:bg-muted/30 [&_li]:rounded-lg [&_li]:border [&_li]:border-border/50 [&_li]:text-card-foreground [&_li]:gap-4"
                dangerouslySetInnerHTML={{ __html: finalFormattedContent }}
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
              ))}            </div>
          )}
        </div>
      )    }

    return (
      <div className="space-y-2">
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
    <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">          <CardTitle className="text-sm font-medium text-card-foreground flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-blue-500" />
            VTOP {formatCommandName(command || 'data')}
          </CardTitle>
          {(success !== false && !vtopData.requiresCredentials) ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : vtopData.requiresCredentials ? (
            <GraduationCap className="h-4 w-4 text-blue-500" />
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
  <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
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
  <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
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
  <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
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
  <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
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
    <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
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
    </Card>  )
}

const InteractiveCoursePageCard = ({ workflowData }: { workflowData: any }) => {
  const { step, options, prompt, nextStep, sessionData, completed, message, downloadInfo, smartMatch, canResume, interactiveState } = workflowData
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedOption, setSelectedOption] = useState('')
  const [error, setError] = useState('')
  
  const handleContinue = async () => {
    if (!selectedOption.trim()) {
      setError('Please enter a selection')
      return
    }
    
    setIsProcessing(true)
    setError('')
    
    try {
      // todo: would need to be implemented to call the continuation API
      // For now, we'll show a message that the user should continue via chat
      setError('Please continue the conversation by specifying your selection in the chat')
    } catch (err) {
      setError('Failed to continue workflow')
    } finally {
      setIsProcessing(false)
    }
  }
  if (completed && downloadInfo) {
    const downloadFiles = downloadInfo.servedFiles || downloadInfo.files || []
    
    return (
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm font-medium text-card-foreground">
              Course Materials Downloaded
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground mb-3">{message}</p>
          
          {downloadFiles && downloadFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-card-foreground">
                📁 Available Downloads ({downloadFiles.length} files):
              </p>
              <div className="space-y-2">
                {downloadFiles.map((file: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-card-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                        {file.expiry && (
                          <span className="ml-2">
                            • Expires: {new Date(file.expiry).toLocaleString()}
                          </span>
                        )}
                      </p>
                    </div>
                    {file.downloadUrl && (
                      <a 
                        href={file.downloadUrl} 
                        download={file.name}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
            {downloadInfo.downloadPath && (!downloadFiles || downloadFiles.length === 0) && (
            <div className="mt-3 p-2 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">📂 Local path:</span> {downloadInfo.downloadPath}
              </p>
            </div>
          )}
          
          {downloadInfo.filesDownloaded && downloadInfo.totalFiles && (
            <div className="mt-3 p-2 bg-green-100 dark:bg-green-900/20 rounded-md">
              <p className="text-xs text-green-700 dark:text-green-300">
                ✅ Successfully downloaded {downloadInfo.filesDownloaded} of {downloadInfo.totalFiles} files
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }
  
  if (completed) {
    return (
      <Card className="border-green-500/20 bg-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm font-medium text-card-foreground">
              Course Materials Downloaded
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    )
  }

  if (smartMatch && smartMatch.bestMatches) {
    return (
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <CardTitle className="text-sm font-medium text-card-foreground">
              Smart Material Selection
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground mb-3">{smartMatch.explanation}</p>
          
          <div className="space-y-2">
            <p className="text-xs font-medium text-card-foreground">AI Selected Materials:</p>
            <div className="space-y-1">
              {smartMatch.bestMatches.map((match: any, index: number) => (
                <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <Badge variant="outline" className="text-xs">
                    {match.index}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{match.reason}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">Confidence:</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div 
                          className="bg-purple-500 h-1.5 rounded-full" 
                          style={{ width: `${match.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(match.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700">
                <p className="font-medium mb-1">Selection String:</p>
                <code className="bg-blue-500/20 px-1 py-0.5 rounded text-xs">
                  {smartMatch.selectionString}
                </code>
                <p className="mt-1">Processing download...</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-sm font-medium text-card-foreground">
              Course Page - {step?.charAt(0).toUpperCase() + step?.slice(1)} Selection
            </CardTitle>
          </div>
          {nextStep && (
            <Badge variant="secondary" className="text-xs">
              Next: {nextStep}
            </Badge>
          )}
        </div>
        {prompt && (
          <p className="text-xs text-muted-foreground mt-2">{prompt}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">        {options && options.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-card-foreground mb-3">
              {step === 'materials' ? '📚 Available Course Materials:' : 'Available Options:'}
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {options.map((option: any, index: number) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                    step === 'materials' 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                      : 'bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <Badge variant="outline" className="text-xs min-w-8 justify-center">
                    {option.number}
                  </Badge>
                  <div className="flex-1">
                    {step === 'materials' && option.date && option.topic ? (
                      <div>
                        <p className="text-xs font-medium text-card-foreground">
                          📅 {option.date}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {option.topic}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 flex-1">
                  <p className="font-medium mb-1">How to Download Materials:</p>
                  {step === 'materials' ? (
                    <div className="space-y-2">
                      <p>You can download course materials by specifying:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li><strong>"Download all"</strong> - Downloads all {options.length} materials</li>
                        <li><strong>"Download 1,3,5"</strong> - Downloads specific materials by number</li>
                        <li><strong>"Download 1-5"</strong> - Downloads a range of materials</li>
                        <li><strong>"Download recent 3"</strong> - Downloads the 3 most recent materials</li>
                      </ul>
                      <p className="mt-2 font-medium">Example: "Download all materials" or "Download materials 1,2,3"</p>
                    </div>
                  ) : (
                    <p>Please continue the conversation and specify which {step} you'd like to select (e.g., "Select option 2" or "I want the first one").</p>
                  )}
                  
                  {canResume && interactiveState === 'waiting_for_input' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={selectedOption}
                          onChange={(e) => setSelectedOption(e.target.value)}
                          placeholder={
                            step === 'materials' 
                              ? 'e.g., "0" for all, "1,3,5" for specific, "1-3" for range'
                              : `Enter option number (1-${options?.length || 0})`
                          }
                          className="flex-1 px-2 py-1 text-xs border border-amber-300 rounded bg-white/80 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          disabled={isProcessing}
                        />
                        <Button
                          size="sm"
                          onClick={handleContinue}
                          disabled={isProcessing || !selectedOption.trim()}
                          className="px-3 py-1 text-xs h-auto"
                        >
                          {isProcessing ? 'Processing...' : step === 'materials' ? 'Download' : 'Continue'}
                        </Button>                      </div>
                      
                      {step === 'materials' && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOption('0')}
                            className="px-2 py-1 text-xs h-auto"
                          >
                            All Materials
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOption('1-3')}
                            className="px-2 py-1 text-xs h-auto"
                          >
                            Recent 3
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOption('1-5')}
                            className="px-2 py-1 text-xs h-auto"
                          >
                            First 5
                          </Button>
                        </div>
                      )}
                      
                      {error && (
                        <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <BookOpen className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Processing {step} step...</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const PureArtifactDisplay = ({ title, icon, data, type, className, onLoginClick }: ArtifactDisplayProps) => {
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
        <div
        className={cn(
          "grid gap-3 grid-cols-1",
          type === 'mess-menu' || type === 'vtop-data'
            ? ""
            : "md:grid-cols-2 lg:grid-cols-3"
        )}
      >
          {displayItems.map((item, index) => {          switch (type) {
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
              return <VTOPDataCard key={index} vtopData={item} onLoginClick={onLoginClick} />
            case 'interactive-course-page':
              return <InteractiveCoursePageCard key={index} workflowData={item} />
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
              {icon}              <div>
                <CardTitle className="text-base text-card-foreground">{title}</CardTitle>
                {!(type === 'vtop-data' && Array.isArray(data) && data.length === 1 && data[0]?.requiresCredentials) && (
                  <p className="text-sm text-muted-foreground">
                    {itemCount} item{itemCount !== 1 ? 's' : ''} found
                  </p>
                )}
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
