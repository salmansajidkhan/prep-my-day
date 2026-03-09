// Microsoft Graph Calendar API integration

import { getGraphClient } from "./graph-auth.js";
import type { CalendarEvent, ShowAs, ResponseStatus } from "./types.js";

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  showAs: string;
  responseStatus: { response: string };
  organizer?: { emailAddress: { name: string; address: string } };
  attendees?: Array<{ emailAddress: { name: string; address: string }; status: { response: string } }>;
  location?: { displayName: string };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl: string };
  categories?: string[];
  isAllDay?: boolean;
}

export async function fetchCalendarEvents(
  startDate: string,
  endDate: string,
  timezone: string = "Pacific Standard Time",
): Promise<CalendarEvent[]> {
  const client = getGraphClient();
  if (!client) {
    throw new Error("Not authenticated. Call authenticate() first.");
  }

  const startDateTime = `${startDate}T00:00:00`;
  const endDateTime = `${endDate}T23:59:59`;

  try {
    const response = await client
      .api("/me/calendarView")
      .query({
        startDateTime,
        endDateTime,
      })
      .header("Prefer", `outlook.timezone="${timezone}"`)
      .select("id,subject,start,end,showAs,responseStatus,organizer,attendees,location,isOnlineMeeting,onlineMeeting,categories,isAllDay")
      .orderby("start/dateTime")
      .top(200)
      .get();

    const events: GraphEvent[] = response.value ?? [];
    return events.map(mapGraphEvent);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch calendar events: ${msg}`);
  }
}

export async function fetchScheduleAvailability(
  startDate: string,
  endDate: string,
  timezone: string = "Pacific Standard Time",
): Promise<Array<{ start: string; end: string; status: string }>> {
  const client = getGraphClient();
  if (!client) {
    throw new Error("Not authenticated. Call authenticate() first.");
  }

  try {
    // Get current user's email
    const me = await client.api("/me").select("mail,userPrincipalName").get();
    const email = me.mail || me.userPrincipalName;

    const response = await client.api("/me/calendar/getSchedule").post({
      schedules: [email],
      startTime: { dateTime: `${startDate}T00:00:00`, timeZone: timezone },
      endTime: { dateTime: `${endDate}T23:59:59`, timeZone: timezone },
      availabilityViewInterval: 15,
    });

    const schedule = response.value?.[0];
    if (!schedule?.scheduleItems) return [];

    return schedule.scheduleItems.map((item: { start: { dateTime: string }; end: { dateTime: string }; status: string }) => ({
      start: item.start.dateTime,
      end: item.end.dateTime,
      status: item.status,
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch schedule availability: ${msg}`);
  }
}

function mapGraphEvent(event: GraphEvent): CalendarEvent {
  return {
    id: event.id,
    subject: event.subject ?? "(No subject)",
    startTime: event.start.dateTime,
    endTime: event.end.dateTime,
    organizer: event.organizer?.emailAddress?.name,
    attendees: event.attendees?.map((a) => a.emailAddress.name).filter(Boolean),
    location: event.location?.displayName || undefined,
    isOnline: event.isOnlineMeeting ?? false,
    joinUrl: event.onlineMeeting?.joinUrl || undefined,
    showAs: (event.showAs?.toLowerCase() ?? "unknown") as ShowAs,
    responseStatus: (event.responseStatus?.response?.toLowerCase() ?? "none") as ResponseStatus,
    categories: event.categories ?? [],
    isAllDay: event.isAllDay ?? false,
  };
}
