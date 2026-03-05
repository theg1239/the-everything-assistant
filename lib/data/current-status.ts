import { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'Current Semester Status & Latest Updates',
  lastUpdated: '2026-03-05',
  priority: 'high',
  content: `
# CURRENT SEMESTER STATUS
Active Period: Winter Semester 2025-26 (Post-Riviera, pre-CAT-II)
Current Phase: Regular classes + CAT-II preparation window.
Campus Status: High academic activity with CAT-II and hostel administrative updates underway.

## STATUS SNAPSHOT (Mar 5, 2026)
1. Riviera 2026 (Feb 26 - Mar 1, 2026) has concluded successfully and campus is back to full academic rhythm.
2. CAT-II (Mar 15 - Mar 23, 2026) is the next major assessment window and is now close.
3. Hostel counselling is currently active across blocks.
4. Latest hostel allocation update indicates S Block has been allotted to girls for this cycle.

## CRITICAL DATES (NEXT 60 DAYS)
| Date | Event | Notes |
|------|-------|-------|
| Mar 15 - Mar 23, 2026 | CAT-II | 90-minute assessments across courses. |
| Mar 19, 2026 | Ramzan (Holiday) | Check revised class/assessment handling by school. |
| Mar 20, 2026 | Telugu New Year (Holiday) | Holiday during CAT-II period. |
| Apr 3, 2026 | Good Friday | No instructional day. |
| Apr 11 - Apr 17, 2026 | FAT (Laboratory) | Lab FAT slots as released by schools. |
| Apr 20, 2026 onwards | FAT (Theory) | CoE timetable and hall ticket instructions apply. |

## ACTION ITEMS FOR STUDENTS
- Finalize CAT-II revision plans this week and confirm course-specific portions.
- Track hostel counselling deadlines and submit preferences/documents on time.
- Verify current hostel block notifications, especially S Block allocation details.
- Follow VTOP / CoE notices for any CAT-II slot-level updates.

## LOOKING AHEAD: WINTER SEMESTER 2025-26
- Mar 15 - Mar 23, 2026: CAT-II.
- Apr 11 - Apr 17, 2026: Lab FAT window.
- Apr 20, 2026 onwards: Theory FAT window begins.
- May 11, 2026 (tentative): Summer Term starts.
- Jul 13, 2026 (tentative): Fall Semester 2026-27 starts.

## POLICY REMINDERS
- Maintain at least 75% attendance to stay CAT/FAT eligible.
- Assignments/project uploads for Winter semester due by Apr 17, 2026.
- Hostel allotment/counselling changes must be treated as notice-driven; follow official hostel office communications.

## COMMUNICATION CHANNELS
- VTOP announcements + CoE circulars for CAT-II and FAT slot details.
- Hostel office notices/portals for counselling and block allotment updates.
- Class coordinators and proctors for section-level operational clarifications.
`,
  metadata: {
    currentDate: '2026-03-05',
    activeSemester: 'Winter 2025-26',
    semesterPhase: 'Post-Riviera and pre-CAT-II',
    cat2Window: '2026-03-15 to 2026-03-23',
    labFatWindow: '2026-04-11 to 2026-04-17',
    theoryFatStart: '2026-04-20',
    nextCriticalDate: '2026-03-15',
    nextCriticalEvent: 'CAT-II Starts',
    attendanceRequirement: '75%',
    assignmentDeadline: '2026-04-17',
    campusStatus: 'Academic peak with exam prep and hostel counselling',
    hostelCounsellingStatus: 'ongoing',
    hostelAllocationUpdate: 'S Block allotted to girls (current cycle)',
    criticalReminders: [
      'CAT-II starts on 2026-03-15',
      'Hostel counselling windows are currently active',
      'Track official notices for S Block and related hostel allocation changes',
    ],
  },
}
