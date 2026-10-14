import { HolidayEditor } from "@/components/HolidayEditor";
import { getHolidays } from "@/lib/leave";

export default async function HolidaysPage() {
  return <HolidayEditor initial={await getHolidays()} />;
}
