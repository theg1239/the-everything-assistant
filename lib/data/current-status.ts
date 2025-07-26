import { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'Current Semester Status & Latest Updates',
  lastUpdated: '2025-07-26',
  priority: 'high',
  content: `
# CURRENT SEMESTER STATUS
Active Period: Fall Semester 2025-26
Current Phase: Regular Classes & CAT-1 Preparation
Campus Status: Very crowded with freshers

## IMMEDIATE PRIORITIES (July 24, 2025)
2. CAT-1 Preparation - Exam starts August 17, 2025 (3 weeks away)

## CRITICAL UPCOMING DATES
| Date | Event | Importance |
|------|-------|------------|
| August 15, 2025 | Independence Day Holiday | Academic break |
| August 17-23, 2025 | CAT-1 Examinations | CRITICAL - 75% attendance required |
| August 27, 2025 | Vinayaka Chathurthi Holiday | Academic break |
| September 26-28, 2025 | Gravitas'25 Cultural Fest | Major campus event |
| November 14, 2025 | Assignment submission deadline | CRITICAL |
| December 21, 2025 - January 4, 2026 | Winter Vacation (tentative) | Semester break |

## ACADEMIC REQUIREMENTS & DEADLINES
### Attendance
- Minimum Required: 75% for exam eligibility
- Recommended: 100% attendance
- Current Focus: Maintain attendance for CAT-1 eligibility

### Assignments & Coursework
- Last date for assignment uploads: November 14, 2025
- FAT schedule: To be announced by Controller of Examinations
- All programs except MBA follow published calendar

## CURRENT EVENTS & ACTIVITIES
### Academic
- Regular classes in progress
- CAT-1 preparation phase
- Academic calendar reference: VTOP Portal for Saturday instructional days

### Cultural & Campus Life
- AARAMB cultural fest ongoing
- Campus very crowded with new freshers
- Preparation for Gravitas'25 (September)

## OFFICIAL COMMUNICATION CHANNELS
- VTOP Portal: Primary source for academic updates and notifications
- Official VIT Email: Important announcements
- Academic Calendar: VIT/VLR/Acad/2025/007 dated 06-03-2025

## STUDENT ACTION ITEMS
1. PREPARE: Start intensive CAT-1 preparation
2. MAINTAIN: Keep attendance above 75%
3. MONITOR: Check VTOP regularly for updates
4. PLAN: Prepare assignment submissions well before November 14

## SEMESTER OVERVIEW
- Started Date: July 9, 2025
- Current Week: Week 4 of semester
- Next Major Milestone: CAT-1 (August 17-23)
- Semester Type: Fall Semester 2025-26
- Academic Year: 2025-26
`,
  metadata: {
    currentDate: '2025-07-24',
    activeSemester: 'Fall 2025-26',
    semesterPhase: 'Regular classes - CAT-1 preparation',
    nextCriticalDate: '2025-07-25',
    nextCriticalEvent: 'Weekend semester course registration',
    nextExamDate: '2025-08-17',
    nextExamEvent: 'CAT-1 Examination',
    classesStartDate: '2025-07-09',
    semesterWeek: 3,
    upcomingFest: "Gravitas'25 (Sep 26-28, 2025)",
    academicYear: '2025-26',
    attendanceRequirement: '75%',
    assignmentDeadline: '2025-11-14',
    campusStatus: 'Very crowded with freshers',
    currentEvents: ['AARAMB cultural fest', 'Weekend semester registration', 'CAT-1 preparation'],
    criticalReminders: [
      'Weekend semester registration: July 25, 11am-6pm',
      'CAT-1 starts in 3 weeks',
      'Maintain 75% attendance',
      'Assignment deadline: November 14'
    ]
  },
}
