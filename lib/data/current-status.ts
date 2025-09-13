import { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'Current Semester Status & Latest Updates',
  lastUpdated: '2025-09-04',
  priority: 'high',
  content: `
# CURRENT SEMESTER STATUS
Active Period: Fall Semester 2025-26
Current Phase: Post CAT-1; Regular classes in progress
Campus Status: Classes resumed; Pre-GRAVITAS activities

## IMMEDIATE PRIORITIES (Sep 4, 2025)
1. Register for GRAVITAS'25 (Sep 26–28) — https://gravitas.vit.ac.in
2. Prepare for CAT-2 (Oct 5–11, 2025)

## CRITICAL UPCOMING DATES
| Date | Event | Importance |
|------|-------|------------|
| September 26-28, 2025 | GRAVITAS'25 Tech Fest | Major campus event |
| October 5-11, 2025 | CAT-2 Examinations | CRITICAL |
| November 14, 2025 | Assignment submission deadline | CRITICAL |
| December 21, 2025 - January 4, 2026 | Winter Vacation (tentative) | Semester break |

## ACADEMIC REQUIREMENTS & DEADLINES
### Attendance
- Minimum Required: 75% for exam eligibility
- Recommended: 100% attendance
- Current Focus: Maintain attendance and keep up with coursework

### Assignments & Coursework
- Last date for assignment uploads: November 14, 2025
- FAT schedule: To be announced by Controller of Examinations
- All programs except MBA follow published calendar

## CURRENT EVENTS & ACTIVITIES
### Academic
- CAT-1 completed (Aug 23); Regular classes ongoing
- Expo-1 assessments concluded
- Academic calendar reference: VTOP Portal for Saturday instructional days

### Campus Life
- Pre-GRAVITAS activities across clubs and chapters; Registrations live

## OFFICIAL COMMUNICATION CHANNELS
- VTOP Portal: Primary source for academic updates and notifications
- Official VIT Email: Important announcements
- Academic Calendar: VIT/VLR/Acad/2025/007 dated 06-03-2025

## STUDENT ACTION ITEMS
1. REGISTER: Sign up for GRAVITAS'25 events of interest
2. PLAN: Create CAT-2 study plan (Oct 5–11)
3. MAINTAIN: Keep attendance above 75%
4. TRACK: Watch VTOP for any timetable updates

## SEMESTER OVERVIEW
- Started Date: July 9, 2025
- Current Week: Week 8 of semester
- Next Major Milestone: GRAVITAS'25 (Sep 26–28) and CAT-2 (Oct 5–11)
- Semester Type: Fall Semester 2025-26
- Academic Year: 2025-26
`,
  metadata: {
    currentDate: '2025-09-04',
    activeSemester: 'Fall 2025-26',
    semesterPhase: 'Post CAT-1; Classes Ongoing',
    nextCriticalDate: '2025-09-26',
    nextCriticalEvent: "GRAVITAS'25 (Sep 26–28, 2025)",
    nextExamDate: '2025-10-05',
    nextExamEvent: 'CAT-2 Examinations',
    classesStartDate: '2025-07-09',
    semesterWeek: 8,
    academicYear: '2025-26',
    attendanceRequirement: '75%',
    assignmentDeadline: '2025-11-14',
    campusStatus: 'Regular classes; Pre-GRAVITAS activities',
    currentEvents: ["GRAVITAS'25 registrations live", 'Expo-1 completed'],
    criticalReminders: [
      'Register for GRAVITAS events',
      'Plan CAT-2 prep (Oct 5–11)',
      'Maintain 75% attendance',
      'Assignment deadline: November 14',
    ],
  },
}
