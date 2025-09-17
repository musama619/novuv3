import type { JsonSchema } from '../../../types/schema.types';

export const throttleActionSchemas = {
  output: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
      },
      unit: {
        type: 'string',
        enum: ['minutes', 'hours', 'days'],
      },
      threshold: {
        type: 'number',
      },
      throttleKey: {
        type: 'string',
      },
    },
    required: ['amount', 'unit'],
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
