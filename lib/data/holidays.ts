import { ContextData } from './index'

/**
 * Holiday Calendar and Leave Information
 * Official holidays, semester breaks, and leave policies
 */
export const holidays: ContextData = {
  section: 'holidays',
  title: 'Holiday Calendar 2024-25',
  lastUpdated: '2024-12-20',
  priority: 'medium',
  content: `
**Remaining Holidays for Academic Year 2024-25:**

**January 2025:**
- January 14 (Tuesday) - Pongal/Makar Sankranti
- January 26 (Sunday) - Republic Day

**February 2025:**
- February 19 (Wednesday) - Maha Shivratri

**March 2025:**
- March 13 (Thursday) - Holi
- March 30 (Sunday) - Good Friday

**April 2025:**
- April 13 (Sunday) - Tamil New Year/Baisakhi
- April 14 (Monday) - Dr. B.R. Ambedkar Jayanti

**May 2025:**
- May 1 (Thursday) - Labour Day
- May 12 (Monday) - Buddha Purnima

**August 2025:**
- August 15 (Friday) - Independence Day
- August 26 (Tuesday) - Janmashtami

**October 2025:**
- October 2 (Thursday) - Gandhi Jayanti
- October 20 (Monday) - Dussehra
- October 31 (Friday) - Diwali

**November 2025:**
- November 14 (Friday) - Children's Day
- November 15 (Saturday) - Guru Nanak Jayanti

**December 2025:**
- December 25 (Thursday) - Christmas

**Semester Breaks:**
- Winter Break: December 21, 2024 - January 5, 2025
- Summer Break: May 17 - May 25, 2025
- Monsoon Break: August 2-4, 2025 (if needed)

**Leave Policies for Students:**
- Medical leave: Requires medical certificate
- Emergency leave: Prior permission from warden/faculty advisor
- Academic leave: Approval from Dean Academic
- Maximum consecutive leave: 3 days without special permission
- Attendance requirement: Minimum 85% for exam eligibility

**Important Notes:**
- Holiday dates may change based on government notifications
- Compensatory working days may be declared for some holidays
- Mess and hostel facilities continue during holidays
- Library may have reduced hours during holidays
`,
  metadata: {
    attendanceMinimum: '75%'
  }
}
