import { JSONSchemaEntity } from '@novu/dal';
import { TimeUnitEnum, UiComponentEnum, UiSchema, UiSchemaGroupEnum } from '@novu/shared';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defaultOptions, skipStepUiSchema, skipZodSchema } from './shared';

// Throttle-specific time units (excluding seconds for performance reasons)
const ThrottleTimeUnitEnum = {
  MINUTES: TimeUnitEnum.MINUTES,
  HOURS: TimeUnitEnum.HOURS,
  DAYS: TimeUnitEnum.DAYS,
} as const;

export const throttleControlZodSchema = z
  .object({
    skip: skipZodSchema,
    window: z.number().min(1),
    unit: z.nativeEnum(ThrottleTimeUnitEnum),
    threshold: z.number().min(1).optional(),
    throttleKey: z.string().optional(),
  })
  .strict();

export type ThrottleControlType = z.infer<typeof throttleControlZodSchema>;

export const throttleControlSchema = zodToJsonSchema(throttleControlZodSchema, defaultOptions) as JSONSchemaEntity;

export const throttleUiSchema: UiSchema = {
  group: UiSchemaGroupEnum.THROTTLE,
  properties: {
    skip: skipStepUiSchema.properties.skip,
    window: {
      component: UiComponentEnum.THROTTLE_WINDOW,
      placeholder: null,
    },
    unit: {
      component: UiComponentEnum.THROTTLE_UNIT,
      placeholder: TimeUnitEnum.MINUTES,
    },
    threshold: {
      component: UiComponentEnum.THROTTLE_THRESHOLD,
      placeholder: 1,
    },
    throttleKey: {
      component: UiComponentEnum.THROTTLE_KEY,
      placeholder: '',
    },
  },
};
