import { Novu } from '@novu/api';
import {
  JobRepository,
  JobStatusEnum,
  MessageRepository,
  NotificationTemplateEntity,
  SubscriberEntity,
} from '@novu/dal';
import { StepTypeEnum } from '@novu/shared';
import { SubscribersService, UserSession } from '@novu/testing';
import { expect } from 'chai';
import { initNovuClassSdk } from '../../shared/helpers/e2e/sdk/e2e-sdk.helper';
import { pollForJobStatusChange } from './utils/poll-for-job-status-change.util';

describe('Trigger event - Throttle triggered events - /v1/events/trigger (POST) #novu-v2', () => {
  let session: UserSession;
  let template: NotificationTemplateEntity;
  let subscriber: SubscriberEntity;
  let subscriberService: SubscribersService;
  const jobRepository = new JobRepository();
  const messageRepository = new MessageRepository();
  let novuClient: Novu;

  beforeEach(async () => {
    session = new UserSession();
    await session.initialize();
    template = await session.createTemplate();
    subscriberService = new SubscribersService(session.organization._id, session.environment._id);
    subscriber = await subscriberService.createSubscriber();
    novuClient = initNovuClassSdk(session);
  });

  const triggerEvent = async (payload: { [k: string]: any } | undefined, transactionId?: string): Promise<void> => {
    await novuClient.trigger(
      {
        transactionId,
        workflowId: template.triggers[0].identifier,
        to: [subscriber.subscriberId],
        payload,
      },
      transactionId
    );
  };

  it('should not throttle when threshold is not met', async () => {
    template = await session.createTemplate({
      steps: [
        {
          type: StepTypeEnum.THROTTLE,
          content: '',
          metadata: {
            window: 5,
            unit: 'seconds',
            threshold: 3,
          } as any,
        },
        {
          type: StepTypeEnum.IN_APP,
          content: 'Hello world {{customVar}}' as string,
        },
      ],
    });

    // Trigger 2 events (below threshold of 3)
    await triggerEvent({
      customVar: 'First event',
    });

    await triggerEvent({
      customVar: 'Second event',
    });

    await session.waitForJobCompletion(template?._id);

    const throttleJobs = await jobRepository.find({
      _environmentId: session.environment._id,
      _templateId: template._id,
      type: StepTypeEnum.THROTTLE,
    });

    expect(throttleJobs?.length).to.equal(2);

    // Both throttle jobs should be completed (not skipped)
    const completedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.COMPLETED);
    expect(completedThrottleJobs?.length).to.equal(2);

    // Both in-app messages should be created
    const messages = await messageRepository.find({
      _environmentId: session.environment._id,
      _subscriberId: subscriber._id,
      channel: StepTypeEnum.IN_APP,
    });

    expect(messages?.length).to.equal(2);
    expect(messages[0].content).to.include('First event');
    expect(messages[1].content).to.include('Second event');
  });

  it('should throttle when threshold is exceeded', async () => {
    template = await session.createTemplate({
      steps: [
        {
          type: StepTypeEnum.THROTTLE,
          content: '',
          metadata: {
            window: 5,
            unit: 'seconds',
            threshold: 2,
          } as any,
        },
        {
          type: StepTypeEnum.IN_APP,
          content: 'Hello world {{customVar}}' as string,
        },
      ],
    });

    // Trigger 3 events (exceeds threshold of 2)
    await triggerEvent({
      customVar: 'First event',
    });

    await triggerEvent({
      customVar: 'Second event',
    });

    await triggerEvent({
      customVar: 'Third event - should be throttled',
    });

    await session.waitForJobCompletion(template?._id);

    const throttleJobs = await jobRepository.find({
      _environmentId: session.environment._id,
      _templateId: template._id,
      type: StepTypeEnum.THROTTLE,
    });

    expect(throttleJobs?.length).to.equal(3);

    // First two should be completed, third should be skipped
    const completedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.COMPLETED);
    const skippedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.SKIPPED);

    expect(completedThrottleJobs?.length).to.equal(2);
    expect(skippedThrottleJobs?.length).to.equal(1);

    // Check throttle result in skipped job
    const skippedJob = skippedThrottleJobs[0];
    expect(skippedJob.stepOutput).to.be.ok;
    expect(skippedJob.stepOutput?.throttled).to.equal(true);
    expect(skippedJob.stepOutput?.threshold).to.equal(2);
    expect(skippedJob.stepOutput?.executionCount).to.be.greaterThan(2);

    // Only 2 in-app messages should be created
    const messages = await messageRepository.find({
      _environmentId: session.environment._id,
      _subscriberId: subscriber._id,
      channel: StepTypeEnum.IN_APP,
    });

    expect(messages?.length).to.equal(2);
  });

  it('should handle 20 concurrent triggers and only generate single message when threshold is 1', async () => {
    template = await session.createTemplate({
      steps: [
        {
          type: StepTypeEnum.THROTTLE,
          content: '',
          metadata: {
            window: 10,
            unit: 'seconds',
            threshold: 1,
          } as any,
        },
        {
          type: StepTypeEnum.IN_APP,
          content: 'Throttled message {{customVar}}' as string,
        },
      ],
    });

    // Trigger 20 concurrent events
    const promises: Promise<void>[] = [];
    for (let i = 1; i <= 20; i++) {
      promises.push(
        triggerEvent({
          customVar: `Event ${i}`,
        })
      );
    }

    await Promise.all(promises);

    await session.waitForWorkflowQueueCompletion();
    await session.waitForSubscriberQueueCompletion();
    await session.waitForStandardQueueCompletion();

    const throttleJobs = await pollForJobStatusChange({
      jobRepository,
      query: {
        _environmentId: session.environment._id,
        _templateId: template._id,
        type: StepTypeEnum.THROTTLE,
      },
      findMultiple: true,
    });

    expect(throttleJobs?.length).to.equal(20);

    // Only 1 should be completed, 19 should be skipped
    const completedThrottleJobs = throttleJobs?.filter((job) => job.status === JobStatusEnum.COMPLETED) || [];
    const skippedThrottleJobs = throttleJobs?.filter((job) => job.status === JobStatusEnum.SKIPPED) || [];

    expect(completedThrottleJobs?.length).to.equal(1);
    expect(skippedThrottleJobs?.length).to.equal(19);

    // Verify throttle results in skipped jobs
    for (const job of skippedThrottleJobs) {
      expect(job.stepOutput).to.be.ok;
      expect(job.stepOutput?.throttled).to.equal(true);
      expect(job.stepOutput?.threshold).to.equal(1);
    }

    // Only 1 in-app message should be created
    const messages = await messageRepository.find({
      _environmentId: session.environment._id,
      _subscriberId: subscriber._id,
      channel: StepTypeEnum.IN_APP,
    });

    expect(messages?.length).to.equal(1);
  });

  it('should throttle based on throttleKey', async () => {
    template = await session.createTemplate({
      steps: [
        {
          type: StepTypeEnum.THROTTLE,
          content: '',
          metadata: {
            window: 5,
            unit: 'seconds',
            threshold: 1,
            throttleKey: 'userId',
          } as any,
        },
        {
          type: StepTypeEnum.IN_APP,
          content: 'Hello user {{userId}}' as string,
        },
      ],
    });

    // Trigger events with different throttle keys
    await triggerEvent({
      userId: 'user1',
    });

    await triggerEvent({
      userId: 'user2',
    });

    await triggerEvent({
      userId: 'user1', // Should be throttled
    });

    await session.waitForJobCompletion(template?._id);

    const throttleJobs = await jobRepository.find({
      _environmentId: session.environment._id,
      _templateId: template._id,
      type: StepTypeEnum.THROTTLE,
    });

    expect(throttleJobs?.length).to.equal(3);

    // 2 should be completed (user1 first, user2), 1 should be skipped (user1 second)
    const completedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.COMPLETED);
    const skippedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.SKIPPED);

    expect(completedThrottleJobs?.length).to.equal(2);
    expect(skippedThrottleJobs?.length).to.equal(1);

    // 2 in-app messages should be created (one for each user)
    const messages = await messageRepository.find({
      _environmentId: session.environment._id,
      _subscriberId: subscriber._id,
      channel: StepTypeEnum.IN_APP,
    });

    expect(messages?.length).to.equal(2);

    const user1Messages = messages.filter((msg) => (msg.content as string).includes('user1'));
    const user2Messages = messages.filter((msg) => (msg.content as string).includes('user2'));

    expect(user1Messages?.length).to.equal(1);
    expect(user2Messages?.length).to.equal(1);
  });

  it('should throttle with different time units', async () => {
    template = await session.createTemplate({
      steps: [
        {
          type: StepTypeEnum.THROTTLE,
          content: '',
          metadata: {
            window: 1,
            unit: 'minutes',
            threshold: 2,
          } as any,
        },
        {
          type: StepTypeEnum.IN_APP,
          content: 'Throttled by minutes {{customVar}}' as string,
        },
      ],
    });

    // Trigger 3 events quickly (should exceed threshold of 2 within 1 minute)
    await triggerEvent({
      customVar: 'First event',
    });

    await triggerEvent({
      customVar: 'Second event',
    });

    await triggerEvent({
      customVar: 'Third event - should be throttled',
    });

    await session.waitForJobCompletion(template?._id);

    const throttleJobs = await jobRepository.find({
      _environmentId: session.environment._id,
      _templateId: template._id,
      type: StepTypeEnum.THROTTLE,
    });

    expect(throttleJobs?.length).to.equal(3);

    const completedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.COMPLETED);
    const skippedThrottleJobs = throttleJobs.filter((job) => job.status === JobStatusEnum.SKIPPED);

    expect(completedThrottleJobs?.length).to.equal(2);
    expect(skippedThrottleJobs?.length).to.equal(1);

    // Check that the throttle window is correctly calculated for minutes
    const skippedJob = skippedThrottleJobs[0];
    expect(skippedJob.stepOutput?.threshold).to.equal(2);

    const messages = await messageRepository.find({
      _environmentId: session.environment._id,
      _subscriberId: subscriber._id,
      channel: StepTypeEnum.IN_APP,
    });

    expect(messages?.length).to.equal(2);
  });

  it('should skip child jobs when throttle step is skipped', async () => {
    template = await session.createTemplate({
      steps: [
        {
          type: StepTypeEnum.THROTTLE,
          content: '',
          metadata: {
            window: 5,
            unit: 'seconds',
            threshold: 1,
          } as any,
        },
        {
          type: StepTypeEnum.IN_APP,
          content: 'First message {{customVar}}' as string,
        },
        {
          type: StepTypeEnum.EMAIL,
          content: 'Follow-up email {{customVar}}' as string,
        },
      ],
    });

    // Trigger 2 events (second should be throttled)
    await triggerEvent({
      customVar: 'First event',
    });

    await triggerEvent({
      customVar: 'Second event - should be throttled',
    });

    await session.waitForJobCompletion(template?._id);

    // Check all jobs
    const allJobs = await jobRepository.find({
      _environmentId: session.environment._id,
      _templateId: template._id,
    });

    // First workflow: throttle (completed) + in-app (completed) + email (completed)
    // Second workflow: throttle (skipped) + in-app (skipped) + email (skipped)
    expect(allJobs?.length).to.equal(6);

    const completedJobs = allJobs.filter((job) => job.status === JobStatusEnum.COMPLETED);
    const skippedJobs = allJobs.filter((job) => job.status === JobStatusEnum.SKIPPED);

    expect(completedJobs?.length).to.equal(3);
    expect(skippedJobs?.length).to.equal(3);

    // Verify that child jobs are properly skipped when throttle is skipped
    const throttleJobs = allJobs.filter((job) => job.type === StepTypeEnum.THROTTLE);
    const skippedThrottleJob = throttleJobs.find((job) => job.status === JobStatusEnum.SKIPPED);

    expect(skippedThrottleJob).to.be.ok;

    // Find child jobs of the skipped throttle job
    const childJobs = allJobs.filter(
      (job) => job._notificationId === skippedThrottleJob?._notificationId && job.type !== StepTypeEnum.THROTTLE
    );

    for (const childJob of childJobs) {
      expect(childJob.status).to.equal(JobStatusEnum.SKIPPED);
    }

    // Only 1 in-app and 1 email message should be created
    const inAppMessages = await messageRepository.find({
      _environmentId: session.environment._id,
      _subscriberId: subscriber._id,
      channel: StepTypeEnum.IN_APP,
    });

    expect(inAppMessages?.length).to.equal(1);
  });
});
