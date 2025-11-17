import { ContextData } from './index'

export const academicCalendar: ContextData = {
  section: 'academic-calendar',
  title: 'Academic Calendar Winter Semester 2025-26',
  lastUpdated: '2025-11-16',
  priority: 'high',
  content: `
Circular: Academic Calendar for Winter Semester 2025-26
*(Applicable to the students of all programmes except BSc. (Agri))*

## Pre-Semester Setup
- Oct 13-14, 2025 (Mon & Tue): Course wish list registration (mandatory for course registration).
- Oct 29, 2025 (Wed): Mock course registration for freshers.
- Nov 1, 2025 (Sat): Course registration window for all students.

## Semester Timeline
- Dec 5, 2025 (Fri): Commencement of Winter Semester 2025-26.
- Dec 5-7, 2025 (Fri-Sun): Course add/drop option.
- Dec 13, 2025 (Sat): Last date for paying re-registration fees.
- Dec 21, 2025 – Jan 4, 2026: Winter vacation (15 days).
- Jan 14-18, 2026: Pongal holidays.

## Assessments & Flagship Events
- Jan 27 – Feb 2, 2026 (Tue-Mon): Continuous Assessment Test - I (CAT-I).
- Feb 16-18, 2026 (Mon-Wed): Course withdrawal window.
- Feb 26 – Mar 1, 2026 (Thu-Sun): Riviera 2026 festival.
- Mar 4, 2026 (Wed): Holi (holiday).
- Mar 15 – Mar 23, 2026 (Sun-Mon): Continuous Assessment Test - II (CAT-II).
- Mar 19, 2026 (Thu): Ramzan (holiday).
- Mar 20, 2026 (Fri): Telugu New Year's Day.
- Apr 3, 2026 (Fri): Good Friday – No instructional day.
- Apr 10, 2026 (Fri): Last instructional day for laboratory classes.
- Apr 11 – Apr 17, 2026 (Sat-Fri): Final assessment test for laboratory courses/components.
- Apr 14, 2026 (Tue): Tamil New Year's Day / Dr. B. R. Ambedkar Birthday (Holiday).
- Apr 17, 2026 (Fri): Last instructional day for theory classes & assignment/project upload deadline.
- Apr 20, 2026 (Mon): Commencement of FAT for theory courses/components.
- May 11, 2026 (Mon): Commencement of Summer Term 2025-26 (Tentative).
- Jul 13, 2026 (Mon): Commencement of Fall Semester 2026-27 (Tentative).

## Instructional Days Snapshot
| Segment | CAT-I | CAT-II | FAT | Total |
|---------|-------|--------|-----|-------|
| No. of Instructional Days | 28 | 28 | 19 | 75 |

## Key Notes
- Wish list registration participation is mandatory to become eligible for course registration.
- Maintain 100% attendance where possible; minimum of 75% attendance is compulsory for appearing in CATs and FATs.
- FAT detailed slotting will be issued by the Controller of Examinations closer to the exam window.
- Upload all assignments and project reports on or before Apr 17, 2026 (Friday).
`,
  metadata: {
    semester: 'Winter 2025-26',
    semesterStart: '2025-12-05',
    wishListWindow: '2025-10-13 to 2025-10-14',
    cat1Window: '2026-01-27 to 2026-02-02',
    cat2Window: '2026-03-15 to 2026-03-23',
    labFatWindow: '2026-04-11 to 2026-04-17',
    theoryFatStart: '2026-04-20',
    assignmentDeadline: '2026-04-17',
    nextSemesterStart: '2026-07-13',
  },
}
