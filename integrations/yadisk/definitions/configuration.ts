import { z } from '@botpress/sdk'

const relativeFolder = z
  .string()
  .refine((v) => v.trim() === '' || !/^[a-z]+:\//i.test(v), 'Папка должна быть относительной, без app:/ или disk:/')
  .refine((v) => !v.split('/').some((s) => s.trim() === '.' || s.trim() === '..'), 'Сегменты . и .. запрещены')

// Per-install конфиг. yadiskToken — .secret(): у Я.Диска нет общего вендорского
// OAuth-приложения, токен у каждой фирмы свой → это per-install configuration,
// доставляемая рантаймом через x-bp-configuration в ctx.configuration, а НЕ
// build-time secrets-блок. yadiskFolder — корневой сегмент под app:/.
export const configuration = {
  schema: z.object({
    yadiskToken: z
      .string()
      .secret()
      .describe('OAuth-токен Яндекс.Диска (scope cloud_api:disk.app_folder). Хранится зашифрованным.'),
    yadiskFolder: relativeFolder
      .default('')
      .describe('Корневой сегмент под app:/ (например cases). Пусто = корень папки приложения.'),
  }),
}
