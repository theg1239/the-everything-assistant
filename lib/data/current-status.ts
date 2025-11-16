import { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'Current Semester Status & Latest Updates',
  lastUpdated: '2025-11-16',
  priority: 'high',
  content: `
# CURRENT SEMESTER STATUS
Active Period: Fall Semester 2025-26 (FAT Window)
Current Phase: Final Assessment Tests are in progress across labs and theory slots.
Campus Status: Exam-only operations; Winter Semester readiness underway.

## STATUS SNAPSHOT (Nov 16, 2025)
1. FAT examinations have started—laboratory FATs have been running since Nov 10 and theory slots begin Nov 17.
2. Winter Semester 2025-26 commences on Dec 5, 2025, immediately after the FAT window.
3. Prepare to complete re-registration formalities before Dec 13, 2025.

## CRITICAL DATES (NEXT 60 DAYS)
| Date | Event | Notes |
|------|-------|-------|
| Nov 10-14, 2025 | FAT (Laboratory) | Exams already underway; follow faculty slotting. |
| Nov 17 - Dec 4, 2025 | FAT (Theory) | 3-hour slots; hall tickets via VTOP. |
| Dec 5-7, 2025 | Course add/drop window | Applies to Winter Semester 2025-26. |
| Dec 5, 2025 | Winter Semester begins | New timetable available after FAT. |
| Dec 13, 2025 | Re-registration fee deadline | Late payment not permitted. |
| Dec 21, 2025 - Jan 4, 2026 | Winter vacation | 15-day break. |

## ACTION ITEMS FOR STUDENTS
- Revise per FAT timetable; maintain exam discipline (ID + hall ticket mandatory).
- Return library books/clear dues before departing for vacation.
- Revisit timetable choices and prepare preference changes for Winter add/drop.
- Track VTOP / email for Winter Semester classroom and attendance resets post-Dec 5.

## LOOKING AHEAD: WINTER SEMESTER 2025-26
- Dec 5: Classes resume with new semester day order.
- Jan 27 – Feb 2, 2026: CAT-I window.
- Mar 15 – Mar 23, 2026: CAT-II window.
- Apr 11 – Apr 17, 2026: Lab FATs; Apr 20 onwards: Theory FATs.
- Summer Term (tentative): Starts May 11, 2026.
- Fall Semester 2026-27 (tentative): Starts Jul 13, 2026.

## POLICY REMINDERS
- Attendance resets with each semester; maintain at least 75% to stay FAT-eligible.
- Assignments/project uploads for Winter semester due by Apr 17, 2026.
- Course wish list participation (Oct 13-14, 2025) remains compulsory for future registration checks.

## COMMUNICATION CHANNELS
- VTOP announcements + CoE circulars for daily FAT slot details.
- Academic offices + class groups for Winter timetable releases.
- Controller of Examinations will publish any FAT slot changes; monitor email.
`,
  metadata: {
    currentDate: '2025-11-16',
    activeSemester: 'Fall 2025-26',
    semesterPhase: 'FAT exams ongoing',
    classesStartDate: '2025-07-09',
    theoryFatWindow: '2025-11-17 to 2025-12-04',
    labFatWindow: '2025-11-10 to 2025-11-14',
    nextSemester: 'Winter 2025-26',
    nextSemesterStart: '2025-12-05',
    nextCriticalDate: '2025-12-05',
    nextCriticalEvent: 'Winter Semester 2025-26 Commences',
    attendanceRequirement: '75%',
    assignmentDeadlineWinter: '2026-04-17',
    campusStatus: 'Exam-only operations',
    criticalReminders: [
      'Carry hall ticket + ID for every FAT slot',
      'Plan hostel/travel around FAT timetable',
      'Complete re-registration payment before Dec 13',
    ],
  },
}
