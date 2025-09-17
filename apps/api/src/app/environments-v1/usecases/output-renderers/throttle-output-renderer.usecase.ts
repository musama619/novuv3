import { Injectable } from '@nestjs/common';
import { InstrumentUsecase } from '@novu/application-generic';
import { RenderCommand } from './render-command';

@Injectable()
export class ThrottleOutputRendererUsecase {
  @InstrumentUsecase()
  execute(renderCommand: RenderCommand): {
    amount: number;
    unit: 'minutes' | 'hours' | 'days';
    threshold?: number;
    throttleKey?: string;
  } {
    const { skip: _skip, ...outputControls } = renderCommand.controlValues ?? {};

    return {
      amount: outputControls.amount as number,
      unit: outputControls.unit as 'minutes' | 'hours' | 'days',
      threshold: outputControls.threshold as number | undefined,
      throttleKey: outputControls.throttleKey as string | undefined,
    };
  }
}
