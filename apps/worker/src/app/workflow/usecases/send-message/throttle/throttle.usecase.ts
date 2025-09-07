import { Injectable, Logger } from '@nestjs/common';
import {
  CreateExecutionDetails,
  CreateExecutionDetailsCommand,
  DetailEnum,
  InstrumentUsecase,
} from '@novu/application-generic';
import { JobRepository, JobStatusEnum, MessageRepository } from '@novu/dal';
import {
  DigestUnitEnum,
  ExecutionDetailsSourceEnum,
  ExecutionDetailsStatusEnum,
  IThrottleMetadata,
  ThrottleTypeEnum,
} from '@novu/shared';
import { SendMessageCommand } from '../send-message.command';
import { SendMessageResult, SendMessageStatus, SendMessageType } from '../send-message-type.usecase';

const LOG_CONTEXT = 'Throttle';

@Injectable()
export class Throttle extends SendMessageType {
  constructor(
    protected messageRepository: MessageRepository,
    protected createExecutionDetails: CreateExecutionDetails,
    private jobRepository: JobRepository
  ) {
    super(messageRepository, createExecutionDetails);
  }

  @InstrumentUsecase()
  public async execute(command: SendMessageCommand): Promise<SendMessageResult> {
    const throttleMetadata = command.job.step.metadata as IThrottleMetadata;

    if (!throttleMetadata) {
      Logger.error('Throttle metadata is missing', LOG_CONTEXT);
      return {
        status: SendMessageStatus.SUCCESS,
        job: command.job,
      };
    }

    const isThrottled = await this.checkThrottle(command, throttleMetadata);

    if (isThrottled) {
      await this.createExecutionDetails.execute(
        CreateExecutionDetailsCommand.create({
          ...CreateExecutionDetailsCommand.getDetailsFromJob(command.job),
          detail: DetailEnum.STEP_THROTTLED,
          source: ExecutionDetailsSourceEnum.INTERNAL,
          status: ExecutionDetailsStatusEnum.SUCCESS,
          isTest: false,
          isRetry: false,
          raw: JSON.stringify({
            throttled: true,
            metadata: throttleMetadata,
            reason: 'Throttle limit exceeded for the given window',
          }),
        })
      );

      Logger.debug(
        `Workflow execution throttled for subscriber ${command._subscriberId}, step ${command.job.step.uuid}`,
        LOG_CONTEXT
      );

      return {
        status: SendMessageStatus.THROTTLED,
        job: command.job,
      };
    }

    await this.createExecutionDetails.execute(
      CreateExecutionDetailsCommand.create({
        ...CreateExecutionDetailsCommand.getDetailsFromJob(command.job),
        detail: DetailEnum.STEP_COMPLETED,
        source: ExecutionDetailsSourceEnum.INTERNAL,
        status: ExecutionDetailsStatusEnum.SUCCESS,
        isTest: false,
        isRetry: false,
        raw: JSON.stringify({
          throttled: false,
          metadata: throttleMetadata,
        }),
      })
    );

    return {
      status: SendMessageStatus.SUCCESS,
      job: command.job,
    };
  }

  private async checkThrottle(command: SendMessageCommand, metadata: IThrottleMetadata): Promise<boolean> {
    const windowStartTime = this.calculateWindowStartTime(metadata);
    const throttleKey = this.buildThrottleKey(command, metadata);

    // Count completed jobs within the throttle window
    const executionCount = await this.jobRepository.count({
      _environmentId: command.environmentId,
      _subscriberId: command._subscriberId,
      _templateId: command.job._templateId,
      'step.uuid': command.job.step.uuid,
      status: { $in: [JobStatusEnum.COMPLETED] },
      createdAt: { $gte: windowStartTime },
    });

    const threshold = metadata.threshold || 1;

    Logger.debug(
      `Throttle check: ${executionCount}/${threshold} executions in window starting ${windowStartTime.toISOString()}`,
      LOG_CONTEXT
    );

    return executionCount >= threshold;
  }

  private calculateWindowStartTime(metadata: IThrottleMetadata): Date {
    const now = new Date();
    const windowMs = this.convertToMilliseconds(metadata.window, metadata.unit);

    return new Date(now.getTime() - windowMs);
  }

  private convertToMilliseconds(amount: number, unit: DigestUnitEnum): number {
    const conversions = {
      [DigestUnitEnum.SECONDS]: 1000,
      [DigestUnitEnum.MINUTES]: 60 * 1000,
      [DigestUnitEnum.HOURS]: 60 * 60 * 1000,
      [DigestUnitEnum.DAYS]: 24 * 60 * 60 * 1000,
      [DigestUnitEnum.WEEKS]: 7 * 24 * 60 * 60 * 1000,
      [DigestUnitEnum.MONTHS]: 30 * 24 * 60 * 60 * 1000, // Approximation
    };

    return amount * conversions[unit];
  }

  private buildThrottleKey(command: SendMessageCommand, metadata: IThrottleMetadata): string {
    if (metadata.throttleKey) {
      return metadata.throttleKey;
    }

    // Default throttle key combines template, step, and subscriber
    return `${command.job._templateId}_${command.job.step.uuid}_${command._subscriberId}`;
  }
}
