import { DateTime } from 'luxon'

export function getRelativeTime(date: string | Date): string {
  const dateTime = typeof date === 'string' ? DateTime.fromISO(date) : DateTime.fromJSDate(date)
  const now = DateTime.now()

  const diff = now.diff(dateTime, ['years', 'months', 'days', 'hours', 'minutes'])

  if (diff.years >= 1) {
    return `${Math.floor(diff.years)} year${Math.floor(diff.years) > 1 ? 's' : ''} ago`
  } else if (diff.months >= 1) {
    return `${Math.floor(diff.months)} month${Math.floor(diff.months) > 1 ? 's' : ''} ago`
  } else if (diff.days >= 1) {
    return `${Math.floor(diff.days)} day${Math.floor(diff.days) > 1 ? 's' : ''} ago`
  } else if (diff.hours >= 1) {
    return `${Math.floor(diff.hours)} hour${Math.floor(diff.hours) > 1 ? 's' : ''} ago`
  } else if (diff.minutes >= 1) {
    return `${Math.floor(diff.minutes)} minute${Math.floor(diff.minutes) > 1 ? 's' : ''} ago`
  } else {
    return 'just now'
  }
}
