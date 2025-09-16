import type { JsonSchema } from '../../../types/schema.types';

export const throttleActionSchemas = {
  output: {
    type: 'object',
    properties: {
      window: {
        type: 'number',
      },
      unit: {
        type: 'string',
        enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'],
      },
      threshold: {
        type: 'number',
      },
      throttleKey: {
        type: 'string',
      },
    },
    required: ['window', 'unit'],
    additionalProperties: false,
  } as const satisfies JsonSchema,
  result: {
    type: 'object',
    properties: {
      throttled: {
        type: 'boolean',
        description: 'Whether the workflow execution was throttled',
      },
      executionCount: {
        type: 'number',
        description: 'Number of executions within the throttle window',
      },
      threshold: {
        type: 'number',
        description: 'The throttle threshold that was applied',
      },
      windowStart: {
        type: 'string',
        format: 'date-time',
        description: 'Start time of the throttle window',
      },
    },
    required: ['throttled'],
    additionalProperties: false,
  } as const satisfies JsonSchema,
};
