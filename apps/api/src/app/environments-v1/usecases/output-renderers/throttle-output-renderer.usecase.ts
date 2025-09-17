import { Injectable } from '@nestjs/common';
import { InstrumentUsecase } from '@novu/application-generic';
import { RenderCommand } from './render-command';

@Injectable()
export class ThrottleOutputRendererUsecase {
  @InstrumentUsecase()
  execute(renderCommand: RenderCommand): {
    type: 'fixed' | 'dynamic';
    amount?: number;
    unit?: 'minutes' | 'hours' | 'days';
    dynamicKey?: string;
    threshold?: number;
    throttleKey?: string;
  } {
    const { skip: _skip, ...outputControls } = renderCommand.controlValues ?? {};

    return {
      type: (outputControls.type as 'fixed' | 'dynamic') || 'fixed',
      amount: outputControls.amount as number | undefined,
      unit: outputControls.unit as 'minutes' | 'hours' | 'days' | undefined,
      dynamicKey: outputControls.dynamicKey as string | undefined,
      threshold: outputControls.threshold as number | undefined,
      throttleKey: outputControls.throttleKey as string | undefined,
    };
  }
}
