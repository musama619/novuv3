import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimeUnitEnum } from '@novu/shared';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SkipControlDto } from './skip.dto';

// Throttle-specific time units (excluding seconds for performance reasons)
const ThrottleTimeUnitEnum = {
  MINUTES: TimeUnitEnum.MINUTES,
  HOURS: TimeUnitEnum.HOURS,
  DAYS: TimeUnitEnum.DAYS,
} as const;

type ThrottleTimeUnit = (typeof ThrottleTimeUnitEnum)[keyof typeof ThrottleTimeUnitEnum];

export class ThrottleControlDto extends SkipControlDto {
  @ApiProperty({
    description: 'The duration of the throttle window.',
    type: Number,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  window: number;

  @ApiProperty({
    description: 'The unit of time for the throttle window. Supported units: minutes, hours, days.',
    enum: ThrottleTimeUnitEnum,
  })
  @IsEnum(ThrottleTimeUnitEnum)
  unit: ThrottleTimeUnit;

  @ApiPropertyOptional({
    description: 'The maximum number of executions allowed within the window. Defaults to 1.',
    type: Number,
    minimum: 1,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  threshold?: number;

  @ApiPropertyOptional({
    description:
      'Optional key for grouping throttle rules. If not provided, defaults to workflow and subscriber combination.',
    type: String,
  })
  @IsString()
  @IsOptional()
  throttleKey?: string;
}
