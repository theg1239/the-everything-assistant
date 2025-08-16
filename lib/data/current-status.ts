import { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'Current Semester Status & Latest Updates',
  lastUpdated: '2025-08-16',
  priority: 'high',
  content: `
# CURRENT SEMESTER STATUS
Active Period: Fall Semester 2025-26
Current Phase: CAT-1 Examinations Ongoing
Campus Status: Busy with examination schedules

## IMMEDIATE PRIORITIES (Aug 16, 2025)
1. CAT-1 Examinations — August 17-23, 2025
2. Check VTOP for hall ticket, seating, timings

## CRITICAL UPCOMING DATES
| Date | Event | Importance |
|------|-------|------------|
| August 17-23, 2025 | CAT-1 Examinations (ongoing) | CRITICAL |
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
- CAT-1 examinations in progress (Aug 17-23)
- Academic calendar reference: VTOP Portal for Saturday instructional days

### Campus Life
- Campus movement adjusted due to exam schedules

## OFFICIAL COMMUNICATION CHANNELS
- VTOP Portal: Primary source for academic updates and notifications
- Official VIT Email: Important announcements
- Academic Calendar: VIT/VLR/Acad/2025/007 dated 06-03-2025

## STUDENT ACTION ITEMS
1. VERIFY: Check debar status, room, and timing on VTOP
2. ARRIVE: Be at the venue at least 30 minutes early
3. COMPLY: Carry valid ID and follow exam rules
4. MAINTAIN: Keep attendance above 75% post exams

## SEMESTER OVERVIEW
- Started Date: July 9, 2025
- Current Week: Week 6 of semester
- Next Major Milestone: CAT-1 (August 17-23) — ongoing
- Semester Type: Fall Semester 2025-26
- Academic Year: 2025-26
`,
  metadata: {
    currentDate: '2025-08-16',
    activeSemester: 'Fall 2025-26',
    semesterPhase: 'CAT-1 Examinations Ongoing',
    nextCriticalDate: '2025-08-17',
    nextCriticalEvent: 'CAT-1 Examinations (Aug 17-23, 2025)',
    nextExamDate: '2025-08-17',
    nextExamEvent: 'CAT-1 Examinations',
    classesStartDate: '2025-07-09',
    semesterWeek: 6,
    academicYear: '2025-26',
    attendanceRequirement: '75%',
    assignmentDeadline: '2025-11-14',
    campusStatus: 'Exam schedules active across campus',
    currentEvents: ['CAT-1 examinations'],
    criticalReminders: [
      'Carry hall ticket and ID card',
      'Arrive 30 minutes early',
      'Maintain 75% attendance',
      'Assignment deadline: November 14',
    ],
  },
}
