import { useFormContext } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/primitives/form/form';
import { Input } from '@/components/primitives/input';
import { useSaveForm } from '@/components/workflow-editor/steps/save-form-context';

const throttleKeyKey = 'throttleKey';

export const ThrottleKey = () => {
  const { control } = useFormContext();
  const { saveForm } = useSaveForm();

  return (
    <FormField
      name={`controlValues.${throttleKeyKey}`}
      control={control}
      render={({ field }) => (
        <FormItem>
          <FormLabel tooltip="Optional key for grouping throttle rules. If not provided, defaults to workflow and subscriber combination.">
            Throttle key (optional)
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              placeholder="custom-throttle-key"
              onChange={(e) => {
                field.onChange(e.target.value || undefined);
                saveForm();
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
