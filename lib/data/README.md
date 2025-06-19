# VIT Context Data Management System

This system provides a centralized way to manage frequently changing contextual information about VIT Vellore that gets injected into AI prompts.

## 📁 Structure

```
lib/data/
├── index.ts                  # Main data aggregation and exports
├── context-integration.ts    # Integration helpers for AI prompts
├── examples.ts              # Usage examples and integration patterns
├── academic-calendar.ts     # Academic calendar and semester dates
├── working-saturdays.ts     # Working Saturday schedules
├── exam-schedule.ts         # Exam dates and information
├── mess-menu.ts            # Current mess menu and dining info
├── holidays.ts             # Holiday calendar and leave policies
└── important-dates.ts      # Key deadlines and important dates
```

## 🚀 Quick Start

The system is already integrated with the main AI prompts. Current VIT context data is automatically injected into `VIT_SYSTEM_PROMPT` in `lib/prompts.ts`.

## 📝 Adding New Context Data

1. **Create a new data file** (e.g., `lib/data/new-section.ts`):

```typescript
import { ContextData } from './index'

export const newSection: ContextData = {
  section: 'new-section',
  title: 'New Section Title',
  lastUpdated: '2024-12-20',
  priority: 'high', // 'high' | 'medium' | 'low'
  content: `
Your content here...
  `,
  metadata: {
    // Optional metadata
  }
}
```

2. **Update the aggregation** in `lib/data/index.ts`:

```typescript
// Add your import to the getAllContextData function
const { newSection } = require('./new-section')

// Add to the return array
return [
  academicCalendar,
  workingSaturdays,
  // ... existing sections
  newSection, // Add here
].filter(Boolean)
```

## 🔄 Updating Existing Data

To update any context data:

1. **Edit the relevant file** (e.g., `lib/data/academic-calendar.ts`)
2. **Update the content** and **lastUpdated** date
3. **Test the integration** - context automatically updates in AI responses

## 📊 Priority Levels

- **High**: Critical information (academic calendar, exams, important deadlines)
- **Medium**: Useful information (mess menu, holidays)
- **Low**: Nice-to-have information (extra details, supplementary info)

By default, only **high-priority** sections are included in AI prompts to prevent token overflow.

## 🛠 API Functions

### Main Functions

```typescript
import { getCurrentVITContext } from '@/lib/data/context-integration'

// Get formatted context for AI prompts (already integrated)
const context = getCurrentVITContext()
```

### Advanced Usage

```typescript
import { 
  getAllContextData, 
  getContextDataBySection,
  getHighPriorityContextData 
} from '@/lib/data'

// Get all sections
const allData = getAllContextData()

// Get specific section
const examData = getContextDataBySection('exam-schedule')

// Get only high-priority sections
const importantData = getHighPriorityContextData()
```

## 📅 Update Schedule

### Daily
- Check for new university announcements
- Update time-sensitive information

### Weekly  
- Review and update mess menu
- Check for working Saturday announcements
- Update important upcoming dates

### Monthly
- Validate all data for accuracy
- Update academic calendar if needed
- Add new holidays or schedule changes

## 🔍 Data Sources

- **Official VIT notifications** and circulars
- **Academic office announcements**
- **Student portal updates**
- **Mess committee notifications**
- **Exam cell announcements**

## 🎯 Integration Points

The context system is automatically integrated into:

1. **Main AI System Prompt** (`lib/prompts.ts`) - Provides current context to all AI responses
2. **Chat API** - Context is available in all conversations
3. **Tools** - Context can inform tool selection and responses

## 💡 Best Practices

1. **Keep content concise** - Focus on actionable information
2. **Update regularly** - Stale data reduces user trust
3. **Use clear formatting** - Make information scannable
4. **Include contact info** - Provide ways to verify information
5. **Mark priority appropriately** - High priority for critical info only

## 🔧 Troubleshooting

If context data isn't appearing:

1. Check the `lastUpdated` date format (YYYY-MM-DD)
2. Ensure the section is added to `getAllContextData()` 
3. Verify the `priority` field is set correctly
4. Check for TypeScript compilation errors

## 📈 Future Enhancements

- **Automated data fetching** from official sources
- **Version control** for content changes
- **Analytics** on most-accessed sections
- **Multi-language support** for international students
- **Integration with official VIT APIs** when available

---

**Note**: This system ensures students always get the most current information about VIT Vellore, making the AI assistant more helpful and reliable! 🎓
