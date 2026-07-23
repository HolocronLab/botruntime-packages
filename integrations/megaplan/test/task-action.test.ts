import { expect, test } from 'bun:test'
import { projectTask } from '../src/actions/task'

test('getTask projection exposes only safe task fields', () => {
  const projected = projectTask({
    contentType: 'Task',
    id: 'task-42',
    name: 'Получить оригиналы доверенности — Иван Иванов',
    status: 'assigned',
    deadline: { contentType: 'DateTime', value: '2026-07-24 12:00:00' },
    deals: [{ contentType: 'Deal', id: 'deal-7' }],
    statement: 'Трек, контакты и внутренняя инструкция.',
    responsible: { contentType: 'Employee', id: 'employee-1' },
    comments: [{ content: 'Внутренний комментарий' }],
  } as never)

  expect(projected).toEqual({
    id: 'task-42',
    name: 'Получить оригиналы доверенности — Иван Иванов',
    status: 'assigned',
    deadline: '2026-07-24 12:00:00',
    dealIds: ['deal-7'],
  })
  expect('statement' in projected).toBe(false)
  expect('responsible' in projected).toBe(false)
  expect('comments' in projected).toBe(false)
})
