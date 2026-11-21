import * as d3 from 'd3'
import { isoWeekStartUtc } from '@utils/isoWeekStartUtc'
import { parseIsoDateUtc } from '@utils/parseIsoDateUtc'
import { utcDate } from '@utils/utcDate'

const formatDay = d3.utcFormat('%a, %b %-d, %Y')
const formatMonthDay = d3.utcFormat('%b %-d')
const formatMonthYear = d3.utcFormat('%B %Y')
const DAY_MS = 86_400_000
import type { ViewMode } from '@types'

export function formatDayLabel(dayIso: string): string {
  const dt = parseIsoDateUtc(dayIso)
  return dt ? formatDay(dt) : dayIso
}

export function formatWeekLabel(weekYear: string): string {
  const parts = weekYear.split('-')
  if (parts.length !== 2) return weekYear
  const [weekStr, yearStr] = parts
  const week = Number(weekStr)
  const year = Number(yearStr)
  if (!Number.isFinite(week) || !Number.isFinite(year)) return weekYear

  const start = isoWeekStartUtc(year, week)
  if (!start) return weekYear
  const end = new Date(start.getTime() + 6 * DAY_MS)
  return `${formatMonthDay(start)} – ${formatMonthDay(end)}, ${start.getUTCFullYear()}`
}

export function formatMonthLabel(monthYear: string): string {
  const parts = monthYear.split('-')
  if (parts.length !== 2) return monthYear
  const [monthStr, yearStr] = parts
  const month = Number(monthStr)
  const year = Number(yearStr)
  if (!Number.isFinite(month) || !Number.isFinite(year)) return monthYear

  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return monthYear
  return formatMonthYear(utcDate(year, month - 1, 1))
}

export function formatYearLabel(year: string): string {
  return year
}

export function getPeriodLabel(viewMode: ViewMode, value: string): string {
  if (!value) return ''
  switch (viewMode) {
    case 'day':
      return formatDayLabel(value)
    case 'week':
      return formatWeekLabel(value)
    case 'month':
      return formatMonthLabel(value)
    case 'year':
      return formatYearLabel(value)
    default:
      return ''
  }
}
