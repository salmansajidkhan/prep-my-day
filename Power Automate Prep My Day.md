# Power Automate — Prep My Day

## Overview
Scheduled Power Automate flows that deliver daily and weekly schedule briefings via email or Teams message — no PC or VS Code needed.

## Flows to Create

### Flow 1: Daily Briefing (Evening Prep)
**Trigger:** Recurrence — Every weekday (Mon-Fri) at 6:00 PM Pacific
**Purpose:** Prep tomorrow's schedule, delivered to your inbox/Teams tonight

#### Steps

1. **Recurrence trigger**
   - Frequency: Week
   - Interval: 1
   - On days: Monday, Tuesday, Wednesday, Thursday, Friday (previews next day; Friday previews Monday)
   - At: 6:00 PM
   - Time zone: Pacific Standard Time

2. **Initialize variable** — `targetDate`
   - Type: String
   - Value: `addDays(utcNow(), 1)` (tomorrow)
   - If today is Friday, use `addDays(utcNow(), 3)` for Monday
   - Expression:
     ```
     if(equals(dayOfWeek(utcNow()), 5), addDays(utcNow(), 3), addDays(utcNow(), 1))
     ```

3. **Get calendar view (Office 365 Outlook connector)**
   - Calendar ID: default
   - Start time: `formatDateTime(variables('targetDate'), 'yyyy-MM-dd')T00:00:00`
   - End time: `formatDateTime(variables('targetDate'), 'yyyy-MM-dd')T23:59:59`

4. **Filter confirmed meetings** (Filter array)
   - From: value (calendar events)
   - Condition: `showAs` equals `busy` AND (`responseStatus` equals `accepted` OR `organizer` is true)
   - Exclude: items where subject contains "Focus Time", "Lunch", "Deep Work"

5. **Sort by start time** (Select + Sort)

6. **Compose briefing** (Compose action)
   - Build plain-text summary:
     ```
     Prep My Day — [Day, Date]

     MEETINGS
     • [Time] [Subject] — [Attendees]
     • [Time] [Subject] — [Attendees]

     FREE BLOCKS
     • [Start]-[End] ([Duration] min)

     Total: [N] meetings, [M] min free
     ```

7. **Send briefing** (choose one or both):

   **Option A — Email (Send an email V2)**
   - To: salmankhan@microsoft.com
   - Subject: `Prep My Day — [formatted date]`
   - Body: composed briefing (HTML formatted)

   **Option B — Teams message (Post message in a chat or channel)**
   - Post as: Flow bot
   - Post in: Chat with Flow bot (delivers to your Teams activity)
   - Message: composed briefing

---

### Flow 2: Daily Briefing (Morning Recap)
**Trigger:** Recurrence — Every weekday at 7:30 AM Pacific
**Purpose:** Quick refresh of today's schedule with any overnight changes

#### Steps
Same as Flow 1, except:
- `targetDate` = `utcNow()` (today, not tomorrow)
- Subject line: `Today's Schedule — [date]`
- Add section for **unread email count** (optional):
  - Use "Get emails (V3)" with filter `isRead eq false` and `receivedDateTime ge [today 12am]`
  - Include count in briefing: `You have [N] unread emails this morning.`

---

### Flow 3: Weekly Briefing (Sunday Evening)
**Trigger:** Recurrence — Every Sunday at 6:00 PM Pacific
**Purpose:** Full Mon-Fri week preview

#### Steps

1. **Recurrence trigger**
   - Frequency: Week
   - Interval: 1
   - On days: Sunday
   - At: 6:00 PM
   - Time zone: Pacific Standard Time

2. **Initialize variable** — `weekStart`
   - Value: next Monday's date
   - Expression: `addDays(utcNow(), sub(8, dayOfWeek(utcNow())))`

3. **Get calendar view** (5-day span)
   - Start time: `[weekStart]T00:00:00`
   - End time: `addDays([weekStart], 5)T00:00:00`

4. **Filter confirmed meetings** (same logic as daily)

5. **Group by day** (Apply to each + condition on date)

6. **Compose weekly briefing**
   ```
   Weekly Schedule — Week of [Monday date]

   MONDAY
   • [Time] [Subject] — [Attendees]
   Free: [blocks]

   TUESDAY
   • [Time] [Subject] — [Attendees]
   Free: [blocks]

   ... (through Friday)

   WEEK SUMMARY
   Total meetings: [N]
   Busiest day: [Day] ([M] meetings)
   Most free: [Day] ([X] min open)
   ```

7. **Send briefing** (email and/or Teams, same as daily)

---

### Flow 4: Weekly Briefing (Monday Morning)
**Trigger:** Recurrence — Every Monday at 7:30 AM Pacific
**Purpose:** Same as Sunday evening but refreshed with any weekend changes

#### Steps
Same as Flow 3, except:
- Trigger: Monday 7:30 AM
- Subject: `This Week — [week of date]`
- Optional: add "Changes since Sunday" diff section if you want

---

## Free Block Computation Logic

For each day, compute free blocks between confirmed meetings within working hours:

```
Working hours: 9:00 AM - 5:00 PM (configurable)

1. Sort confirmed meetings by start time
2. Walk through the day:
   - Gap before first meeting (from 9 AM) = free block
   - Gap between meetings = free block
   - Gap after last meeting (to 5 PM) = free block
3. Exclude blocks shorter than 15 minutes
```

Power Automate expression for gap calculation:
```
dateDifference(items('previous_meeting')?['end'], items('current_meeting')?['start'])
```

## Connectors Required
| Connector | License | Purpose |
|---|---|---|
| Office 365 Outlook | Included with M365 | Calendar view, send email |
| Microsoft Teams | Included with M365 | Post briefing message |
| Recurrence | Built-in | Scheduling |

No premium connectors needed. All standard M365 license.

## Delivery Preferences
- **Email** — Works on any device, searchable, archivable
- **Teams chat** — Shows in Teams activity feed, works on mobile
- **Both** — Recommended for reliability (email as backup)

## Setup Steps
1. Go to [make.powerautomate.com](https://make.powerautomate.com)
2. Create each flow from blank (Automated cloud flow → Recurrence trigger)
3. Add the connectors and steps above
4. Test each flow with "Test → Manually"
5. Turn on all 4 flows

## Optional Enhancements
- Add unread email summary (count + top 3 senders)
- Add Teams unread mentions count
- Add weather forecast via MSN Weather connector
- Add task list from To Do connector
- Flag days with >5 meetings as "heavy" days
- Include meeting conflicts/overlaps as warnings
