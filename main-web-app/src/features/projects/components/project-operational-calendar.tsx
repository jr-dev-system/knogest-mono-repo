"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import { fromZonedTime } from "date-fns-tz";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const timeZone = "America/Sao_Paulo";
const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type CalendarMonth = Pick<CalendarDate, "year" | "month">;

function compareCalendarDates(left: CalendarDate, right: CalendarDate) {
  return (
    Date.UTC(left.year, left.month, left.day) -
    Date.UTC(right.year, right.month, right.day)
  );
}

function isSameCalendarDate(left: CalendarDate, right: CalendarDate) {
  return compareCalendarDates(left, right) === 0;
}

function toCalendarDate(date: Date): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: value("year"), month: value("month") - 1, day: value("day") };
}

function toCalendarDateFromIso(value: string) {
  return toCalendarDate(new Date(value));
}

function dateFromOffset(month: CalendarMonth, offset: number): CalendarDate {
  const date = new Date(Date.UTC(month.year, month.month, 1 + offset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function daysInMonth(month: CalendarMonth) {
  return new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
}

function isSameCalendarMonth(left: CalendarMonth, right: CalendarMonth) {
  return left.year === right.year && left.month === right.month;
}

function dateLabel(date: CalendarDate) {
  const weekday = weekDays[
    new Date(Date.UTC(date.year, date.month, date.day)).getUTCDay()
  ];
  return `${weekday}, ${date.day} de ${monthNames[date.month]} de ${date.year}`;
}

function millisecondsUntilNextLocalMidnight(now: Date) {
  const currentDay = toCalendarDate(now);
  const nextDay = dateFromOffset(currentDay, 1);
  const localMidnight = `${nextDay.year}-${String(nextDay.month + 1).padStart(2, "0")}-${String(nextDay.day).padStart(2, "0")}T00:00:00`;

  return Math.max(0, fromZonedTime(localMidnight, timeZone).getTime() - now.getTime());
}

function validMonthsForYear(
  year: number,
  firstAvailableDay: CalendarDate,
  today: CalendarDate,
) {
  return monthNames
    .map((name, month) => ({ name, month }))
    .filter(({ month }) => {
      const firstDay = { year, month, day: 1 };
      const lastDay = { year, month, day: daysInMonth({ year, month }) };
      return (
        compareCalendarDates(lastDay, firstAvailableDay) >= 0 &&
        compareCalendarDates(firstDay, today) <= 0
      );
    });
}

export function ProjectOperationalCalendar({ startedAt }: { startedAt: string }) {
  const firstAvailableDay = React.useMemo(
    () => toCalendarDateFromIso(startedAt),
    [startedAt],
  );
  const [today, setToday] = React.useState(() => toCalendarDate(new Date()));
  const [month, setMonth] = React.useState<CalendarMonth>(() => ({
    year: today.year,
    month: today.month,
  }));

  React.useEffect(() => {
    let timeout: number;
    const scheduleNextDay = () => {
      timeout = window.setTimeout(() => {
        const nextToday = toCalendarDate(new Date());
        setToday(nextToday);
        setMonth((currentMonth) =>
          compareCalendarDates(
            { ...currentMonth, day: 1 },
            { ...nextToday, day: 1 },
          ) > 0
            ? { year: nextToday.year, month: nextToday.month }
            : currentMonth,
        );
        scheduleNextDay();
      }, millisecondsUntilNextLocalMidnight(new Date()) + 25);
    };

    scheduleNextDay();
    return () => window.clearTimeout(timeout);
  }, []);

  const years = Array.from(
    { length: today.year - firstAvailableDay.year + 1 },
    (_, index) => today.year - index,
  );
  const availableMonths = validMonthsForYear(
    month.year,
    firstAvailableDay,
    today,
  );
  const firstWeekday = new Date(
    Date.UTC(month.year, month.month, 1),
  ).getUTCDay();
  const calendarDays = Array.from({ length: 42 }, (_, index) =>
    dateFromOffset(month, index - firstWeekday),
  );

  const updateYear = (year: number) => {
    const months = validMonthsForYear(year, firstAvailableDay, today);
    setMonth({ year, month: months.some(({ month: value }) => value === month.month) ? month.month : months[0]!.month });
  };

  return (
    <section
      aria-label="Calendário operacional"
      className="flex min-h-[calc(100dvh-9rem)] flex-col"
    >
      <header className="flex flex-col gap-3 border-b border-border bg-secondary/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarRange aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">
              Calendário operacional
            </h2>
            <p className="text-sm text-muted-foreground">
              Consulte os dias já liberados para esta obra.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth({ year: today.year, month: today.month })}
          >
            Hoje
          </Button>
          <label>
            <span className="sr-only">Mês exibido</span>
            <select
              aria-label="Mês exibido"
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              value={month.month}
              onChange={(event) =>
                setMonth((current) => ({
                  ...current,
                  month: Number(event.target.value),
                }))
              }
            >
              {availableMonths.map(({ month: value, name }) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Ano exibido</span>
            <select
              aria-label="Ano exibido"
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              value={month.year}
              onChange={(event) => updateYear(Number(event.target.value))}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="grid grid-cols-7 border-b border-border bg-secondary/45">
        {weekDays.map((day) => (
          <span
            key={day}
            className="px-1 py-2 text-center text-xs font-bold text-muted-foreground sm:px-2"
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-b-md bg-border">
        {calendarDays.map((day) => {
          const isCurrentMonth = isSameCalendarMonth(day, month);
          const isToday = isSameCalendarDate(day, today);
          const isAvailable =
            compareCalendarDates(day, firstAvailableDay) >= 0 &&
            compareCalendarDates(day, today) <= 0;

          return (
            <button
              key={`${day.year}-${day.month}-${day.day}`}
              type="button"
              disabled={!isAvailable}
              aria-label={`${dateLabel(day)}${isToday ? ", hoje" : ""}${!isAvailable ? ", indisponível" : ""}`}
              className={cn(
                "min-h-11 bg-card p-2 text-left text-sm font-semibold text-foreground transition-colors outline-none sm:min-h-16",
                isCurrentMonth ? "" : "text-muted-foreground/60",
                isAvailable &&
                  "cursor-pointer hover:bg-secondary active:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/30",
                !isAvailable && "cursor-not-allowed text-muted-foreground/45",
                isToday &&
                  "relative z-0 bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85",
              )}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export { millisecondsUntilNextLocalMidnight, toCalendarDate };
