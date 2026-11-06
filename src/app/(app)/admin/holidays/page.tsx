import { HolidayEditor } from "@/components/HolidayEditor";
import { HrManaged } from "@/components/HrManaged";
import { getHolidays } from "@/lib/leave";
import { hrConfigured } from "@/lib/hr-feed";

export default async function HolidaysPage() {
  if (hrConfigured()) return <HrManaged title="Holidays" what="Public holidays" path="/settings/leave" />;
  return <HolidayEditor initial={await getHolidays()} />;
}
