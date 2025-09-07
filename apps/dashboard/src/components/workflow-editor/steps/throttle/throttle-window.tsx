import { TimeUnitEnum } from '@novu/shared';
import { useMemo } from 'react';
import { AmountInput } from '@/components/amount-input';
import { FormLabel } from '@/components/primitives/form/form';
import { useSaveForm } from '@/components/workflow-editor/steps/save-form-context';
import { TIME_UNIT_OPTIONS } from '@/components/workflow-editor/steps/time-units';
import { useWorkflow } from '@/components/workflow-editor/workflow-provider';

const windowKey = 'window';
const unitKey = 'unit';

export const ThrottleWindow = () => {
  const { step } = useWorkflow();
  const { saveForm } = useSaveForm();
  const { dataSchema } = step?.controls ?? {};

  const minWindowValue = useMemo(() => {
    if (typeof dataSchema === 'object') {
      const windowField = dataSchema.properties?.window;

      if (typeof windowField === 'object' && windowField.type === 'number') {
        return windowField.minimum ?? 1;
      }
    }

    return 1;
  }, [dataSchema]);

  return (
    <div className="flex h-full flex-col gap-2">
      <FormLabel
        required
        tooltip="Sets the time window for throttling. Only the specified number of executions are allowed within this window."
      >
        Throttle window
      </FormLabel>
      <AmountInput
        fields={{ inputKey: `controlValues.${windowKey}`, selectKey: `controlValues.${unitKey}` }}
        options={TIME_UNIT_OPTIONS}
        defaultOption={TimeUnitEnum.HOURS}
        onValueChange={() => saveForm()}
        min={minWindowValue}
      />
    </div>
  );
};
