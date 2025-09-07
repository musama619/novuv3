import { Injectable } from '@nestjs/common';
import { InstrumentUsecase } from '@novu/application-generic';
import { ThrottleRenderOutput } from '@novu/shared';
import { RenderCommand } from './render-command';

@Injectable()
export class ThrottleOutputRendererUsecase {
  @InstrumentUsecase()
  execute(renderCommand: RenderCommand): ThrottleRenderOutput {
    const { skip: _skip, ...outputControls } = renderCommand.controlValues ?? {};

    // Return the throttle controls/output - this matches the output schema
    return {
      type: 'throttle',
      window: outputControls.window || 1,
      unit: outputControls.unit || 'hours',
      threshold: outputControls.threshold,
      throttleKey: outputControls.throttleKey,
    } as ThrottleRenderOutput;
  }
}
