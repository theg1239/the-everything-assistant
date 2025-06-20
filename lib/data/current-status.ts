import { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'Current Semester Status & Latest Updates',
  lastUpdated: '2025-06-20',
  priority: 'high',
  content: `
CURRENT SEMESTER STATUS:
- Active Period: Summer Break / Fall 2025-26 Registration Phase
- Upcoming Semester: Fall Semester 2025-26
- Current Phase: Course Allocation & Registration Preparation
- Classes Start: July 9, 2025 (Wednesday) - 19 days away
- Current Academic Year: Transition to 2025-26

WHAT'S HAPPENING RIGHT NOW (June 20, 2025):
- Course wish list registration completed (June 4, 2025)
- Course allocation and scheduling by Schools (June 9-20, 2025) - ENDING SOON
- Next: Course registration by students (June 28, 2025) - 8 days away
- Upcoming: Semester commencement (July 9, 2025) - 19 days away

NEXT IMPORTANT DATES:
- June 28, 2025: Course registration by students
- July 9, 2025: Fall semester classes begin
- July 9-11, 2025: Course add/drop period
- July 20, 2025: Last date for re-registration fee payment

LATEST EVENTS & ANNOUNCEMENTS:

Academic Updates:
- Fall Semester 2025-26 academic calendar released (VIT/VLR/Acad/2025/007 dated 06-03-2025)
- Course allocation in progress by respective Schools
- Students advised to check VTOP regularly for updates
- Academic calendar on VTOP Login to be referred for Saturday instructional days

Important Notices:
- All programmes except MBA follow the published calendar
- Minimum 75% attendance mandatory for exam eligibility
- Course wish list registration was mandatory for Course Registration eligibility
- Winter vacation tentatively scheduled: December 21, 2025 - January 4, 2026

Upcoming Events:
- Gravitas'25: September 26-28, 2025 (VIT's annual cultural fest)
- Independence Day: August 15, 2025 (Holiday)
- Vinayaka Chathurthi: August 27, 2025 (Holiday)

For Students:
- Check VTOP portal regularly for course allocation updates
- Prepare for course registration on June 28, 2025
- Ensure all pending fees are cleared before registration
- Academic counseling available for course selection queries

Stay Updated:
- VTOP Portal: For all academic updates and notifications
- Official VIT email

Important Reminders:
- Course registration is time-sensitive - don't miss June 28, 2025
- 100% attendance preferred; minimum 75% mandatory
- Last date for assignment uploads: November 14, 2025
- FAT schedule will be announced by Controller of Examinations at appropriate time
`,
  metadata: {
    currentDate: '2025-06-20',
    activeSemester: 'Fall 2025-26',
    semesterPhase: 'Registration Period',
    nextMajorDate: '2025-06-28', // Course registration
    nextMajorEvent: 'Course Registration',
    classesStartDate: '2025-07-09',
    upcomingFest: "Gravitas'25 (Sep 26-28, 2025)",
    academicYear: '2025-26',
  },
}
