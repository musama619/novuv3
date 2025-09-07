import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ThrottleTypeEnum, TimeUnitEnum } from '@novu/shared';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SkipControlDto } from './skip.dto';

export class ThrottleControlDto extends SkipControlDto {
  @ApiProperty({
    description: 'Type of the throttle step.',
    enum: [ThrottleTypeEnum.THROTTLE],
    default: ThrottleTypeEnum.THROTTLE,
  })
  @IsEnum([ThrottleTypeEnum.THROTTLE])
  type: ThrottleTypeEnum.THROTTLE;
  @ApiProperty({
    description: 'The duration of the throttle window.',
    type: Number,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  window: number;

  @ApiProperty({
    description: 'The unit of time for the throttle window.',
    enum: TimeUnitEnum,
  })
  @IsEnum(TimeUnitEnum)
  unit: TimeUnitEnum;

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
