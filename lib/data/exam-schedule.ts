import { ContextData } from './index'

export const examSchedule: ContextData = {
  section: 'exam-schedule',
  title: 'Exam Schedule & Information (FAT + Winter 2025-26)',
  lastUpdated: '2025-11-16',
  priority: 'high',
  content: `
## FALL SEMESTER 2025-26 – FAT STATUS
- Laboratory FAT Window: Nov 10-14, 2025 (completed/ongoing clean-up slots).
- Theory FAT Window: Nov 17 – Dec 4, 2025 (3-hour exams, 50% weightage).
- Entry Requirements: Hall ticket + ID card; arrive 30 minutes early.
- Last Theory Instructional Day: Nov 14, 2025.

## WINTER SEMESTER 2025-26 – ASSESSMENT PLAN
### Continuous Assessment Tests
- CAT-I: Jan 27 – Feb 2, 2026 (Tue-Mon).
  - Duration: 90 minutes per course.
  - Coverage: All topics up to mid-January.
- CAT-II: Mar 15 – Mar 23, 2026 (Sun-Mon).
  - Duration: 90 minutes.
  - Coverage: Topics post CAT-I.

### Final Assessment Tests (FAT)
- Lab FATs: Apr 11 – Apr 17, 2026 (Sat-Fri) with slots defined by the respective schools.
- Theory FATs: Begin Apr 20, 2026 (Mon); detailed timetable from CoE closer to date.
- Weightage: CAT-I 15% + CAT-II 15% + Digital/Assignments 10% + FAT 50% + Quiz/Practical components 10%.

### Key Deadlines / Windows
- Course Withdrawal: Feb 16 – Feb 18, 2026.
- Assignment & Project Uploads: Due Apr 17, 2026 (Friday).
- Re-registration Fee Deadline: Dec 13, 2025 (before semester start).
- Add/Drop: Dec 5 – Dec 7, 2025.

### Holidays Affecting Instruction
- Winter Vacation: Dec 21, 2025 – Jan 4, 2026.
- Pongal Break: Jan 14 – Jan 18, 2026.
- Riviera 2026: Feb 26 – Mar 1, 2026 (adjust rehearsal schedules early).
- Holi: Mar 4, 2026 (Holiday).
- Ramzan: Mar 19, 2026 (Holiday).
- Telugu New Year: Mar 20, 2026 (Holiday).
- Good Friday: Apr 3, 2026 (No instruction day).
- Tamil New Year / Dr. B. R. Ambedkar Birthday: Apr 14, 2026 (Holiday within FAT-Lab window).

### Attendance & Policies
- Minimum 75% attendance remains mandatory for CAT/FAT eligibility (target 100%).
- Wish list registration (Oct 13-14, 2025) is compulsory for course registration validation.
- Any malpractice during FAT invites disciplinary action; electronic gadgets prohibited except approved calculators.

### Preparation Tips
- Use the gap between FAT conclusion (Dec 4) & Winter start (Dec 5) to reset materials and lab requirements.
- Pre-block hostel/commute arrangements for CAT windows and Riviera week crowds.
- Sync personal calendars with Ramzan/Tamil New Year to avoid clashes with lab FAT slots.
`,
  metadata: {
    currentSemester: 'Fall 2025-26 (FAT window)',
    theoryFatDates: '2025-11-17 to 2025-12-04',
    winterSemesterStart: '2025-12-05',
    cat1Dates: '2026-01-27 to 2026-02-02',
    cat2Dates: '2026-03-15 to 2026-03-23',
    labFatWindow: '2026-04-11 to 2026-04-17',
    theoryFatStart: '2026-04-20',
    attendanceRequirement: '75%',
    assignmentDeadline: '2026-04-17',
  },
}
